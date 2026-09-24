<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  computed,
  provide,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
  defineAsyncComponent,
} from "vue";
import { useController } from "./controller";
import { shortcutLabel, commandRegistryKey } from "../command-palette/registry";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ShortcutHelp from "../settings/ShortcutHelp.vue";
import UiIcon from "../components/UiIcon.vue";
import { themeVariables } from "../settings/themes";
import { call, desktop } from "../services/backend";
import { useAiStore } from "../stores/ai";
import { useWorkspaceStore } from "../stores/workspace";
const MarkdownEditor = defineAsyncComponent(() =>
  import("../editor/MarkdownEditor.vue").then((m) => m.default),
);
import FileSidebar from "../workspace/FileSidebar.vue";
const SettingsPanel = defineAsyncComponent(() =>
  import("../settings/SettingsPanel.vue").then((m) => m.default),
);
const CommandPalette = defineAsyncComponent(() =>
  import("../command-palette/CommandPalette.vue").then((m) => m.default),
);
import FindBar from "../editor/FindBar.vue";
const AiPanel = defineAsyncComponent(() =>
  import("../ai/AiPanel.vue").then((m) => m.default),
);
import AppDialog from "../components/AppDialog.vue";
import { diffLines } from "diff";
const controller = useController();
const { doc, ui, settings, registry, adapter, external } = controller;
provide(commandRegistryKey, registry);
const aiStore = useAiStore();
const workspace = useWorkspaceStore();
/** The titlebar carries orientation, not just the file name: which folder the
 * document belongs to is otherwise only visible in the sidebar. */
const workspaceName = computed(
  () => workspace.root?.split(/[/\\]/).filter(Boolean).pop() ?? "",
);
let sidebarBeforeImmersive = false;
function immersive(active: boolean) {
  if (active) {
    sidebarBeforeImmersive = ui.sidebar;
    ui.sidebar = false;
  } else ui.sidebar = sidebarBeforeImmersive;
}
function reference(text: string, label: string) {
  aiStore.references.push({ id: crypto.randomUUID(), text, label });
  ui.help = false;
  ui.assistant = true;
}

const maximized = ref(false);
// AppKit draws an inactive selection when the window is not key; the list
// styles follow the same rule.
const windowActive = ref(true);
let detachResize: (() => void) | undefined;
let detachFocus: (() => void) | undefined;
let shellDisposed = false;
onMounted(async () => {
  if (!desktop) return;
  const window = getCurrentWindow();
  const sync = async () => {
    maximized.value =
      (await window.isMaximized()) || (await window.isFullscreen());
  };
  try {
    await sync();
    const detach = await window.onResized(() => {
      void sync().catch(controller.report);
    });
    if (shellDisposed) detach();
    else detachResize = detach;
    const focus = await window.onFocusChanged(({ payload }) => {
      windowActive.value = payload;
    });
    if (shellDisposed) focus();
    else detachFocus = focus;
  } catch (e) {
    controller.report(e);
  }
});
onBeforeUnmount(() => {
  shellDisposed = true;
  detachResize?.();
  detachFocus?.();
});
async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  try {
    if (desktop) await getCurrentWindow()[action]();
  } catch (e) {
    controller.report(e);
  }
}
async function presentation() {
  try {
    if (desktop)
      await getCurrentWindow().setFullscreen(
        !(await getCurrentWindow().isFullscreen()),
      );
    else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) {
    controller.report(e);
  }
}

const statisticsOpen = ref(false);
const compareOpen = ref(false);
const selection = ref("");
const floating = ref<{ x: number; y: number } | null>(null);
const background = ref("");
watch(
  () => settings.value.backgroundImage,
  async (name) => {
    background.value = "";
    if (name) {
      try {
        const data = await call<string>("background_read", { name });
        if (settings.value.backgroundImage === name) background.value = data;
      } catch (e) {
        controller.report(e);
      }
    }
  },
  { immediate: true },
);
async function copyPath() {
  if (doc.path) {
    try {
      await navigator.clipboard.writeText(doc.path);
      ui.notice = "文件路径已复制";
    } catch (e) {
      controller.report(e);
    }
  }
}
const words = computed(
  () => doc.content.match(/[\u3400-\u9fff]|[\p{L}\p{N}]+/gu)?.length ?? 0,
);
const style = computed(() => ({
  ...themeVariables(settings.value.themePreset, settings.appearance === "dark"),
  opacity: settings.value.opacity,
  backgroundImage: background.value ? `url("${background.value}")` : undefined,
  "--y-font-size": `${settings.value.fontSize}px`,
  "--y-font-family": settings.value.fontFamily,
  "--y-line-height": String(settings.value.lineHeight),
  "--y-editor-width": settings.value.wideEditor
    ? "100%"
    : `${settings.value.contentWidth}px`,
  "--sidebar-width": `${settings.value.sidebarWidth}px`,
  "--ai-width": `${settings.value.aiWidth}px`,
}));
const customCss = computed(() =>
  settings.value.customCss.replace(/#write\b/g, ".editor-host .vditor-reset"),
);
// reka-ui portals overlay content to <body>, outside .app-shell where the
// theme tokens live, so mirror them onto the document root. Only the tokens —
// the window opacity and background image must not reach <html>.
watchEffect(() => {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(
    themeVariables(settings.value.themePreset, settings.appearance === "dark"),
  ))
    root.style.setProperty(key, String(value));
  root.dataset.theme = settings.appearance;
});
function selected(text: string, rect?: DOMRect) {
  selection.value = text;
  floating.value = rect
    ? {
        x: Math.max(10, Math.min(window.innerWidth - 250, rect.x)),
        y: Math.max(8, rect.y - 42),
      }
    : null;
}
async function jump(line: number) {
  ui.source = true;
  await nextTick();
  adapter.value?.scrollToLine(line);
}
async function heading(index: number) {
  ui.source = false;
  await nextTick();
  adapter.value?.scrollToHeading(index);
}
function resize(event: PointerEvent, side: "left" | "right") {
  const start = event.clientX;
  const before =
    side === "left" ? settings.value.sidebarWidth : settings.value.aiWidth;
  const move = (e: PointerEvent) => {
    const width = before + (e.clientX - start) * (side === "left" ? 1 : -1);
    if (side === "left")
      settings.value.sidebarWidth = Math.round(
        Math.max(180, Math.min(480, width)),
      );
    else
      settings.value.aiWidth = Math.round(Math.max(260, Math.min(640, width)));
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end, { once: true });
}
onBeforeUnmount(() => useAiStore().dispose());
</script>
<template>
  <div
    class="app-shell"
    :data-maximized="maximized"
    :data-theme="settings.appearance"
    :data-window-active="String(windowActive)"
    :class="{
      'has-background': !!background,
      'wide-editor': settings.value.wideEditor,
      // Native macOS chrome: a taller unified titlebar with the traffic lights
      // in the gutter, and no in-window menu or drawn window controls.
      'native-chrome': desktop,
    }"
    :style="style"
  >
    <component :is="'style'" v-if="customCss">{{ customCss }}</component>
    <header
      class="browser-menubar app-titlebar"
      data-tauri-drag-region
      @dblclick.self="windowAction('toggleMaximize')"
    >
      <!-- macOS supplies the real menu bar and the traffic lights; this
           in-window menu is the browser preview's stand-in for them. -->
      <div v-if="!desktop" class="menu-bar" data-tauri-drag-region>
        <DropdownMenu
          v-for="category in ['文件', '编辑', '格式', '视图', '主题']"
          :key="category"
        >
          <DropdownMenuTrigger class="app-menu-trigger">{{
            category
          }}</DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              v-for="command in registry
                .list()
                .filter((c) => c.category === category)"
              :key="command.id"
              @select="controller.execute(command.id)"
            >
              {{ command.title
              }}<kbd v-if="command.shortcut" class="ml-auto pl-4">{{
                shortcutLabel(command.shortcut)
              }}</kbd>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span
        v-if="workspaceName"
        class="titlebar-context"
        data-tauri-drag-region
        :title="workspace.root ?? ''"
        >{{ workspaceName }}</span
      >
      <span data-tauri-drag-region class="document-title"
        >{{ doc.name }}{{ doc.dirty ? " •" : "" }}</span
      >
      <div v-if="!desktop" class="window-controls">
        <Button title="最小化" @click="windowAction('minimize')">
          <UiIcon name="minimize" /></Button
        ><Button title="最大化 / 还原" @click="windowAction('toggleMaximize')">
          <UiIcon name="maximize" /></Button
        ><Button title="关闭窗口" @click="windowAction('close')">
          <UiIcon name="close" />
        </Button>
      </div>
    </header>
    <div class="workspace">
      <FileSidebar
        v-if="ui.sidebar"
        @open="
          (path, line) => controller.open(path, line).catch(controller.report)
        "
        @folder="controller.folder().catch(controller.report)"
        @recent="
          (path, kind) => controller.recent(path, kind).catch(controller.report)
        "
        @heading="heading"
        @error="controller.report"
      />
      <div
        v-if="ui.sidebar"
        class="resize-handle"
        role="separator"
        aria-label="调整左侧栏宽度"
        @pointerdown.prevent="resize($event, 'left')"
      />
      <main
        v-show="!ui.aiFullscreen"
        class="editor-column"
        aria-label="文档编辑区"
      >
        <div class="document-view-menu">
          <DropdownMenu :modal="false">
            <DropdownMenuTrigger
              class="view-width-toggle"
              title="文档视图与导出"
              aria-label="文档菜单"
              ><UiIcon name="more"
            /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" aria-label="文档操作">
              <DropdownMenuItem @select="controller.execute('view.wide')">{{
                settings.value.wideEditor ? "标准宽度" : "宽屏模式"
              }}</DropdownMenuItem>
              <DropdownMenuItem @select="ui.reading = !ui.reading">{{
                ui.reading ? "编辑模式" : "阅读模式"
              }}</DropdownMenuItem>
              <DropdownMenuItem @select="presentation"
                >演示模式</DropdownMenuItem
              >
              <DropdownMenuSeparator />
              <DropdownMenuItem @select="controller.execute('file.print')"
                >导出 PDF…</DropdownMenuItem
              >
              <DropdownMenuItem @select="controller.execute('file.word')"
                >导出 Word…</DropdownMenuItem
              >
              <DropdownMenuItem :disabled="!doc.path" @select="copyPath"
                >复制文件路径</DropdownMenuItem
              >
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <FindBar v-if="ui.findOpen" @jump="jump" />
        <div v-if="doc.conflict" class="conflict-banner" role="alert">
          文件在磁盘上已变化。<Button @click="compareOpen = !compareOpen">
            比较差异</Button
          ><Button
            @click="controller.reloadExternal().catch(controller.report)"
          >
            重新载入…</Button
          ><Button @click="controller.save(true).catch(controller.report)">
            另存为…
          </Button>
        </div>
        <div v-if="compareOpen && external" class="external-diff">
          <pre
            v-for="(part, index) in diffLines(external.content, doc.content)"
            :key="index"
            :class="{ added: part.added, removed: part.removed }"
            >{{ part.value }}</pre
          >
          <Button @click="compareOpen = false">关闭比较</Button>
        </div>
        <div v-if="ui.error" class="error-banner" role="alert">
          {{ ui.error
          }}<Button aria-label="关闭错误提示" @click="ui.error = ''">
            <UiIcon name="close" />
          </Button>
        </div>
        <MarkdownEditor
          :key="doc.identity"
          :content="doc.content"
          :path="doc.path"
          :appearance="settings.appearance"
          :source="ui.source"
          :focus="ui.focus"
          :typewriter="ui.typewriter"
          :spellcheck="settings.value.spellcheck"
          :read-only="ui.reading"
          :render-large-diagrams="settings.value.renderLargeDiagrams"
          @change="doc.update"
          @ready="controller.ready"
          @error="controller.report"
          @save="controller.save().catch(controller.report)"
          @selection="selected"
          @reference="reference"
          @immersive="immersive"
          @link="(url) => controller.link(url).catch(controller.report)"
        />
        <div v-if="!ui.ready && !ui.error" class="loading-note">
          正在加载编辑器…
        </div>
      </main>
      <div
        v-if="(ui.assistant || ui.help) && !ui.aiFullscreen"
        class="resize-handle"
        role="separator"
        aria-label="调整 AI 侧栏宽度"
        @pointerdown.prevent="resize($event, 'right')"
      />
      <ShortcutHelp v-if="ui.help" :registry="registry" />
      <AiPanel
        v-else-if="ui.assistant"
        :selection="selection"
        :class="{ 'ai-fullscreen': ui.aiFullscreen }"
      />
    </div>
    <div
      v-if="floating && !ui.source"
      class="floating-toolbar"
      :style="{ left: `${floating.x}px`, top: `${floating.y}px` }"
      @mousedown.prevent
    >
      <Button
        title="加粗"
        command="editor.bold"
        @click="controller.execute('editor.bold')"
      >
        <UiIcon name="bold" /></Button
      ><Button
        title="斜体"
        command="editor.italic"
        @click="controller.execute('editor.italic')"
      >
        <UiIcon name="italic" /></Button
      ><Button
        title="删除线"
        command="editor.strike"
        @click="controller.execute('editor.strike')"
      >
        <UiIcon name="strike" /></Button
      ><Button
        title="链接"
        command="editor.link"
        @click="controller.execute('editor.link')"
      >
        <UiIcon name="link" /></Button
      ><Button
        title="AI 编辑选区"
        @click="
          reference(
            selection,
            adapter?.getSelection(true).rangeLabel ?? '文档选区',
          );
          floating = null;
        "
      >
        <UiIcon name="chatgpt" />
      </Button>
    </div>
    <footer class="statusbar">
      <div class="status-tools">
        <Button
          title="切换侧边栏"
          command="view.sidebar"
          aria-label="切换侧边栏"
          :class="{ active: ui.sidebar }"
          @click="controller.execute('view.sidebar')"
        >
          <UiIcon name="panel" />
        </Button>
        <Button
          title="切换源代码模式"
          command="editor.source"
          aria-label="切换源代码模式"
          :class="{ active: ui.source }"
          @click="controller.execute('editor.source')"
        >
          <UiIcon name="source" />
        </Button>
        <Button
          title="偏好设置"
          command="settings.open"
          aria-label="打开偏好设置"
          @click="ui.settingsOpen = true"
        >
          <UiIcon name="settings" />
        </Button>
        <Button
          title="最近打开的文件和文件夹"
          command="file.recent"
          aria-label="最近打开"
          @click="controller.execute('file.recent')"
        >
          <UiIcon name="recent" />
        </Button>
      </div>
      <div v-if="doc.path" class="status-file-path" :title="doc.path">
        <bdi dir="ltr">{{ doc.path }}</bdi>
      </div>
      <span class="save-status">{{
        doc.saving
          ? "正在保存…"
          : doc.conflict
            ? "外部修改冲突"
            : doc.dirty
              ? "已修改"
              : ""
      }}</span
      ><span v-if="ui.notice" class="status-notice" @click="ui.notice = ''">{{
        ui.notice
      }}</span>
      <div class="status-spacer" />
      <span v-if="ui.focus" class="mode-indicator">专注</span
      ><span v-if="ui.typewriter" class="mode-indicator">打字机</span
      ><Button class="word-count" @click="statisticsOpen = !statisticsOpen">
        {{ words.toLocaleString() }} 字
      </Button>
      <Button
        title="快捷键帮助"
        aria-label="快捷键帮助"
        @click="ui.help = !ui.help"
      >
        <UiIcon name="help" />
      </Button>
      <Button
        class="status-ai"
        title="AI 助手"
        command="view.ai"
        aria-label="切换 AI 助手"
        :class="{ active: ui.assistant }"
        @click="
          ui.help = false;
          ui.assistant = !ui.assistant;
          if (!ui.assistant) ui.aiFullscreen = false;
        "
      >
        <UiIcon name="chatgpt" />
      </Button>
      <div v-if="statisticsOpen" class="statistics-popover">
        <p>
          字数 <b>{{ words }}</b>
        </p>
        <p>
          字符 <b>{{ doc.stats.characters }}</b>
        </p>
        <p>
          行数 <b>{{ doc.stats.lines }}</b>
        </p>
        <p>
          选中字符 <b>{{ selection.length }}</b>
        </p>
        <p>
          阅读时间 <b>{{ Math.max(1, Math.ceil(words / 300)) }} 分钟</b>
        </p>
        <p>
          编码 <b>UTF-8{{ doc.bom ? " BOM" : "" }} / {{ doc.lineEnding }}</b>
        </p>
      </div>
    </footer>
    <SettingsPanel v-if="ui.settingsOpen" :registry="registry" />
    <CommandPalette
      v-if="ui.paletteOpen"
      :registry="registry"
      @command="controller.execute"
      @open="
        (path, line) => controller.open(path, line).catch(controller.report)
      "
      @folder="
        (path) => controller.recent(path, 'folder').catch(controller.report)
      "
    />
    <AppDialog />
  </div>
</template>
