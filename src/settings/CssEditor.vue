<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useSettingsStore } from "../stores/settings";
import { trapDialogTab } from "../services/focus";
const emit = defineEmits<{ close: [] }>();
const settings = useSettingsStore(),
  input = ref<HTMLTextAreaElement>();
const previous = document.activeElement as HTMLElement | null;
onMounted(() => input.value?.focus());
onBeforeUnmount(() => previous?.isConnected && previous.focus());
</script>
<template>
  <div
    class="modal-shade css-editor-shade"
    @click.self="emit('close')"
    @keydown.esc.stop="emit('close')"
    @keydown.stop
  >
    <section
      class="css-editor-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="自定义 CSS"
      @keydown="trapDialogTab"
    >
      <header>
        <h2>自定义 CSS</h2>
        <Button title="关闭" aria-label="关闭自定义 CSS" @click="emit('close')">
          ×
        </Button>
      </header>
      <p class="help">实时预览。#write 自动映射到正文；关闭弹窗后保留修改。</p>
      <textarea
        ref="input"
        v-model="settings.value.customCss"
        spellcheck="false"
        aria-label="CSS 内容"
        placeholder=".vditor-reset h1 { color: #4183c4; }"
      />
      <footer><Button @click="emit('close')">完成</Button></footer>
    </section>
  </div>
</template>
