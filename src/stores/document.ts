import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { headings, statistics } from "../editor/markdown/metadata";
import type { DocumentSnapshot } from "../types/editor";
import type { FileDocument, Recovery } from "../types/workspace";
export const useDocumentStore = defineStore("document", () => {
  const content = ref("");
  const savedContent = ref("");
  const path = ref<string | null>(null);
  const diskHash = ref("");
  const lineEnding = ref<"LF" | "CRLF">("LF");
  const bom = ref(false);
  const version = ref(0);
  const identity = ref(0);
  const saving = ref(false);
  const conflict = ref(false);
  const dirty = computed(() => content.value !== savedContent.value);
  const name = computed(() => path.value?.split(/[/\\]/).pop() || "未命名");
  const outline = computed(() => headings(content.value));
  const stats = computed(() => statistics(content.value));
  function update(value: string) {
    if (content.value !== value) {
      content.value = value;
      version.value++;
    }
  }
  function load(doc?: FileDocument) {
    path.value = doc?.path ?? null;
    content.value = doc?.content ?? "";
    savedContent.value = content.value;
    diskHash.value = doc?.diskHash ?? "";
    lineEnding.value = doc?.lineEnding ?? "LF";
    bom.value = doc?.bom ?? false;
    identity.value++;
    version.value++;
    conflict.value = false;
  }
  function restore(snapshot: Recovery) {
    load();
    path.value = snapshot.path;
    content.value = snapshot.content;
    savedContent.value = "\u0000";
    diskHash.value = snapshot.diskHash;
    lineEnding.value = snapshot.lineEnding;
    bom.value = snapshot.bom;
    version.value++;
  }
  function markSaved(doc: FileDocument, id: number) {
    if (identity.value !== id) return;
    path.value = doc.path;
    savedContent.value = doc.content;
    diskHash.value = doc.diskHash;
    conflict.value = false;
  }
  function snapshot(): DocumentSnapshot {
    return {
      path: path.value ?? undefined,
      content: content.value,
      dirty: dirty.value,
      version: version.value,
    };
  }
  function recovery(): Recovery {
    return {
      path: path.value,
      content: content.value,
      diskHash: diskHash.value,
      lineEnding: lineEnding.value,
      bom: bom.value,
      savedAt: Date.now(),
    };
  }
  return {
    content,
    savedContent,
    path,
    diskHash,
    lineEnding,
    bom,
    version,
    identity,
    dirty,
    outline,
    stats,
    name,
    saving,
    conflict,
    update,
    load,
    restore,
    markSaved,
    snapshot,
    recovery,
  };
});
