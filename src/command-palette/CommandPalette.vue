<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import { choose } from "../services/dialog";
import { useDocumentStore } from "../stores/document";
import { useWorkspaceStore } from "../stores/workspace";
import { useSettingsStore } from "../stores/settings";
import { useEditorStore } from "../stores/editor";
import { backend, call } from "../services/backend";
import {
  CommandRegistry,
  fuzzyScore,
  shortcutLabel,
  type EditorCommand,
} from "./registry";
import { themePresets } from "../settings/themes";
import UiIcon from "../components/UiIcon.vue";
const props = defineProps<{ registry: CommandRegistry }>();
const emit = defineEmits<{
  command: [id: string];
  open: [path: string, line?: number];
  folder: [path: string];
}>();
const ui = useEditorStore(),
  ws = useWorkspaceStore(),
  settings = useSettingsStore();
const doc = useDocumentStore();
const themeMode = ref(false);
const originalTheme = settings.value.themePreset;
let themeCommitted = false;
const contextMenu = ref<{ item: Item; x: number; y: number } | null>(null);
const commandResults = ref<Item[]>([]);
const limit = computed(() =>
  Math.round(
    Math.max(
      1,
      Math.min(1000, Number(settings.value.paletteSearchLimit) || 70),
    ),
  ),
);
const regex = ref(settings.value.paletteRegex);
const input = ref<HTMLInputElement>(),
  resultsHost = ref<HTMLElement>(),
  selected = ref(0),
  busy = ref(false),
  error = ref("");
interface Item {
  id: string;
  label: string;
  detail: string;
  command: boolean;
  path?: string;
  line?: number;
  folder?: boolean;
}
const mode = computed(() =>
  ui.paletteQuery.startsWith(">") ? "commands" : ui.paletteMode,
);
const files = computed(() =>
  ws.files
    .filter((f) => !f.directory)
    .map((f) => ({
      id: f.path,
      label: f.name,
      detail: f.relative,
      command: false,
    })),
);
const fileResults = ref<Item[]>([]),
  contentResults = ref<Item[]>([]);
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let worker: Worker | undefined;
let sentFiles: Item[] | undefined;
watch(
  [
    () => ui.paletteQuery,
    mode,
    files,
    regex,
    limit,
    () => settings.value.paletteRegex,
  ],
  ([query, view, entries]) => {
    const id = ++sequence;
    selected.value = 0;
    clearTimeout(timer);
    busy.value = false;
    error.value = "";
    void call("cancel_search").catch(() => {});
    contextMenu.value = null;
    if (view === "commands") {
      const map = (commands: EditorCommand[]) =>
        commands.map((c) => ({
          id: c.id,
          label: c.title,
          // A command without a shortcut shows nothing here: the category is
          // not a key combination and must not sit in the key chip.
          detail: c.shortcut ?? "",
          command: true,
        }));
      commandResults.value = map(props.registry.list(query));
      void import("./pinyin")
        .then(({ searchCommands }) => {
          if (id === sequence)
            commandResults.value = map(
              searchCommands(props.registry.list(), query),
            );
        })
        .catch((e) => {
          if (id === sequence) error.value = String(e);
        });
      return;
    }
    if (view === "content") {
      contentResults.value = [];
      if (!query.trim() || !ws.root) return;
      busy.value = true;
      timer = setTimeout(async () => {
        try {
          const hits = await backend.search({
            text: query,
            regex: settings.value.paletteRegex && regex.value,
            limit: limit.value,
            caseSensitive: false,
            wholeWord: false,
            hidden: false,
            include: "",
            exclude: "",
          });
          if (id === sequence)
            contentResults.value = hits.slice(0, limit.value).map((hit, i) => ({
              id: `${hit.path}:${hit.line}:${i}`,
              path: hit.path,
              label: hit.text.trim(),
              detail: `${hit.path.replace(ws.root ?? "", "").replace(/^[/\\]/, "")}:${hit.line}`,
              line: hit.line,
              command: false,
            }));
        } catch (e) {
          if (id === sequence) error.value = String(e);
        } finally {
          if (id === sequence) busy.value = false;
        }
      }, 220);
      return;
    }
    if (entries.length > 2000 && typeof Worker !== "undefined") {
      worker ??= new Worker(new URL("./search.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (
        event: MessageEvent<{ id: number; items: Item[] }>,
      ) => {
        if (event.data.id === sequence) fileResults.value = event.data.items;
      };
      worker.postMessage({
        id,
        query,
        files: sentFiles === entries ? undefined : entries,
      });
      sentFiles = entries;
    } else
      fileResults.value = entries
        .map((f) => ({ ...f, score: fuzzyScore(query, f.detail) }))
        .filter((f) => f.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 80);
  },
  { immediate: true },
);
const items = computed<Item[]>(() =>
  themeMode.value
    ? themePresets
        .filter((p) =>
          p.name.toLowerCase().includes(ui.paletteQuery.toLowerCase()),
        )
        .map((p) => ({
          id: p.id,
          label: p.name,
          detail: "预览主题",
          command: false,
        }))
    : mode.value === "commands"
      ? commandResults.value
      : mode.value === "content"
        ? contentResults.value
        : !ui.paletteQuery.trim() && settings.value.recentEntries.length
          ? settings.value.recentEntries.map((e) => ({
              id: e.path,
              label: e.path.split(/[/\\]/).pop() ?? e.path,
              detail: e.path,
              folder: e.kind === "folder",
              command: false,
            }))
          : fileResults.value,
);
const placeholder = computed(() =>
  mode.value === "commands"
    ? "搜索命令（支持拼音 / 首字母）"
    : mode.value === "content"
      ? `搜索文件内容…（最多 ${limit.value} 条）`
      : "搜索文件 · Tab 切换模式",
);
function setMode(next: "files" | "content" | "commands") {
  themeMode.value = false;
  ui.paletteMode = next;
  ui.paletteQuery = ui.paletteQuery.replace(/^>/, "");
  input.value?.focus();
}
function cycleMode(event: KeyboardEvent) {
  const modes = ["files", "content", "commands"] as const;
  const index = modes.indexOf(mode.value);
  setMode(modes[(index + (event.shiftKey ? 2 : 1)) % 3]);
}
function showContext(event: MouseEvent, item: Item) {
  if (mode.value !== "files" || item.folder) return;
  contextMenu.value = {
    item,
    x: Math.max(0, Math.min(event.clientX, window.innerWidth - 230)),
    y: Math.max(0, Math.min(event.clientY, window.innerHeight - 170)),
  };
}
function dismissContext(event: Event) {
  if (!(event.target as Element)?.closest(".palette-context"))
    contextMenu.value = null;
}
async function fileAction(action: string) {
  const item = contextMenu.value?.item;
  contextMenu.value = null;
  if (!item) return;
  const path = item.path ?? item.id;
  try {
    if (action === "copy") await navigator.clipboard.writeText(path);
    else if (action === "reveal") await call("reveal_file", { path });
    else if (action === "open") await call("open_system_file", { path });
    else {
      if (doc.path === path && doc.dirty)
        throw new Error("请先保存当前文档，再删除文件。");
      const choice = await choose(
        "删除文件？",
        item.label + " 将移到废纸篓。",
        [
          { id: "cancel", label: "取消" },
          { id: "trash", label: "移到废纸篓" },
        ],
      );
      if (choice !== "trash") return;
      await backend.mutate("trash", path);
      if (doc.path === path) doc.load();
      settings.value.recentEntries = settings.value.recentEntries.filter(
        (e) => e.path !== path,
      );
      await ws.refresh();
    }
  } catch (e) {
    error.value = String(e);
  }
}
async function move(delta: number) {
  selected.value = Math.max(
    0,
    Math.min(items.value.length - 1, selected.value + delta),
  );
  if (themeMode.value && items.value[selected.value])
    settings.value.themePreset = items.value[selected.value].id;
  await nextTick();
  const button = resultsHost.value?.querySelectorAll("button")[selected.value];
  button?.scrollIntoView({ block: "nearest" });
}
function enter(event: KeyboardEvent) {
  // Enter that commits an IME candidate must not run the selected command.
  if (event.isComposing) return;
  event.preventDefault();
  pick();
}
function pick(index = selected.value) {
  const item = items.value[index];
  if (!item) return;
  if (themeMode.value) {
    settings.value.themePreset = item.id;
    themeCommitted = true;
    ui.paletteOpen = false;
    return;
  }
  if (item.id === "theme.choose") {
    themeMode.value = true;
    ui.paletteQuery = "";
    selected.value = 0;
    input.value?.focus();
    return;
  }
  ui.paletteOpen = false;
  if (item.command) emit("command", item.id);
  else if (item.folder) emit("folder", item.id);
  else emit("open", item.path ?? item.id, item.line);
}
onMounted(async () => {
  window.addEventListener("pointerdown", dismissContext);
  await nextTick();
  input.value?.focus();
});
onBeforeUnmount(() => {
  if (themeMode.value && !themeCommitted)
    settings.value.themePreset = originalTheme;
  window.removeEventListener("pointerdown", dismissContext);
  sequence++;
  clearTimeout(timer);
  worker?.terminate();
  void call("cancel_search").catch(() => {});
});
</script>
<template>
  <div class="modal-shade palette-shade" @click.self="ui.paletteOpen = false">
    <section
      class="palette"
      role="dialog"
      aria-label="命令面板"
      aria-modal="true"
      @keydown.tab.prevent.stop="cycleMode"
      @keydown.esc="ui.paletteOpen = false"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter="enter($event)"
    >
      <div class="palette-input-row">
        <input
          ref="input"
          v-model="ui.paletteQuery"
          :placeholder="themeMode ? '搜索主题 · ↑↓ 实时预览' : placeholder"
          aria-label="搜索文件、内容或命令"
        /><Button
          v-if="ui.paletteQuery"
          aria-label="清空搜索"
          @click="
            ui.paletteQuery = '';
            input?.focus();
          "
        >
          ×
        </Button>
      </div>
      <nav class="palette-modes">
        <Button :class="{ active: mode === 'files' }" @click="setMode('files')">
          搜索文件</Button
        ><Button
          :class="{ active: mode === 'content' }"
          @click="setMode('content')"
        >
          搜索内容</Button
        ><Button
          :class="{ active: mode === 'commands' }"
          @click="setMode('commands')"
        >
          搜索命令
        </Button>
      </nav>
      <p v-if="error" class="palette-error" role="alert">{{ error }}</p>
      <div ref="resultsHost" class="palette-results">
        <Button
          v-for="(item, index) in items"
          :key="item.id"
          :class="{ selected: index === selected }"
          :title="item.detail"
          @click="pick(index)"
          @contextmenu.prevent="showContext($event, item)"
        >
          <UiIcon
            v-if="mode === 'files'"
            :name="item.folder ? 'folder' : 'file'"
          /><span class="palette-item-text"
            ><span>{{ item.label }}</span
            ><small v-if="!item.command">{{ item.detail }}</small></span
          ><kbd v-if="item.command && item.detail" class="palette-shortcut">{{
            shortcutLabel(item.detail)
          }}</kbd>
        </Button>
        <p v-if="busy">搜索中…</p>

        <p v-else-if="!items.length">
          {{
            mode === "content" && !ws.root
              ? "请先打开文件夹"
              : mode === "content" && !ui.paletteQuery
                ? "输入关键词搜索文件内容"
                : "没有匹配结果"
          }}
        </p>
      </div>
      <footer class="palette-count">
        <span
          >{{
            mode === "content" ? `${items.length} / ${limit} 条结果 · ` : ""
          }}Tab 切换模式 · ↑↓ 选择 · Enter 确认</span
        ><label
          v-if="mode === 'content' && settings.value.paletteRegex"
          class="palette-regex"
          ><Checkbox v-model="regex" aria-label="正则" />正则</label
        >
      </footer>
      <div
        v-if="contextMenu"
        class="palette-context"
        role="menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @keydown.stop
        @keydown.esc="contextMenu = null"
      >
        <Button role="menuitem" @click="fileAction('copy')">复制文件路径</Button
        ><Button role="menuitem" @click="fileAction('reveal')">
          在文件管理器中打开</Button
        ><Button role="menuitem" @click="fileAction('open')">
          使用系统应用打开</Button
        ><Button role="menuitem" @click="fileAction('trash')">删除文件…</Button>
      </div>
    </section>
  </div>
</template>
