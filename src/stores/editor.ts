import { ref } from "vue";
import { defineStore } from "pinia";
export const useEditorStore = defineStore("editor", () => {
  const sidebar = ref(false);
  const assistant = ref(false);
  const help = ref(false);
  const reading = ref(false);
  const aiFullscreen = ref(false);
  const ready = ref(false);
  const source = ref(false);
  const focus = ref(false);
  const typewriter = ref(false);
  const sidebarTab = ref<"files" | "outline">("files");
  const findOpen = ref(false);
  const settingsOpen = ref(false);
  const settingsCategory = ref("通用");
  const shortcutRecording = ref(false);
  const paletteMode = ref<"files" | "content" | "commands">("files");
  const paletteOpen = ref(false);
  const paletteQuery = ref("");
  const error = ref("");
  const notice = ref("");
  return {
    sidebar,
    assistant,
    help,
    reading,
    aiFullscreen,
    ready,
    source,
    focus,
    typewriter,
    sidebarTab,
    findOpen,
    settingsOpen,
    settingsCategory,
    shortcutRecording,
    paletteMode,
    paletteOpen,
    paletteQuery,
    error,
    notice,
  };
});
