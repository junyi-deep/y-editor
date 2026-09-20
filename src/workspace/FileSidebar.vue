<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import { useDocumentStore } from "../stores/document";
import { useEditorStore } from "../stores/editor";
import { backend, call } from "../services/backend";
import { choose } from "../services/dialog";
import { useSettingsStore } from "../stores/settings";
import UiIcon from "../components/UiIcon.vue";
import { outlineTree, visibleOutline } from "../editor/markdown/outline";
import type { FileEntry } from "../types/workspace";
const emit = defineEmits<{
  open: [path: string, line?: number];
  folder: [];
  recent: [path: string, kind: string];
  heading: [index: number];
  error: [error: unknown];
}>();
const ws = useWorkspaceStore();
const doc = useDocumentStore();
const ui = useEditorStore();
const collapsed = ref(new Set<string>());
const menu = ref<FileEntry | null>(null);
const menuOpen = ref(false);
const settings = useSettingsStore();
const outlineFilter = ref("");
const outlineCollapsed = ref(new Set<string>());
const recentOpen = ref(false);
const menuPosition = ref({ x: 0, y: 0 });
function context(event: MouseEvent, file: FileEntry | null = null) {
  menu.value = file;
  menuOpen.value = true;
  menuPosition.value = {
    x: Math.max(0, Math.min(event.clientX, window.innerWidth - 220)),
    y: Math.max(0, Math.min(event.clientY, window.innerHeight - 225)),
  };
}
function dismiss(event: Event) {
  if (!(event.target as Element)?.closest(".file-context"))
    menuOpen.value = false;
}
onMounted(() => window.addEventListener("pointerdown", dismiss));
onBeforeUnmount(() => window.removeEventListener("pointerdown", dismiss));
watch(
  () => doc.identity,
  () => outlineCollapsed.value.clear(),
);
const visible = computed(() =>
  ws.files
    .filter((file) => {
      if (ws.list && file.directory) return false;
      if (!file.relative.toLowerCase().includes(ws.filter.toLowerCase()))
        return false;
      if (
        !ws.list &&
        !ws.filter &&
        [...collapsed.value].some((dir) => file.relative.startsWith(dir + "/"))
      )
        return false;
      return true;
    })
    .sort((a, b) =>
      a.relative.localeCompare(b.relative, undefined, { numeric: true }),
    ),
);
const outline = computed(() =>
  visibleOutline(
    outlineTree(doc.outline),
    outlineCollapsed.value,
    outlineFilter.value,
  ),
);
function fold(key: string) {
  if (outlineCollapsed.value.has(key)) outlineCollapsed.value.delete(key);
  else outlineCollapsed.value.add(key);
}
function toggle(file: FileEntry) {
  if (!file.directory) emit("open", file.path);
  else {
    if (collapsed.value.has(file.relative))
      collapsed.value.delete(file.relative);
    else collapsed.value.add(file.relative);
  }
}
const tree = ref<HTMLElement>();
const sidebar = ref<HTMLElement>();
const scrollTop = ref(0);
// Mirrors --y-row-height, which also sets the rendered row box, so the
// virtualiser's spacer can never disagree with the rows it positions.
const rowHeight = ref(31);
onMounted(() => {
  const declared = Number.parseFloat(
    getComputedStyle(sidebar.value as HTMLElement).getPropertyValue(
      "--y-row-height",
    ),
  );
  if (declared > 0) rowHeight.value = declared;
});
const windowStart = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - 12),
);
const windowRows = computed(() =>
  visible.value.slice(windowStart.value, windowStart.value + 100),
);
watch(
  () => ws.filter,
  () => {
    scrollTop.value = 0;
    tree.value?.scrollTo(0, 0);
  },
);
async function treeKeys(event: KeyboardEvent) {
  const index = Number(
    (document.activeElement as HTMLElement)?.dataset.index ?? 0,
  );
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next = Math.max(
      0,
      Math.min(
        visible.value.length - 1,
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? visible.value.length - 1
            : index + (event.key === "ArrowDown" ? 1 : -1),
      ),
    );
    if (tree.value) {
      const top = next * rowHeight.value;
      if (top < tree.value.scrollTop) tree.value.scrollTop = top;
      else if (
        top + rowHeight.value >
        tree.value.scrollTop + tree.value.clientHeight
      )
        tree.value.scrollTop =
          top - tree.value.clientHeight + rowHeight.value;
      scrollTop.value = tree.value.scrollTop;
    }
    await nextTick();
    tree.value
      ?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)
      ?.focus();
  }
  const file = visible.value[index];
  if (file?.directory && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "ArrowLeft") collapsed.value.add(file.relative);
    else collapsed.value.delete(file.relative);
  }
}
async function operation(action: string, entry = menu.value) {
  menu.value = null;
  menuOpen.value = false;
  try {
    if (action === "reveal" && entry) {
      await call("reveal_file", { path: entry.path });
      return;
    }
    if (action === "trash" && entry) {
      const choice = await choose("移到废纸篓？", entry.name, [
        { id: "cancel", label: "取消" },
        { id: "trash", label: "移到废纸篓" },
      ]);
      if (choice !== "trash") return;
      const containsCurrent =
        entry.path === doc.path ||
        (entry.directory &&
          doc.path
            ?.replaceAll("\\", "/")
            .startsWith(entry.path.replaceAll("\\", "/") + "/"));
      if (containsCurrent && doc.dirty)
        throw new Error("请先保存当前文档，再将其移到废纸篓。");
      await backend.mutate("trash", entry.path);
      if (containsCurrent) doc.load();
    } else if (action === "newFile" || action === "newFolder") {
      // Creating on a file row lands beside it; on blank space, at the root.
      const created = await ws.create(
        action,
        entry
          ? entry.directory
            ? entry.path
            : entry.path.replace(/[^/\\]+$/, "")
          : ws.root,
      );
      if (created && action === "newFile") emit("open", created);
    } else {
      const root = entry?.path.replace(/[^/\\]+$/, "");
      if (!root) throw new Error("请先打开文件夹");
      const name = await choose(
        action === "rename" ? "重命名" : "输入名称",
        "",
        [
          { id: "cancel", label: "取消" },
          { id: "input", label: "确定", primary: true },
        ],
        action === "duplicate" ? `副本-${entry?.name}` : entry?.name,
      );
      if (!name || name === "cancel") return;
      if (/[\\/]/.test(name) || name === "." || name === "..")
        throw new Error("名称不能包含路径分隔符");
      const target = root.replace(/[/\\]$/, "") + "/" + name;
      await backend.mutate(action, entry!.path, target);
      if (action === "rename" && entry && doc.path) {
        if (entry.path === doc.path) doc.path = target;
        else if (
          entry.directory &&
          doc.path
            .replaceAll("\\", "/")
            .startsWith(entry.path.replaceAll("\\", "/") + "/")
        )
          doc.path = target + doc.path.slice(entry.path.length);
      }
      if (action === "newFile") emit("open", target);
    }
    await ws.refresh();
  } catch (error) {
    emit("error", error);
  }
}
</script>
<template>
  <aside ref="sidebar" class="file-sidebar" aria-label="侧边栏">
    <div class="sidebar-tabs">
      <button
        :class="{ active: ui.sidebarTab === 'files' }"
        @click="ui.sidebarTab = 'files'"
      >
        文件</button
      ><button
        :class="{ active: ui.sidebarTab === 'outline' }"
        @click="ui.sidebarTab = 'outline'"
      >
        大纲</button
      ><button
        title="最近打开的文件和文件夹"
        aria-label="最近打开"
        @click="recentOpen = !recentOpen"
      >
        <UiIcon name="recent" />
      </button>
    </div>
    <div v-if="recentOpen" class="recent-list">
      <strong>最近打开</strong
      ><button
        v-for="entry in settings.value.recentEntries"
        :key="entry.path"
        :title="entry.path"
        @click="
          emit('recent', entry.path, entry.kind);
          recentOpen = false;
        "
      >
        <UiIcon :name="entry.kind === 'folder' ? 'folder' : 'file'" /><span>{{
          entry.path.split(/[/\\]/).pop()
        }}</span>
      </button>
      <p v-if="!settings.value.recentEntries.length" class="empty-hint">
        暂无最近记录
      </p>
    </div>
    <template v-if="ui.sidebarTab === 'files'">
      <div v-if="!ws.root" class="sidebar-empty">
        <button @click="emit('folder')">打开文件夹…</button>
      </div>
      <div
        v-else
        ref="tree"
        class="file-tree"
        role="tree"
        aria-label="文件列表"
        @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
        @keydown="treeKeys"
        @contextmenu.prevent="context($event)"
      >
        <div
          :style="{
            paddingTop: windowStart * rowHeight + 'px',
            paddingBottom:
              Math.max(0, visible.length - windowStart - windowRows.length) *
                rowHeight +
              'px',
          }"
        >
          <button
            v-for="(file, row) in windowRows"
            :key="file.path"
            class="tree-item"
            :class="{ selected: file.path === doc.path }"
            :data-index="windowStart + row"
            :aria-posinset="windowStart + row + 1"
            :aria-setsize="visible.length"
            :style="{
              paddingLeft:
                12 +
                (ws.list ? 0 : file.relative.split('/').length - 1) * 14 +
                'px',
            }"
            role="treeitem"
            :aria-expanded="
              file.directory ? !collapsed.has(file.relative) : undefined
            "
            :title="file.relative"
            @click="toggle(file)"
            @contextmenu.prevent.stop="context($event, file)"
          >
            <UiIcon
              :name="
                file.directory
                  ? collapsed.has(file.relative)
                    ? 'folder'
                    : 'folderOpen'
                  : 'file'
              "
            /><span>{{ ws.list ? file.relative : file.name }}</span
            ><span v-if="file.path === doc.path && doc.dirty">•</span>
          </button>
        </div>
        <p v-if="!visible.length" class="empty-hint">
          {{
            ws.filter
              ? "没有匹配的文件"
              : "这个文件夹是空的，右键可以新建文件或文件夹"
          }}
        </p>
      </div>
      <div class="sidebar-filter sidebar-filter-bottom">
        <input
          v-model="ws.filter"
          placeholder="搜索文件"
          aria-label="搜索文件"
        /><button
          :title="ws.list ? '树形视图' : '列表视图'"
          :aria-label="ws.list ? '切换为树形视图' : '切换为列表视图'"
          @click="ws.list = !ws.list"
        >
          <UiIcon name="list" />
        </button>
      </div>
    </template>
    <template v-else>
      <nav class="outline-list" aria-label="文档大纲">
        <div
          v-for="heading in outline"
          :key="heading.key"
          class="outline-row"
          :style="{ paddingLeft: 10 + heading.depth * 14 + 'px' }"
        >
          <button
            v-if="heading.hasChildren"
            class="outline-toggle"
            :aria-label="
              (outlineCollapsed.has(heading.key) ? '展开 ' : '折叠 ') +
              heading.text
            "
            :aria-expanded="!outlineCollapsed.has(heading.key)"
            @click="fold(heading.key)"
          >
            <UiIcon
              name="chevron"
              :class="{ expanded: !outlineCollapsed.has(heading.key) }"
            /></button
          ><span v-else class="outline-toggle-spacer" /><button
            class="outline-title"
            :title="
              (settings.value.outlineNumbering ? heading.number + ' ' : '') +
              heading.text
            "
            @click="emit('heading', heading.index)"
          >
            <span
              v-if="settings.value.outlineNumbering"
              class="outline-number"
              >{{ heading.number }}</span
            >
            {{ heading.text }}
          </button>
        </div>
        <p v-if="!outline.length" class="empty-hint">没有匹配标题</p>
      </nav>
      <div class="sidebar-filter sidebar-filter-bottom">
        <input
          v-model="outlineFilter"
          placeholder="搜索大纲"
          aria-label="搜索大纲"
        />
      </div>
    </template>
    <div
      v-if="menuOpen"
      class="file-context"
      role="menu"
      :style="{ left: menuPosition.x + 'px', top: menuPosition.y + 'px' }"
      @keydown.esc="menuOpen = false"
    >
      <strong>{{ menu?.name ?? ws.root?.split(/[/\\]/).pop() }}</strong>
      <button @click="operation('newFile')">新建文件…</button>
      <button @click="operation('newFolder')">新建文件夹…</button>
      <template v-if="menu">
        <button @click="operation('rename')">重命名…</button
        ><button v-if="!menu.directory" @click="operation('duplicate')">
          创建副本…</button
        ><button @click="operation('reveal')">在 Finder / Explorer 显示</button
        ><button @click="operation('trash')">移到废纸篓…</button></template
      >
      <button
        @click="
          ws.hidden = !ws.hidden;
          ws.refresh().catch((e) => emit('error', e));
          menuOpen = false;
        "
      >
        {{ ws.hidden ? "隐藏隐藏文件" : "显示隐藏文件" }}
      </button>
      <button @click="menuOpen = false">取消</button>
    </div>
  </aside>
</template>
