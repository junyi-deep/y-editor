<script setup lang="ts">
defineProps<{
  name:
    | "panel"
    | "spark"
    | "file"
    | "chevron"
    | "sun"
    | "moon"
    | "close"
    | "leaf";
}>();
const paths = {
  panel: "M3 4h18v16H3z M9 4v16",
  spark: "m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z",
  file: "M14 3H5v18h14V8z M14 3v5h5 M8 13h8 M8 17h5",
  chevron: "m9 5 7 7-7 7",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5l1.5 1.5 M5 19l1.5-1.5 M17.5 6.5l1.5-1.5",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z",
  close: "m6 6 12 12 M6 18 18 6",
  leaf: "M20 4C9 2 3 8 5 15c6 7 16 0 15-11z M4 21 15 10",
};
</script>
<template>
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
