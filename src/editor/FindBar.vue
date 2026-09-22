<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
      <Button
        :title="replace ? '隐藏替换' : '显示替换'"
        :aria-label="replace ? '隐藏替换' : '显示替换'"
        :aria-expanded="replace"
        @click="replace = !replace"
      >
        <UiIcon name="chevron" :class="{ 'is-open': replace }"
      /></Button>
      <Input
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
      ><label
        ><Checkbox v-model="options.caseSensitive" aria-label="区分大小写" />Aa</label
      ><label><Checkbox v-model="options.regex" aria-label="正则表达式" />.*</label
      ><Button title="上一个" aria-label="上一个" @click="next(-1)">
        <UiIcon name="up" /></Button
      ><Button title="下一个" aria-label="下一个" @click="next()">
        <UiIcon name="down" /></Button
      ><Button aria-label="关闭查找" @click="ui.findOpen = false">
        <UiIcon name="close"
      /></Button>
    </div>
    <div v-if="replace">
      <Input
        v-model="replacement"
        aria-label="替换为"
        placeholder="替换为"
      /><Button :disabled="!result.matches.length" @click="replaceOne">
        替换</Button
      ><Button
        :disabled="!result.matches.length || !!result.error"
        @click="
          doc.update(replaceMatches(doc.content, query, replacement, options))
        "
      >
        全部替换
      </Button>
    </div>
  </div>
</template>
