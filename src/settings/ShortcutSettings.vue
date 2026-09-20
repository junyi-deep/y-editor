<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import type { CommandRegistry } from "../command-palette/registry";
import { eventShortcut, normalizeShortcut } from "../command-palette/shortcuts";
import { useSettingsStore } from "../stores/settings";
import { useEditorStore } from "../stores/editor";
const ui = useEditorStore();
onBeforeUnmount(() => {
  ui.shortcutRecording = false;
});
const props = defineProps<{ registry: CommandRegistry }>();
const settings = useSettingsStore(),
  filter = ref(""),
  error = ref("");
const commands = computed(() => props.registry.list(filter.value));
function record(event: KeyboardEvent, id: string) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    (event.target as HTMLElement).blur();
    return;
  }
  if (
    ["Backspace", "Delete"].includes(event.key) &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    settings.value.shortcuts[id] = "";
    return;
  }
  const shortcut = eventShortcut(event);
  if (!shortcut) return;
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !/^F\d+$/.test(event.key)
  ) {
    error.value = "请使用包含 Ctrl / Cmd / Alt 的组合键或功能键。";
    return;
  }
  const conflict = props.registry
    .list()
    .find(
      (c) =>
        c.id !== id &&
        c.shortcut &&
        normalizeShortcut(c.shortcut) === normalizeShortcut(shortcut),
    );
  if (conflict) {
    error.value = `该快捷键已用于“${conflict.title}”，请先清除或修改它。`;
    return;
  }
  settings.value.shortcuts[id] = shortcut;
  error.value = "";
}
</script>
<template>
  <section>
    <h3>快捷键</h3>
    <p class="help">
      点击快捷键框后按下新组合键。Mod 表示 Cmd / Ctrl；按 Backspace
      清除映射，Esc 结束录入。
    </p>
    <input v-model="filter" placeholder="筛选命令" aria-label="筛选快捷键" />
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-for="command in commands" :key="command.id" class="shortcut-row">
      <span
        >{{ command.title }}<small>{{ command.category }}</small></span
      ><input
        :value="command.shortcut || ''"
        readonly
        :aria-label="command.title + '快捷键'"
        placeholder="按下组合键"
        @focus="ui.shortcutRecording = true"
        @blur="ui.shortcutRecording = false"
        @keydown="record($event, command.id)"
      /><button
        title="恢复默认快捷键"
        @click="delete settings.value.shortcuts[command.id]"
      >
        重置
      </button>
    </div>
    <button @click="settings.value.shortcuts = {}">恢复全部默认快捷键</button>
  </section>
</template>
<style scoped>
.shortcut-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--y-border);
}
.shortcut-row > span {
  flex: 1;
}
.shortcut-row small {
  display: block;
  color: var(--y-muted);
  font-size: 10px;
}
.shortcut-row input {
  width: 150px;
}
</style>
