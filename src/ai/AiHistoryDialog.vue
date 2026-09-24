<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAiStore } from "../stores/ai";
import { useWorkspaceStore } from "../stores/workspace";
const emit = defineEmits<{ close: [] }>();
const ai = useAiStore(),
  workspace = useWorkspaceStore();
const query = ref(""),
  allWorkspaces = ref(false),
  error = ref(""),
  pending = ref(false);
const histories = computed(() =>
  ai.history
    .filter(
      (item) =>
        (allWorkspaces.value || item.workspace === (workspace.root ?? "")) &&
        `${item.title} ${item.workspace}`
          .toLowerCase()
          .includes(query.value.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt),
);
onMounted(() =>
  ai.refreshHistory().catch((cause) => (error.value = String(cause))),
);
async function load(id: string, fork = false) {
  pending.value = true;
  try {
    await ai.loadHistory(id, fork);
    emit("close");
  } catch (cause) {
    error.value = String(cause);
  } finally {
    pending.value = false;
  }
}
async function remove(id: string) {
  pending.value = true;
  try {
    await ai.deleteHistory(id);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <Dialog
    :open="true"
    @update:open="
      (open) => {
        if (!open) emit('close');
      }
    "
  >
    <DialogContent class="ai-history-dialog">
      <DialogTitle>会话</DialogTitle>
      <DialogDescription
        >查看和搜索保存的对话，继续之前的讨论。</DialogDescription
      >
      <Input
        v-model="query"
        aria-label="搜索会话"
        placeholder="搜索标题或工作空间"
        class="quiet-search"
      />
      <label class="history-scope"
        ><Checkbox v-model="allWorkspaces" />所有工作空间</label
      >
      <div class="history-results">
        <article v-for="item in histories" :key="item.id">
          <Button
            class="history-open"
            :disabled="pending"
            @click="load(item.id)"
            ><strong>{{ item.title }}</strong
            ><small
              >{{ item.workspace || "无工作空间" }} ·
              {{ new Date(item.updatedAt).toLocaleDateString() }}</small
            ></Button
          >
          <Button
            v-if="item.workspace !== (workspace.root ?? '')"
            :disabled="pending"
            @click="load(item.id, true)"
            >派生到当前</Button
          >
          <Button
            :disabled="pending"
            :aria-label="`删除会话 ${item.title}`"
            @click="remove(item.id)"
            >删除</Button
          >
        </article>
        <p v-if="!histories.length" class="empty-hint">
          {{ query ? "没有匹配的会话" : "还没有历史会话" }}
        </p>
      </div>
      <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
    </DialogContent>
  </Dialog>
</template>
