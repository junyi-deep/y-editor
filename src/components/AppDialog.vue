<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { dialog, finishDialog } from "../services/dialog";
const field = ref("");
const panel = ref<HTMLElement>();
let previous: HTMLElement | null = null;
watch(dialog, async (value) => {
  if (value) {
    previous = document.activeElement as HTMLElement;
    field.value = value.input ?? "";
    await nextTick();
    panel.value?.querySelector<HTMLElement>("input,button")?.focus();
    const input = panel.value?.querySelector("input");
    if (input)
      input.setSelectionRange(
        0,
        input.value.lastIndexOf(".") > 0
          ? input.value.lastIndexOf(".")
          : input.value.length,
      );
  } else previous?.focus();
});
function keys(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation();
    finishDialog(null);
  }
  if (event.key === "Tab") {
    const items = Array.from(
      panel.value?.querySelectorAll<HTMLElement>("button,input") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index === 0) {
      event.preventDefault();
      items.at(-1)?.focus();
    }
    if (!event.shiftKey && index === items.length - 1) {
      event.preventDefault();
      items[0]?.focus();
    }
  }
}
</script>
<template>
  <div v-if="dialog" class="modal-shade" @keydown="keys">
    <section
      ref="panel"
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <h2 id="dialog-title">{{ dialog.title }}</h2>
      <p>{{ dialog.message }}</p>
      <input
        v-if="dialog.input !== undefined"
        v-model="field"
        aria-label="名称"
        @keydown.enter="finishDialog(field)"
      />
      <div class="dialog-actions">
        <button
          v-for="choice in dialog.choices"
          :key="choice.id"
          :class="{ primary: choice.primary }"
          @click="finishDialog(choice.id === 'input' ? field : choice.id)"
        >
          {{ choice.label }}
        </button>
      </div>
    </section>
  </div>
</template>
