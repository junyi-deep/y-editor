import { themePresets } from "../settings/themes";
import { useAiStore } from "../stores/ai";
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { backend, call, desktop } from "../services/backend";
import { choose } from "../services/dialog";
import { useDocumentStore } from "../stores/document";
import { useWorkspaceStore } from "../stores/workspace";
import { useEditorStore } from "../stores/editor";
import { useSettingsStore } from "../stores/settings";
import { CommandRegistry } from "../command-palette/registry";
import type { EditorAdapter } from "../types/editor";
import type { FileDocument, Recovery } from "../types/workspace";

export function useController() {
  const doc = useDocumentStore();
  const workspace = useWorkspaceStore();
  const ui = useEditorStore();
  const settings = useSettingsStore();
  const adapter = shallowRef<EditorAdapter>();
  const registry = new CommandRegistry(() => settings.value.shortcuts);
  const external = shallowRef<FileDocument>();
  let initialized = false;
  let allowClose = false;
  let autosave: ReturnType<typeof setTimeout>;
  let recoveryTimer: ReturnType<typeof setTimeout>;
  let settingsTimer: ReturnType<typeof setTimeout>;
  let watcherTimer: ReturnType<typeof setTimeout>;
  const cleanup: UnlistenFn[] = [];
  let savePromise: Promise<boolean> | undefined;
  let recoveryQueue = Promise.resolve();
  function report(error: unknown) {
    ui.error = String(error).replace(/^Error: /, "");
  }
  function recover(snapshot: Recovery | null) {
    recoveryQueue = recoveryQueue
      .then(() => backend.recover(snapshot))
      .catch(report);
    return recoveryQueue;
  }
  function currentContent() {
    if (ui.ready && adapter.value) doc.update(adapter.value.getMarkdown());
    return doc.content;
  }
  async function save(as = false): Promise<boolean> {
    if (savePromise) {
      await savePromise;
      return doc.dirty ? save(as) : true;
    }
    const content = currentContent();
    const id = doc.identity;
    doc.saving = true;
    savePromise = (async () => {
      try {
        const result =
          as || !doc.path
            ? await backend.saveAs(content, doc.path ? doc.name : "Untitled.md")
            : await backend.save(
                {
                  path: doc.path,
                  content,
                  diskHash: doc.diskHash,
                  lineEnding: doc.lineEnding,
                  bom: doc.bom,
                },
                doc.diskHash,
              );
        if (!result) return false;
        doc.markSaved(result, id);
        if (id === doc.identity)
          await recover(doc.dirty ? doc.recovery() : null);
        settings.value.recentFiles = [
          result.path,
          ...settings.value.recentFiles.filter((path) => path !== result.path),
        ].slice(0, 8);
        await refreshRecent();
        if (workspace.root) await workspace.refresh();
        return true;
      } catch (error) {
        if (String(error).includes("CONFLICT")) doc.conflict = true;
        throw error;
      } finally {
        doc.saving = false;
        savePromise = undefined;
      }
    })();
    return savePromise;
  }
  async function canLeave() {
    currentContent();
    if (savePromise) await savePromise;
    if (!doc.dirty) return true;
    const choice = await choose(
      `保存对“${doc.name}”的修改？`,
      "未保存的内容可保存后继续，或放弃修改。",
      [
        { id: "cancel", label: "取消" },
        { id: "discard", label: "不保存" },
        { id: "save", label: "保存", primary: true },
      ],
    );
    if (choice === "save") return save();
    return choice === "discard";
  }
  async function load(next?: FileDocument, line?: number) {
    if (next && next.content.length > 10_000_000) {
      const choice = await choose(
        "打开大型文档",
        "此文档超过 10 MB。建议使用源代码模式，减少渲染开销。",
        [
          { id: "cancel", label: "取消" },
          { id: "normal", label: "正常打开" },
          { id: "source", label: "源代码模式", primary: true },
        ],
      );
      if (!choice || choice === "cancel") return;
      ui.source = choice === "source";
    }
    if (!(await canLeave())) return;
    clearTimeout(autosave);
    clearTimeout(recoveryTimer);
    await recover(null);
    ui.ready = false;
    adapter.value = undefined;
    external.value = undefined;
    doc.load(next);
    if (line) ui.source = true;
    pendingLine = line;
  }
  let pendingLine: number | undefined;
  function ready(value: EditorAdapter) {
    adapter.value = value;
    ui.ready = true;
    if (pendingLine) {
      value.scrollToLine(pendingLine);
      pendingLine = undefined;
    }
  }
  async function open(path?: string, line?: number) {
    const next = path ? await backend.read(path) : await backend.pickFile();
    if (!next) return;
    await load(next, line);
    if (!path) {
      const state = await backend.bootstrap();
      workspace.root = state.root;
      await workspace.refresh();
    }
    settings.value.recentFiles = [
      next.path,
      ...settings.value.recentFiles.filter((path) => path !== next.path),
    ].slice(0, 8);
    await refreshRecent();
  }
  async function refreshRecent() {
    const state = await backend.bootstrap();
    settings.value.recentFiles = state.settings.recentFiles;
    settings.value.recentEntries = state.settings.recentEntries;
  }
  async function recent(path: string, kind: string) {
    if (kind === "file") {
      await open(path);
      return;
    }
    await call<string>("open_recent_folder", { path });
    await refreshRecent();
  }
  async function folder() {
    const root = await backend.pickFolder();
    if (!root) return;
    await refreshRecent();
  }
  async function changed() {
    if (workspace.root) await workspace.refresh();
    if (!doc.path || doc.saving) return;
    try {
      const next = await backend.read(doc.path, false);
      if (next.diskHash === doc.diskHash) return;
      if (next.content === doc.content) {
        doc.markSaved(next, doc.identity);
        return;
      }
      if (doc.dirty) {
        external.value = next;
        doc.conflict = true;
      } else {
        doc.load(next);
      }
    } catch (error) {
      ui.notice = `当前文件不可读取：${String(error)}`;
    }
  }
  async function reloadExternal() {
    if (!doc.path) return;
    const next = await backend.read(doc.path, false);
    await load(next);
  }
  async function link(url: string) {
    if (url.startsWith("#")) {
      const index = doc.outline.findIndex(
        (h) =>
          h.text === decodeURIComponent(url.slice(1)) ||
          h.text.toLowerCase().replace(/\s/g, "-") === url.slice(1),
      );
      if (index >= 0) adapter.value?.scrollToHeading(index);
      return;
    }
    if (/^(https?:|mailto:)/i.test(url)) {
      await call("open_link", { url });
      return;
    }
    if (doc.path) {
      const root = doc.path.replace(/[^/\\]+$/, "");
      await open(root + decodeURIComponent(url.split("#")[0]));
    }
  }
  async function exportHtml() {
    const html = adapter.value?.getHTML();
    if (html === undefined) return;
    await call("export_file", {
      format: "html",
      content: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Document</title><style>body{max-width:800px;margin:50px auto;padding:0 30px;font:16px/1.6 sans-serif;color:#333}img{max-width:100%}pre,blockquote{padding:16px;background:#f6f6f6}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 13px}</style><body>${html}</body></html>`,
    });
  }
  function add(
    id: string,
    title: string,
    category: string,
    action: () => void | Promise<unknown>,
    shortcut?: string,
  ) {
    registry.register({ id, title, category, execute: action, shortcut });
  }
  add("app.quit", "退出 y-editor", "文件", () => call("request_quit"), "Mod+q");
  add("file.new", "新建", "文件", () => load(), "Mod+n");
  add(
    "file.newWindow",
    "新建窗口",
    "文件",
    () => call("new_window"),
    "Mod+Shift+n",
  );
  add("file.open", "打开…", "文件", () => open(), "Mod+o");
  add("file.folder", "打开文件夹…", "文件", folder);
  add("file.newFile", "新建文件…", "文件", async () => {
    try {
      const created = await workspace.create("newFile", workspace.root);
      if (created) await open(created);
    } catch (error) {
      report(error);
    }
  });
  add("file.newFolder", "新建文件夹…", "文件", async () => {
    try {
      await workspace.create("newFolder", workspace.root);
    } catch (error) {
      report(error);
    }
  });
  add("file.save", "保存", "文件", () => save(), "Mod+s");
  add("file.saveAs", "另存为…", "文件", () => save(true), "Mod+Shift+s");
  add(
    "file.quickOpen",
    "快速打开…",
    "文件",
    () => {
      ui.paletteMode = "files";
      ui.paletteQuery = "";
      ui.paletteOpen = true;
    },
    "Mod+p",
  );
  add(
    "command.open",
    "命令面板…",
    "视图",
    () => {
      ui.paletteMode = "commands";
      ui.paletteQuery = "";
      ui.paletteOpen = true;
    },
    "Mod+Shift+p",
  );
  add("file.word", "导出 Word…", "文件", async () => {
    const { exportWord } = await import("../editor/exportWord");
    await exportWord(adapter.value?.getHTML() ?? "", doc.name, doc.path);
  });
  add("file.export", "导出 HTML…", "文件", exportHtml);
  add("file.print", "打印 / 导出 PDF…", "文件", async () => {
    ui.source = false;
    await nextTick();
    return desktop ? call("print_document") : window.print();
  });
  add(
    "view.sidebar",
    "侧边栏",
    "视图",
    () => {
      ui.sidebar = !ui.sidebar;
      settings.value.sidebar = ui.sidebar;
    },
    "Mod+Shift+l",
  );
  add("view.wide", "宽屏模式", "视图", () => {
    settings.value.wideEditor = !settings.value.wideEditor;
  });
  add("file.recent", "最近打开…", "文件", () => {
    ui.paletteMode = "files";
    ui.paletteQuery = "";
    ui.paletteOpen = true;
  });
  add("view.ai", "AI 助手", "视图", () => {
    ui.assistant = !ui.assistant;
  });
  add(
    "editor.source",
    "源代码模式",
    "视图",
    () => {
      ui.source = !ui.source;
    },
    "Mod+/",
  );
  add("editor.focus", "专注模式", "视图", () => {
    ui.focus = !ui.focus;
  });
  add("editor.typewriter", "打字机模式", "视图", () => {
    ui.typewriter = !ui.typewriter;
  });
  add(
    "editor.find",
    "查找 / 替换…",
    "编辑",
    () => {
      ui.findOpen = !ui.findOpen;
    },
    "Mod+f",
  );
  add(
    "workspace.search",
    "搜索文件夹…",
    "编辑",
    () => {
      ui.paletteMode = "content";
      ui.paletteQuery = "";
      ui.paletteOpen = true;
    },
    "Mod+Shift+f",
  );
  add(
    "settings.open",
    "偏好设置…",
    "文件",
    () => {
      ui.settingsOpen = true;
    },
    "Mod+,",
  );
  for (const [name, title, key] of [
    ["bold", "加粗", "Mod+b"],
    ["italic", "斜体", "Mod+i"],
    ["link", "链接", "Mod+k"],
    ["strike", "删除线", ""],
    ["code", "代码块", ""],
    ["table", "表格", ""],
    ["quote", "引用", ""],
    ["list", "无序列表", ""],
    ["ordered-list", "有序列表", ""],
    ["check", "任务列表", ""],
    ["undo", "撤销", "Mod+z"],
    ["redo", "重做", "Mod+Shift+z"],
  ])
    add(
      `editor.${name}`,
      title,
      "格式",
      () => adapter.value?.format(name),
      key || undefined,
    );
  add("settings.shortcuts", "查看快捷键", "视图", () => {
    ui.settingsCategory = "快捷键";
    ui.settingsOpen = true;
  });
  add("theme.choose", "切换主题", "主题", () => {
    ui.paletteMode = "commands";
    ui.paletteQuery = "切换主题";
    ui.paletteOpen = true;
  });
  for (const preset of themePresets)
    add(`theme.preset.${preset.id}`, `切换主题：${preset.name}`, "主题", () => {
      settings.value.themePreset = preset.id;
    });
  add("theme.light", "浅色", "主题", () => {
    settings.value.appearance = "light";
  });
  add("theme.dark", "深色", "主题", () => {
    settings.value.appearance = "dark";
  });
  async function execute(id: string) {
    try {
      await registry.execute(id);
    } catch (error) {
      report(error);
    }
  }
  function shortcut(event: KeyboardEvent) {
    if (document.querySelector('[role="dialog"]') && !ui.paletteOpen) return;
    const command = registry.match(event);
    if (command) {
      event.preventDefault();
      event.stopPropagation();
      void execute(command.id);
    }
  }
  watch(
    () => [settings.value.shortcuts, ui.shortcutRecording],
    () => {
      if (desktop)
        void call("sync_shortcuts", {
          shortcuts: Object.fromEntries(
            registry
              .list()
              .map((c) => [
                c.id,
                ui.shortcutRecording ? "" : (c.shortcut ?? ""),
              ]),
          ),
        }).catch(report);
    },
    { deep: true },
  );
  watch(
    () => doc.identity,
    () => {
      ui.ready = false;
      adapter.value = undefined;
    },
    { flush: "sync" },
  );
  watch(
    () => doc.content,
    () => {
      if (!initialized) return;
      clearTimeout(autosave);
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => {
        void recover(doc.dirty ? doc.recovery() : null);
      }, 400);
      if (settings.value.autosave && doc.path && !doc.conflict)
        autosave = setTimeout(
          () => {
            if (doc.dirty) void save().catch(report);
          },
          Math.max(
            settings.value.autosaveDelay,
            doc.content.length > 2_000_000 ? 5000 : 0,
          ),
        );
    },
  );
  watch(
    () => settings.value,
    () => {
      if (initialized) {
        clearTimeout(settingsTimer);
        settingsTimer = setTimeout(() => {
          void settings.persist().catch(report);
        }, 500);
      }
    },
    { deep: true },
  );
  watch(
    () => [doc.name, doc.dirty],
    () => {
      if (desktop)
        void getCurrentWindow()
          .setTitle(`${doc.name}${doc.dirty ? " — 已修改" : ""} — y-editor`)
          .catch(report);
    },
  );
  onMounted(async () => {
    document.addEventListener("keydown", shortcut, true);
    try {
      const state = await backend.bootstrap();
      settings.adopt(state.settings);
      settings.configDir = state.configDir;
      workspace.root = state.root;
      ui.sidebar =
        state.settings.sidebar ||
        (!!state.root && desktop && getCurrentWindow().label !== "main");
      if (workspace.root) await workspace.refresh();
      if (state.recovery) {
        const choice = await choose(
          "恢复未保存的文档？",
          state.recovery.path ?? "未命名文档",
          [
            { id: "discard", label: "放弃草稿" },
            { id: "restore", label: "恢复", primary: true },
          ],
        );
        if (choice === "restore") doc.restore(state.recovery);
        else if (choice === "discard") await recover(null);
      }
      initialized = true;
      if (desktop) {
        cleanup.push(
          await listen("request-exit", () => {
            void getCurrentWindow().close().catch(report);
          }),
        );
        cleanup.push(
          await getCurrentWebviewWindow().listen<string>(
            "menu-command",
            (event) => {
              void execute(event.payload);
            },
          ),
        );
        cleanup.push(
          await getCurrentWebviewWindow().listen("workspace-changed", () => {
            clearTimeout(watcherTimer);
            watcherTimer = setTimeout(() => {
              void changed().catch(report);
            }, 500);
          }),
        );
        cleanup.push(
          await getCurrentWindow().onCloseRequested(async (event) => {
            if (allowClose) return;
            event.preventDefault();
            try {
              if (await canLeave()) {
                await recover(null);
                await settings.persist();
                allowClose = true;
                await useAiStore().persist();
                await call("quit_app");
              }
            } catch (error) {
              report(error);
            }
          }),
        );
      }
    } catch (error) {
      report(error);
    }
  });
  onBeforeUnmount(() => {
    cleanup.forEach((fn) => fn());
    document.removeEventListener("keydown", shortcut, true);
    clearTimeout(autosave);
    clearTimeout(recoveryTimer);
    clearTimeout(settingsTimer);
    clearTimeout(watcherTimer);
  });
  return {
    doc,
    workspace,
    ui,
    settings,
    adapter,
    registry,
    external,
    ready,
    report,
    execute,
    open,
    folder,
    recent,
    save,
    load,
    reloadExternal,
    link,
  };
}
