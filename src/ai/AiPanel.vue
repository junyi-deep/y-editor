<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ModelPicker from "@/components/ModelPicker.vue";

import { computed, onMounted, ref, watch, nextTick } from "vue";
import { patchGroups, selectPatch } from "./partial";
import { useAiStore, type Patch } from "../stores/ai";
import { useDocumentStore } from "../stores/document";
import { useSettingsStore } from "../stores/settings";
import { useEditorStore } from "../stores/editor";
import { mergePatch } from "./merge";
import { call } from "../services/backend";
import StreamMarkdown from "./StreamMarkdown.vue";
import ResourceDialog from "./ResourceDialog.vue";
import UiIcon from "../components/UiIcon.vue";
import { useWorkspaceStore } from "../stores/workspace";
defineProps<{ selection: string }>();
const ai = useAiStore();
const doc = useDocumentStore();
const settings = useSettingsStore();
const ui = useEditorStore();
const workspace = useWorkspaceStore();
const historyOpen = ref(false),
  historyQuery = ref(""),
  allWorkspaces = ref(false),
  resourcesOpen = ref(false);
const histories = computed(() =>
  ai.history.filter(
    (h) =>
      (allWorkspaces.value || h.workspace === (workspace.root ?? "")) &&
      h.title.toLowerCase().includes(historyQuery.value.toLowerCase()),
  ),
);
const models = ref<string[]>([]),
  fetchingModels = ref(false);
const images = ref<{ type: "image"; data: string; mimeType: string }[]>([]);
const catalog = ref<
  { id: string; name: string; kind: string; path?: string }[]
>([]);
const imageFiles = ref<
  { id: string; name: string; kind: string; path: string }[]
>([]);
const enabled = ref<Record<string, boolean>>({});
const conversation = ref<HTMLElement>();
const prompt = ref("");
function startPrompt(text: string) {
  prompt.value = text;
  nextTick(() =>
    conversation.value
      ?.closest(".ai-panel")
      ?.querySelector<HTMLTextAreaElement>("textarea")
      ?.focus(),
  );
}
const suggestions = computed(() => {
  const match = prompt.value.match(/(?:^|\s)([@/])([^\s]*)$/);
  if (!match) return [];
  const term = match[2].toLowerCase();
  const resources = catalog.value.filter(
    (r) =>
      enabled.value[r.id] &&
      (match[1] === "@"
        ? ["knowledge", "repository"].includes(r.kind)
        : ["skill", "mcp", "prompt"].includes(r.kind)),
  );
  const files =
    match[1] === "@"
      ? [
          ...workspace.files
            .filter((f) => !f.directory && !isImage(f.name))
            .map((f) => ({
              id: f.path,
              name: f.relative,
              kind: "file",
              path: f.path,
            })),
          ...imageFiles.value,
        ]
      : [
          { id: "compact", name: "compact — 压缩上下文", kind: "builtin" },
          { id: "new", name: "new — 新会话", kind: "builtin" },
        ];
  return [...files, ...resources]
    .filter((r) => r.name.toLowerCase().includes(term))
    .slice(0, 12);
});
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const isImage = (name: string) => IMAGE.test(name);
/**
 * Images are referenceable through @ instead of an upload control. Listed
 * panel-locally: flipping workspace.allFiles would also change the file sidebar.
 */
async function refreshImages() {
  if (!workspace.root) {
    imageFiles.value = [];
    return;
  }
  try {
    const entries = await call<
      { name: string; relative: string; path: string; directory: boolean }[]
    >("list_files", { hidden: false, allFiles: true });
    imageFiles.value = entries
      .filter((entry) => !entry.directory && isImage(entry.name))
      .map((entry) => ({
        id: entry.path,
        name: entry.relative,
        kind: "image",
        path: entry.path,
      }));
  } catch (e) {
    ai.error = String(e);
  }
}
async function refreshCatalog() {
  try {
    const [r, m, f] = await Promise.all([
      call<typeof catalog.value>("resource_list"),
      call<typeof catalog.value>("mcp_list"),
      call<Record<string, boolean>>("workspace_resources"),
    ]);
    catalog.value = [
      ...r,
      ...m.map((x) => ({ ...x, id: `mcp:${x.id}`, kind: "mcp" })),
    ];
    enabled.value = f;
  } catch (e) {
    ai.error = String(e);
  }
}
async function selectSuggestion(item: (typeof catalog.value)[number]) {
  try {
    if (item.kind === "image") {
      if (!item.path) throw new Error("无法读取图片");
      if (images.value.length >= 8) throw new Error("最多 8 张图片");
      // image_read authorizes a path against the workspace root; the image is
      // its own anchor here, so no document has to be open.
      const dataUrl = await call<string>("image_read", {
        documentPath: item.path,
        source: item.path,
      });
      const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
      if (!match) throw new Error("无法读取图片");
      // ai_send caps the base64 payload at 14M characters; failing here is
      // legible, failing there loses the conversation to an unsaveable record.
      if (match[2].length > 14_000_000)
        throw new Error("图片过大（超过 10 MB）");
      images.value.push({ type: "image", data: match[2], mimeType: match[1] });
      prompt.value = prompt.value.replace(/[@/][^\s]*$/, "");
      return;
    }
    if (item.kind === "builtin") {
      prompt.value = item.id === "compact" ? "/compact" : "";
      if (item.id === "new") await ai.reset();
      return;
    }
    let text =
      item.kind === "mcp"
        ? `Use enabled MCP server ${item.name}.`
        : item.kind === "file"
          ? (
              await call<{ content: string }>("read_document", {
                path: item.path,
                remember: false,
              })
            ).content
          : await call<string>("resource_content", { id: item.id });
    text = text.slice(0, 100000);
    ai.references.push({ id: crypto.randomUUID(), label: item.name, text });
    prompt.value = prompt.value.replace(/[@/][^\s]*$/, "");
  } catch (e) {
    ai.error = String(e);
  }
}
async function fetchModels() {
  fetchingModels.value = true;
  try {
    await settings.persist();
    models.value = await call<string[]>("ai_models", {
      provider: settings.value.ai,
    });
  } catch (e) {
    ai.error = String(e);
  } finally {
    fetchingModels.value = false;
  }
}
async function selectProvider(value: unknown) {
  if (value === "__add") {
    ui.settingsCategory = "AI";
    ui.settingsOpen = true;
    return;
  }
  const profile = settings.value.providerProfiles.find(
    (p) => p.provider.apiKeyRef === value,
  );
  if (profile) {
    // Choosing a connection here is also the decision to use it.
    settings.value.ai = { ...profile.provider, enabled: true };
    await settings.persist();
    models.value = [];
    await fetchModels();
  }
}
/** The panel's model field is the same record the connection switch re-reads. */
async function syncModel() {
  const profile = settings.value.providerProfiles.find(
    (p) => p.provider.apiKeyRef === settings.value.ai.apiKeyRef,
  );
  if (!profile) return;
  profile.provider.model = settings.value.ai.model;
  await settings.persist();
}
watch(
  () => ai.messages.at(-1)?.text,
  async () => {
    const nearBottom =
      !conversation.value ||
      conversation.value.scrollHeight -
        conversation.value.scrollTop -
        conversation.value.clientHeight <
        100;
    await nextTick();
    if (nearBottom && conversation.value)
      conversation.value.scrollTop = conversation.value.scrollHeight;
  },
);
watch(
  () => workspace.root,
  async () => {
    await ai.reset();
    await refreshCatalog();
    await refreshImages();
  },
);
// A screenshot pasted into the document must show up in @ without a reload.
watch(
  () => workspace.files,
  () => void refreshImages(),
);

const include = ref(true);
const reviewed = ref<number | null>(null);
const included = ref<Record<number, number[]>>({});
/** Hunk inclusion is a checkbox group over indices. */
function toggleHunk(patchId: number, index: number) {
  const list = (included.value[patchId] ??= []);
  const at = list.indexOf(index);
  if (at < 0) list.push(index);
  else list.splice(at, 1);
}
function review(patch: Patch) {
  reviewed.value = reviewed.value === patch.id ? null : patch.id;
  included.value[patch.id] ??= patchGroups(
    patch.original,
    patch.proposed,
  ).flatMap((g, i) => (g.changed ? [i] : []));
}
onMounted(() => {
  void ai.refreshHistory().catch((e) => (ai.error = String(e)));
  void refreshCatalog();
  void refreshImages();
  // Only pre-fetch for a connection the user actually configured; the default
  // record points at a provider that would fail and show an error on open.
  if (settings.value.providerProfiles.length) void fetchModels();
});
function enter(event: KeyboardEvent) {
  // Enter that commits an IME candidate must not send: the browser has not
  // written the composed text into the model yet, and preventing the default
  // would swallow the commit itself.
  if (event.isComposing) return;
  event.preventDefault();
  void send();
}
async function send() {
  const text = prompt.value;
  if (!text.trim()) return;
  await ai.send(text, doc.snapshot(), "", include.value, images.value);
  if (!ai.error) {
    prompt.value = "";
    images.value = [];
  }
}
async function accept(patch: Patch) {
  try {
    const proposed = selectPatch(
      patch.original,
      patch.proposed,
      included.value[patch.id] ?? [],
    );
    if (patch.path === (doc.path ?? "") || (!patch.path && !doc.path)) {
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
  } catch (error) {
    ai.error = String(error);
  }
}
</script>
<template>
  <aside class="ai-panel" aria-label="AI 助手">
    <header>
      <strong>AI 助手</strong
      ><Button
        title="新建会话"
        aria-label="新建会话"
        @click="ai.reset().catch((e) => (ai.error = String(e)))"
      >
        <UiIcon name="new" /></Button
      ><Button
        title="会话列表"
        @click="
          historyOpen = !historyOpen;
          ai.refreshHistory();
        "
      >
        会话</Button
      ><Button title="工作空间 SKILL / MCP 资源" @click="resourcesOpen = true">
        资源</Button
      ><Button
        title="AI 全屏"
        aria-label="切换 AI 全屏"
        @click="ui.aiFullscreen = !ui.aiFullscreen"
      >
        <UiIcon name="fullscreen" />
      </Button>
    </header>
    <div class="ai-model">
      <Select
        :model-value="settings.value.ai.apiKeyRef || undefined"
        @update:model-value="
          (value) => selectProvider(value).catch((e) => (ai.error = String(e)))
        "
      >
        <SelectTrigger aria-label="模型服务连接"
          ><SelectValue placeholder="选择连接"
        /></SelectTrigger>
        <SelectContent>
          <SelectItem
            v-if="
              settings.value.ai.apiKeyRef &&
              !settings.value.providerProfiles.some(
                (p) => p.provider.apiKeyRef === settings.value.ai.apiKeyRef,
              )
            "
            :value="settings.value.ai.apiKeyRef"
            >当前连接</SelectItem
          >
          <SelectItem
            v-for="profile in settings.value.providerProfiles"
            :key="profile.provider.apiKeyRef"
            :value="profile.provider.apiKeyRef"
            >{{ profile.name }}</SelectItem
          >
          <SelectItem value="__add">新增连接…</SelectItem>
        </SelectContent>
      </Select>
      <ModelPicker
        v-model="settings.value.ai.model"
        :models="models"
        label="AI 模型"
        @commit="syncModel().catch((e) => (ai.error = String(e)))"
      /><Button
        :disabled="fetchingModels"
        @click="fetchModels"
        title="获取模型列表"
        aria-label="获取模型列表"
      >
        <UiIcon name="refresh" />
      </Button>
    </div>
    <div v-if="historyOpen" class="ai-history-list">
      <Input v-model="historyQuery" placeholder="搜索会话" /><label
        ><Checkbox v-model="allWorkspaces" />所有工作空间</label
      >
      <article v-for="item in histories" :key="item.id">
        <Button
          @click="
            ai
              .loadHistory(item.id)
              .then(() => (historyOpen = false))
              .catch((e) => (ai.error = String(e)))
          "
        >
          {{ item.title
          }}<small>{{ item.workspace || "无工作空间" }}</small></Button
        ><Button
          v-if="item.workspace !== (workspace.root ?? '')"
          @click="
            ai.loadHistory(item.id, true).then(() => (historyOpen = false))
          "
        >
          派生到当前</Button
        ><Button @click="ai.deleteHistory(item.id)">删除</Button>
      </article>
      <p v-if="!histories.length" class="empty-hint">
        {{ historyQuery ? "没有匹配的会话" : "还没有历史会话" }}
      </p>
    </div>
    <div
      ref="conversation"
      class="ai-conversation"
      :class="{ 'is-empty': !ai.messages.length }"
    >
      <section v-if="!ai.messages.length" class="ai-welcome">
        <h2>从这篇文档开始</h2>
        <p>
          {{
            settings.value.ai.enabled
              ? "梳理内容、调整表达，或一起推敲下一段。"
              : "选择模型连接，开始讨论和修改文档。"
          }}
        </p>
        <div class="ai-starters">
          <Button
            type="button"
            @click="startPrompt('请总结当前文档的核心观点。')"
            >梳理文档要点</Button
          ><Button
            type="button"
            @click="startPrompt('请检查当前文档的结构，指出可以改进的地方。')"
            >检查结构与表达</Button
          ><Button
            v-if="!settings.value.ai.enabled"
            type="button"
            @click="
              ui.settingsCategory = 'AI';
              ui.settingsOpen = true;
            "
            >配置模型连接</Button
          >
        </div>
        <p class="ai-review-note">修改先展示差异，由你决定是否应用。</p>
      </section>
      <article
        v-for="(message, index) in ai.messages"
        :key="index"
        :class="message.role"
      >
        <small>{{ message.role === "user" ? "你" : "助手" }}</small>
        <details v-if="message.reasoning" class="ai-reasoning">
          <summary>思考过程</summary>
          <StreamMarkdown :text="message.reasoning" />
        </details>
        <StreamMarkdown :text="message.text" />
        <img
          v-for="(image, i) in message.images"
          :key="i"
          class="ai-image"
          :src="`data:${image.mimeType};base64,${image.data}`"
          alt="消息图片"
        />
      </article>
      <section v-for="patch in ai.patches" :key="patch.id" class="patch-card">
        <Button class="patch-title" @click="review(patch)">
          {{ patch.path.split(/[/\\]/).pop() || "未命名" }} ·
          {{
            patch.status === "pending"
              ? "查看修改"
              : patch.status === "accepted"
                ? "已接受"
                : "已拒绝"
          }}
        </Button>
        <p>{{ patch.reason }}</p>
        <div v-if="reviewed === patch.id" class="diff-view">
          <section
            v-for="(group, index) in patchGroups(
              patch.original,
              patch.proposed,
            )"
            :key="index"
          >
            <label
              v-if="group.changed && patch.status === 'pending'"
              class="hunk-choice"
              ><Checkbox
                :model-value="(included[patch.id] ?? []).includes(index)"
                aria-label="应用此处修改"
                @update:model-value="toggleHunk(patch.id, index)"
              />应用此处修改</label
            >
            <pre v-if="group.before" :class="{ removed: group.changed }">{{
              group.before
            }}</pre>
            <pre v-if="group.changed && group.after" class="added">{{
              group.after
            }}</pre>
          </section>
        </div>
        <div v-if="patch.status === 'pending'" class="patch-actions">
          <Button @click="patch.status = 'rejected'">拒绝</Button
          ><Button
            class="primary"
            :disabled="reviewed !== patch.id || !included[patch.id]?.length"
            @click="accept(patch)"
          >
            接受修改
          </Button>
        </div>
      </section>
      <p v-if="ai.tool" class="empty-hint">正在使用 {{ ai.tool }}…</p>
      <p v-if="ai.error" class="inline-error" role="alert">{{ ai.error }}</p>
    </div>
    <div
      v-if="ai.busy || ai.inputTokens || ai.outputTokens"
      class="ai-usage"
      :title="
        ai.busy
          ? '流式生成中按字符估算；完成后使用服务端 token 用量'
          : '服务端报告的 token 用量'
      "
    >
      输入 {{ ai.inputTokens.toLocaleString() }} · 输出
      {{ ai.outputTokens }} tokens · {{ ai.busy ? "≈" : ""
      }}{{ ai.tokensPerSecond.toFixed(1) }} tokens/s
    </div>
    <form class="ai-input" @submit.prevent="send">
      <div class="ai-references">
        <span
          v-for="reference in ai.references"
          :key="reference.id"
          :title="reference.label"
          ><UiIcon name="chatgpt" />{{ reference.label
          }}<Button
            type="button"
            aria-label="移除引用"
            @click="
              ai.references = ai.references.filter((r) => r.id !== reference.id)
            "
          >
            <UiIcon name="close" /> </Button></span
        ><span v-for="(image, i) in images" :key="i"
          ><img
            :src="`data:${image.mimeType};base64,${image.data}`"
            alt="待发送图片" /><Button
            type="button"
            aria-label="移除图片"
            @click="images.splice(i, 1)"
          >
            <UiIcon name="close" /></Button
        ></span>
      </div>
      <div v-if="suggestions.length" class="ai-suggestions">
        <Button
          v-for="item in suggestions"
          :key="item.id"
          type="button"
          @click="selectSuggestion(item)"
        >
          {{ item.name }}<small>{{ item.kind }}</small>
        </Button>
      </div>
      <Textarea
        v-model="prompt"
        placeholder="描述你的问题或修改想法…"
        aria-label="AI 消息"
        @keydown.enter.exact="enter($event)"
      />
      <div class="ai-actions">
        <div class="ai-composer-options">
          <label><Checkbox v-model="include" />当前文档</label
          ><label><Checkbox v-model="ai.thinking" />思考</label>
        </div>
        <small>@ 引用 · / 资源</small
        ><Button
          v-if="ai.busy"
          type="button"
          @click="ai.abort().catch((e) => (ai.error = String(e)))"
        >
          停止</Button
        ><Button v-else class="primary" :disabled="ai.busy || !prompt.trim()">
          发送
        </Button>
      </div>
    </form>
    <ResourceDialog
      v-if="resourcesOpen"
      @close="
        resourcesOpen = false;
        refreshCatalog();
      "
    />
  </aside>
</template>
