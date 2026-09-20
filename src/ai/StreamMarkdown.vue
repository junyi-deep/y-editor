<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { call, desktop } from "../services/backend";
import MarkdownIt from "markdown-it";
const parser = new MarkdownIt({ html: false, linkify: true, breaks: true });
// Remote images are not fetched automatically from model output.
parser.renderer.rules.image = (tokens, index) =>
  parser.utils.escapeHtml(`[图片: ${tokens[index].content}]`);
function link(event: MouseEvent) {
  const anchor = (event.target as Element).closest("a");
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute("href") ?? "";
  if (desktop && /^(https?:|mailto:)/.test(href))
    void call("open_link", { url: href }).catch(() => {});
}
const props = defineProps<{ text: string }>();
const html = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.text,
  () => {
    if (timer) return;
    timer = setTimeout(() => {
      html.value = parser.render(props.text);
      timer = undefined;
    }, 50);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template><div class="stream-markdown" v-html="html" @click="link" /></template>
