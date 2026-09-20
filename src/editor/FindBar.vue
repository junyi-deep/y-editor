<script setup lang="ts">
import UiIcon from "../components/UiIcon.vue";
import { computed, ref, watch } from "vue";
import { useDocumentStore } from "../stores/document";
import { useEditorStore } from "../stores/editor";
import {
  findMatches,
  replaceMatches,
  replaceMatchAt,
  type FindOptions,
} from "./markdown/find";
const emit = defineEmits<{ jump: [line: number] }>();
const doc = useDocumentStore();
const ui = useEditorStore();
const query = ref("");
const replacement = ref("");
const replace = ref(false);
const index = ref(0);
const options = ref<FindOptions>({
  regex: false,
  caseSensitive: false,
  wholeWord: false,
});
const result = computed(() => {
  try {
    return {
      matches: findMatches(doc.content, query.value, options.value),
      error: "",
    };
  } catch (error) {
    return { matches: [], error: String(error) };
  }
});
watch(
  [query, options],
  () => {
    index.value = 0;
    const first = result.value.matches[0];
    if (first) emit("jump", first.line);
  },
  { deep: true },
);
function next(direction = 1) {
  const hits = result.value.matches;
  if (!hits.length) return;
  index.value = (index.value + direction + hits.length) % hits.length;
  emit("jump", hits[index.value].line);
}
function replaceOne() {
  const match = result.value.matches[index.value];
  if (!match) return;
  doc.update(
    replaceMatchAt(
      doc.content,
      query.value,
      replacement.value,
      options.value,
      match.start,
    ),
  );
  index.value = Math.min(
    index.value,
    Math.max(0, result.value.matches.length - 1),
  );
}
</script>
<template>
  <div class="find-bar" @keydown.esc="ui.findOpen = false">
    <div>
      <button title="替换" @click="replace = !replace">
        {{ replace ? "▾" : "▸" }}</button
      ><input
        v-model="query"
        aria-label="查找"
        placeholder="查找"
        autofocus
        @keydown.enter="next()"
      /><span>{{
        result.error
          ? "无效正则"
          : `${result.matches.length ? index + 1 : 0} / ${result.matches.length}`
      }}</span
      ><label><input v-model="options.caseSensitive" type="checkbox" />Aa</label
      ><label><input v-model="options.regex" type="checkbox" />.*</label
      ><button title="上一个" @click="next(-1)">↑</button
      ><button title="下一个" @click="next()">↓</button
      ><button aria-label="关闭查找" @click="ui.findOpen = false">
        <UiIcon name="close" /></button>
    </div>
    <div v-if="replace">
      <input
        v-model="replacement"
        aria-label="替换为"
        placeholder="替换为"
      /><button :disabled="!result.matches.length" @click="replaceOne">
        替换</button
      ><button
        :disabled="!result.matches.length || !!result.error"
        @click="
          doc.update(replaceMatches(doc.content, query, replacement, options))
        "
      >
        全部替换
      </button>
    </div>
  </div>
</template>
