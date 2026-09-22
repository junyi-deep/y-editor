<script setup lang="ts">
import type { ComboboxInputEmits, ComboboxInputProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ComboboxInput, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  ComboboxInputProps & {
    class?: HTMLAttributes["class"];
  }
>();

const emits = defineEmits<ComboboxInputEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <div data-slot="command-input-wrapper" class="flex min-w-0 items-center">
    <ComboboxInput
      data-slot="command-input"
      :class="
        cn(
          'placeholder:text-muted-foreground flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-[13px] outline-none disabled:cursor-not-allowed disabled:opacity-50',
          props.class,
        )
      "
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />
    </ComboboxInput>
  </div>
</template>
