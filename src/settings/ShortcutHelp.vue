<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { searchCommands } from "../command-palette/pinyin";
import type { CommandRegistry } from "../command-palette/registry";
const props = defineProps<{ registry: CommandRegistry }>();
const query = ref("");
const searchInput = ref<HTMLInputElement>();
onMounted(() => searchInput.value?.focus());
const NO_SHORTCUT = "无快捷键";
const groups = computed(() => {
  const result: Record<string, ReturnType<CommandRegistry["list"]>> = {};
  // Browsing lists shortcuts; searching also reaches functions that have none.
  const searching = !!query.value.trim();
  for (const command of searchCommands(props.registry.list(), query.value)) {
    if (!command.shortcut && !searching) continue;
    (result[command.shortcut ? command.category : NO_SHORTCUT] ??= []).push(
      command,
    );
  }
  return result;
});
</script>
<template>
  <aside class="shortcut-help">
    <header>
      <h3>快捷键帮助</h3>
    </header>
    <div class="shortcut-help-body">
      <input
        ref="searchInput"
        v-model="query"
        placeholder="搜索快捷键或功能"
        aria-label="搜索快捷键帮助"
      />
      <p v-if="!Object.keys(groups).length" class="empty-hint">
        没有匹配的快捷键，试试功能名称或拼音。
      </p>
      <section v-for="(commands, category) in groups" :key="category">
        <h4>{{ category }}</h4>
        <div v-for="command in commands" :key="command.id">
          <span>{{ command.title }}</span
          ><kbd v-if="command.shortcut">{{ command.shortcut }}</kbd>
        </div>
      </section>
      <p class="help">
        Mod 表示 macOS 的 ⌘ / Windows 的 Ctrl。可在偏好设置 → 快捷键中重新映射。
      </p>
    </div>
  </aside>
</template>
