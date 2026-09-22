<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
const model = defineModel<string>({ required: true });
const props = defineProps<{ models: string[]; label: string }>();
const emit = defineEmits<{ commit: [] }>();
const selected = ref(model.value);
const query = ref(model.value);
watch(model, (value) => {
  if (value !== query.value) {
    query.value = value;
    selected.value = value;
  }
});
function type(value: string) {
  query.value = value;
  model.value = value;
}
const options = computed(() =>
  [...new Set([query.value, ...props.models])].filter(Boolean),
);
function select(value: unknown) {
  if (typeof value !== "string") return;
  selected.value = value;
  query.value = value;
  model.value = value;
  emit("commit");
}
</script>
<template>
  <Combobox
    :model-value="selected"
    open-on-focus
    open-on-click
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    class="model-picker"
    @update:model-value="select"
  >
    <ComboboxAnchor class="w-full">
      <ComboboxInput
        :model-value="query" @update:model-value="type"
        :aria-label="label"
        placeholder="模型 ID"
        @change="emit('commit')"
      />
    </ComboboxAnchor>
    <ComboboxList v-if="options.length" align="start" class="model-options">
      <ComboboxItem v-for="option in options" :key="option" :value="option">{{
        option
      }}</ComboboxItem>
    </ComboboxList>
  </Combobox>
</template>
