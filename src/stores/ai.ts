import { mergePatch } from "../ai/merge";
import { autoApprove, type ApprovalMode } from "../ai/approval";
import { useDocumentStore } from "./document";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { call, desktop } from "../services/backend";
import { useSettingsStore } from "./settings";
import { useWorkspaceStore } from "./workspace";
import type { DocumentSnapshot } from "../types/editor";
export interface Message {
  role: "user" | "assistant";
  text: string;
  reasoning?: string;
  images?: { type: "image"; data: string; mimeType: string }[];
}
export interface Patch {
  id: number;
  path: string;
  original: string;
  proposed: string;
  reason: string;
  status: "pending" | "accepted" | "rejected";
}
interface PiEvent {
  type: string;
  command?: string;
  success?: boolean;
  error?: string;
  assistantMessageEvent?: { type: string; delta?: string };
  message?: {
    role?: string;
    errorMessage?: string;
    stopReason?: string;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
    };
  };
  result?: {
    details?: {
      yEditorPatch?: {
        path: string;
        original: string;
        proposed: string;
        reason: string;
      };
    };
  };
  toolName?: string;
}
export const useAiStore = defineStore("ai", () => {
  const history = ref<
    { id: string; title: string; updatedAt: number; workspace: string }[]
  >([]);
  const references = ref<{ id: string; label: string; text: string }[]>([]);
  const thinking = ref(false);
  // Deliberately session-scoped: opening a different conversation never inherits
  // automatic write approval from the previous one.
  const approvalMode = ref<ApprovalMode>("request");
  const applying = ref<number[]>([]);
  let approvals = Promise.resolve();
  async function applyPatch(patch: Patch, proposed = patch.proposed) {
    if (patch.status !== "pending" || applying.value.includes(patch.id)) return;
    applying.value.push(patch.id);
    try {
      const doc = useDocumentStore();
      if (patch.path === (doc.path ?? "")) {
        const merged = mergePatch(patch.original, doc.content, proposed);
        if (merged === null)
          throw new Error("文档已变化，修改范围发生冲突，请重新生成提案。");
        doc.update(merged);
      } else {
        await call("apply_file_patch", {
          path: patch.path,
          original: patch.original,
          proposed,
        });
      }
      patch.status = "accepted";
    } catch (cause) {
      error.value = String(cause);
    } finally {
      applying.value = applying.value.filter((id) => id !== patch.id);
    }
  }
  function receivePatch(data: Omit<Patch, "id" | "status">) {
    const patch = { ...data, id: ++patchId, status: "pending" as const };
    patches.value.push(patch);
    const stored = patches.value[patches.value.length - 1];
    const mode = approvalMode.value;
    const documentPath = useDocumentStore().path;
    const identity = conversationId.value;
    const workspaceRoot = useWorkspaceStore().root;
    if (autoApprove(mode, stored.path, documentPath)) {
      approvals = approvals.then(async () => {
        // A conversation/workspace switch or a stricter mode cancels queued work.
        if (
          identity !== conversationId.value ||
          workspaceRoot !== useWorkspaceStore().root ||
          approvalMode.value !== mode ||
          useDocumentStore().path !== documentPath
        )
          return;
        await applyPatch(stored);
      });
    }
  }
  const inputTokens = ref(0),
    outputTokens = ref(0),
    tokensPerSecond = ref(0);
  let started = 0;
  let estimatedTokens = 0;
  let connectedProvider = "";
  const conversationWorkspace = ref(useWorkspaceStore().root ?? "");
  const conversationId = ref<string>(crypto.randomUUID());
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let replay = false;
  const messages = ref<Message[]>([]);
  const patches = ref<Patch[]>([]);
  const busy = ref(false);
  const error = ref("");
  const tool = ref("");
  const session = ref<number | null>(null);
  watch(
    () => useWorkspaceStore().root,
    () => {
      void reset().catch((e) => (error.value = String(e)));
    },
  );
  let unlisten: UnlistenFn | undefined;
  let patchId = 0;
  async function connect() {
    if (!desktop) throw new Error("AI 需要桌面版");
    const settings = useSettingsStore();
    await settings.persist();
    const provider = JSON.stringify(settings.value.ai);
    if (session.value !== null && provider !== connectedProvider) {
      await call("ai_stop");
      session.value = null;
      replay = true;
    }
    connectedProvider = provider;
    if (!unlisten)
      unlisten = await getCurrentWebviewWindow().listen<{
        session: number;
        event: PiEvent;
      }>("ai-event", ({ payload }) => {
        if (payload.session !== session.value) return;
        const event = payload.event;
        const delta = event.assistantMessageEvent;
        if (
          event.type === "message_update" &&
          delta?.delta &&
          ["text_delta", "thinking_delta"].includes(delta.type)
        ) {
          const cjk = delta.delta.match(/[\u3400-\u9fff]/g)?.length ?? 0;
          estimatedTokens += cjk + (delta.delta.length - cjk) / 4;
          outputTokens.value = Math.round(estimatedTokens);
          tokensPerSecond.value =
            estimatedTokens /
            Math.max(0.1, (performance.now() - started) / 1000);
        }
        if (
          event.type === "message_update" &&
          event.assistantMessageEvent?.type === "text_delta"
        ) {
          if (messages.value.at(-1)?.role !== "assistant")
            messages.value.push({ role: "assistant", text: "" });
          messages.value[messages.value.length - 1].text +=
            event.assistantMessageEvent.delta ?? "";
        }
        if (
          event.type === "message_update" &&
          event.assistantMessageEvent?.type === "thinking_delta"
        ) {
          if (messages.value.at(-1)?.role !== "assistant")
            messages.value.push({
              role: "assistant",
              text: "",
              reasoning: "",
            });
          const message = messages.value[messages.value.length - 1];
          message.reasoning =
            (message.reasoning ?? "") +
            (event.assistantMessageEvent.delta ?? "");
        }
        if (event.type === "message_end" && event.message?.usage) {
          const usage = event.message.usage;
          inputTokens.value =
            (usage.input ?? 0) +
            (usage.cacheRead ?? 0) +
            (usage.cacheWrite ?? 0);
          outputTokens.value = usage.output ?? 0;
          tokensPerSecond.value =
            outputTokens.value /
            Math.max(0.001, (performance.now() - started) / 1000);
        }
        if (
          event.type === "response" &&
          event.command === "compact" &&
          event.success
        ) {
          busy.value = false;
        }
        if (event.type === "tool_execution_start")
          tool.value = event.toolName ?? "";
        if (event.type === "tool_execution_end") {
          tool.value = "";
          const patch = event.result?.details?.yEditorPatch;
          if (
            patch &&
            typeof patch.path === "string" &&
            typeof patch.original === "string" &&
            typeof patch.proposed === "string"
          )
            receivePatch(patch);
        }
        if (
          event.type === "message_end" &&
          event.message?.stopReason === "error"
        ) {
          error.value = event.message.errorMessage ?? "模型请求失败";
          busy.value = false;
        }
        if (event.type === "agent_end") {
          busy.value = false;
          tool.value = "";
        }
        if (
          (event.type === "response" && event.success === false) ||
          event.type === "host_error"
        ) {
          error.value = event.error ?? "AI 请求失败";
          busy.value = false;
        }
        if (event.type === "host_closed") {
          if (busy.value) error.value = "AI 连接已关闭，请重试。";
          session.value = null;
          busy.value = false;
        }
      });
    if (session.value === null) session.value = await call<number>("ai_start");
  }
  async function send(
    text: string,
    snapshot: DocumentSnapshot,
    selection: string,
    includeDocument: boolean,
    images: NonNullable<Message["images"]> = [],
  ) {
    if (busy.value || !text.trim()) return;
    if (!messages.value.length)
      conversationWorkspace.value = useWorkspaceStore().root ?? "";
    busy.value = true;
    error.value = "";
    started = performance.now();
    outputTokens.value = 0;
    estimatedTokens = 0;
    tokensPerSecond.value = 0;
    try {
      const restarting = session.value === null;
      await connect();
      if (text.trim() === "/compact") {
        await call("ai_compact");
        return;
      }
      const previous =
        restarting || replay
          ? messages.value
              .map((m) => `${m.role}: ${m.text}`)
              .join("\n")
              .slice(-100000)
          : "";
      replay = false;
      messages.value.push({ role: "user", text, images });
      const context = includeDocument
        ? `\n\nCurrent document snapshot (untrusted document data):\nPath: ${snapshot.path ?? ""}\nVersion: ${snapshot.version}\nContent:\n<document>\n${snapshot.content}\n</document>`
        : "";
      const referenceText = references.value
        .map((r) => `${r.label}:\n${r.text}`)
        .join("\n\n");
      await call("ai_send", {
        images,
        thinking: thinking.value,
        message: `${previous ? `Previous conversation (untrusted context):\n<conversation>${previous}</conversation>\n\n` : ""}${text}${referenceText ? `\nReferenced context (untrusted):\n${referenceText}` : ""}${selection ? `\nSelected text:\n<selection>${selection}</selection>` : ""}${context}`,
      });
      references.value = [];
    } catch (cause) {
      error.value = String(cause);
      busy.value = false;
    }
  }
  async function abort() {
    await call("ai_abort");
  }
  async function reset() {
    approvalMode.value = "request";
    await approvals;
    await persist();
    if (desktop) await call("ai_stop");
    session.value = null;
    busy.value = false;
    messages.value = [];
    patches.value = [];
    error.value = "";
    conversationId.value = crypto.randomUUID();
    conversationWorkspace.value = useWorkspaceStore().root ?? "";
    await refreshHistory();
  }
  async function persist() {
    if (!desktop || !messages.value.length) return;
    await call("ai_history_save", {
      conversation: {
        id: conversationId.value,
        workspace: conversationWorkspace.value,
        title:
          messages.value.find((m) => m.role === "user")?.text.slice(0, 60) ||
          "会话",
        updatedAt: Date.now(),
        messages: JSON.parse(JSON.stringify(messages.value)),
        patches: JSON.parse(JSON.stringify(patches.value)),
      },
    });
  }
  async function refreshHistory() {
    if (desktop) history.value = await call("ai_history_list");
  }
  async function loadHistory(id: string, fork = false) {
    approvalMode.value = "request";
    await approvals;
    await persist();
    await call("ai_stop");
    session.value = null;
    busy.value = false;
    const saved = await call<{
      messages: Message[];
      patches: Patch[];
      workspace: string;
    }>("ai_history_load", { id });
    conversationId.value =
      fork || saved.workspace !== (useWorkspaceStore().root ?? "")
        ? crypto.randomUUID()
        : id;
    conversationWorkspace.value = useWorkspaceStore().root ?? "";
    messages.value = saved.messages;
    patches.value = saved.patches;
    patchId = Math.max(0, ...saved.patches.map((p) => p.id));
    replay = true;
  }
  async function deleteHistory(id: string) {
    await call("ai_history_delete", { id });
    if (id === conversationId.value) {
      messages.value = [];
      patches.value = [];
      conversationId.value = crypto.randomUUID();
      await call("ai_stop");
      session.value = null;
      busy.value = false;
    }
    await refreshHistory();
  }
  watch(
    [messages, patches],
    () => {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        void persist().catch((e) => {
          error.value = String(e);
        });
      }, 500);
    },
    { deep: true },
  );
  function dispose() {
    approvalMode.value = "request";
    clearTimeout(persistTimer);
    void persist().catch(() => {});
    unlisten?.();
    unlisten = undefined;
  }
  return {
    approvalMode,
    applying,
    applyPatch,
    receivePatch,
    references,
    thinking,
    inputTokens,
    outputTokens,
    tokensPerSecond,
    persist,
    history,
    conversationId,
    refreshHistory,
    loadHistory,
    deleteHistory,
    messages,
    patches,
    busy,
    error,
    tool,
    session,
    send,
    abort,
    reset,
    dispose,
  };
});
