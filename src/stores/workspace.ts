import { defineStore } from "pinia";
import { ref } from "vue";
import { backend } from "../services/backend";
import { choose } from "../services/dialog";
import type { FileEntry, SearchResult } from "../types/workspace";
export const useWorkspaceStore = defineStore("workspace", () => {
  const root = ref<string | null>(null);
  const files = ref<FileEntry[]>([]);
  const hidden = ref(false);
  const allFiles = ref(false);
  const list = ref(false);
  const filter = ref("");
  const results = ref<SearchResult[]>([]);
  const searching = ref(false);
  async function refresh() {
    if (root.value)
      files.value = await backend.entries(hidden.value, allFiles.value);
  }
  /** Prompts for a name and creates it; returns the new path, or null on cancel. */
  async function create(
    kind: "newFile" | "newFolder",
    dirPath?: string | null,
  ): Promise<string | null> {
    const base = dirPath ?? root.value;
    if (!base) throw new Error("请先打开文件夹");
    const name = await choose(
      "输入名称",
      "",
      [
        { id: "cancel", label: "取消" },
        { id: "input", label: "确定", primary: true },
      ],
      kind === "newFile" ? "Untitled.md" : "新建文件夹",
    );
    if (!name || name === "cancel") return null;
    if (/[\\/]/.test(name) || name === "." || name === "..")
      throw new Error("名称不能包含路径分隔符");
    const target = base.replace(/[/\\]$/, "") + "/" + name;
    await backend.mutate(kind, target);
    await refresh();
    return target;
  }
  return {
    root,
    files,
    hidden,
    allFiles,
    list,
    filter,
    results,
    searching,
    refresh,
    create,
  };
});
