<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createEditorAdapter } from "./adapter/milkdown";
import type { Appearance, EditorAdapter } from "../types/editor";
import { choose } from "../services/dialog";
import { useSettingsStore } from "../stores/settings";
import { call } from "../services/backend";
const props = defineProps<{
  content: string;
  readOnly?: boolean;
  appearance: Appearance;
  path: string | null;
  source: boolean;
  focus: boolean;
  typewriter: boolean;
  spellcheck: boolean;
  renderLargeDiagrams?: boolean;
}>();
function applyReadOnly() {
  if (host.value && host.value.dataset.readonly !== String(!!props.readOnly))
    host.value.dataset.readonly = String(!!props.readOnly);
}
watch(() => props.readOnly, applyReadOnly);
const emit = defineEmits<{
  change: [content: string];
  ready: [adapter: EditorAdapter];
  error: [message: string];
  save: [];
  selection: [text: string, rect?: DOMRect];
  link: [url: string];
  reference: [text: string, label: string];
  immersive: [active: boolean];
}>();
const host = ref<HTMLElement>();
let adapter: EditorAdapter | undefined;
let mounted = true;
let initialized = false;
onMounted(async () => {
  if (!host.value) return;
  try {
    adapter = createEditorAdapter(
      host.value,
      (value) => emit("change", value),
      props.appearance,
      {
        reference: (text, label) => emit("reference", text, label),
        immersive: (active) => emit("immersive", active),
        renderLargeDiagrams: () => props.renderLargeDiagrams !== false,
        save: async () => {
          emit("save");
        },
        resolveImage: (source) =>
          props.path
            ? call<string>("image_read", {
                documentPath: props.path,
                source: decodeURIComponent(source),
              })
            : Promise.reject(new Error("请先保存文档")),
        image: async (file, pasted) => {
          const settings = useSettingsStore();
          let filename = pasted
            ? `${Date.now()}.${file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : file.name.split(".").pop() || "bin"}`
            : file.name;
          if (pasted && settings.value.pastePrompt) {
            const name = await choose(
              "附件文件名",
              "附件将保存到文档旁的附件目录。",
              [
                { id: "input", label: "保存", primary: true },
                { id: "cancel", label: "取消" },
              ],
              filename,
            );
            if (!name || name === "cancel") throw new Error("已取消附件导入");
            filename = name;
          }
          if (!props.path) throw new Error("请先保存文档，再插入图片。");
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          return call<string>("image_save", {
            documentPath: props.path,
            data,
            mime: file.type,
            filename,
          });
        },
        selection: (text, rect) => emit("selection", text, rect),
        error: (message) => emit("error", message),
        link: (url) => emit("link", url),
      },
    );
    await adapter.open(props.content);
    initialized = true;
    applyReadOnly();
    if (props.source) adapter.toggleSourceMode();
    if (props.focus) adapter.toggleFocusMode();
    if (props.typewriter) adapter.toggleTypewriterMode();
    host.value
      ?.querySelectorAll("[contenteditable]")
      .forEach((el) => el.setAttribute("spellcheck", String(props.spellcheck)));
    if (mounted) emit("ready", adapter);
  } catch (error) {
    if (mounted) emit("error", String(error));
  }
});
watch(
  () => props.content,
  (value) => {
    if (initialized && adapter?.getMarkdown() !== value)
      adapter?.setMarkdown(value);
  },
);
watch(
  () => props.appearance,
  (value) => adapter?.setTheme(value),
);
watch(
  () => props.source,
  () => {
    if (initialized) adapter?.toggleSourceMode();
  },
);
watch(
  () => props.focus,
  () => {
    if (initialized) adapter?.toggleFocusMode();
  },
);
watch(
  () => props.typewriter,
  () => {
    if (initialized) adapter?.toggleTypewriterMode();
  },
);
watch(
  () => props.spellcheck,
  (value) =>
    host.value
      ?.querySelectorAll("[contenteditable]")
      .forEach((el) => el.setAttribute("spellcheck", String(value))),
);
watch(
  () => props.renderLargeDiagrams,
  () => adapter?.refreshDiagrams(),
);
onBeforeUnmount(() => {
  mounted = false;
  adapter?.destroy();
});
</script>
<template>
  <div ref="host" class="editor-host" aria-label="Markdown 编辑器" />
</template>
