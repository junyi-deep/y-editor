<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui";
import { computed, inject, useAttrs, type HTMLAttributes } from "vue";
import { commandRegistryKey, shortcutLabel } from "@/command-palette/registry";
import type { ButtonVariants } from ".";
import { Primitive } from "reka-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from ".";

defineOptions({ inheritAttrs: false });
interface Props extends PrimitiveProps {
  command?: string;
  shortcut?: string;
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
});
const attrs = useAttrs();
const registry = inject(commandRegistryKey, undefined);
const tooltip = computed(() => {
  const label = attrs.title ?? attrs["aria-label"];
  if (!label) return undefined;
  const combo = props.command
    ? registry?.list().find((c) => c.id === props.command)?.shortcut
    : props.shortcut;
  return `${label} · ${combo ? shortcutLabel(combo) : "未设置快捷键"}`;
});
</script>

<template>
  <Primitive
    data-slot="button"
    v-bind="attrs"
    :title="tooltip"
    :data-variant="variant"
    :data-size="size"
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
