<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { onMounted, ref, computed } from "vue";
import { call } from "../services/backend";
import ResourcesPanel from "../settings/ResourcesPanel.vue";
const emit = defineEmits<{ close: [] }>();
const items = ref<{ id: string; name: string; kind: string; path?: string }[]>(
    [],
  ),
  flags = ref<Record<string, boolean>>({}),
  query = ref(""),
  error = ref(""),
  adding = ref("");
const labels: Record<string, string> = {
  knowledge: "知识库",
  repository: "代码仓库",
  skill: "SKILL",
  prompt: "提示词",
  mcp: "MCP",
};
const filtered = computed(() =>
  items.value.filter((i) =>
    `${i.name} ${labels[i.kind]}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
async function refresh() {
  try {
    const [resources, servers, enabled] = await Promise.all([
      call<typeof items.value>("resource_list"),
      call<typeof items.value>("mcp_list"),
      call<Record<string, boolean>>("workspace_resources"),
    ]);
    items.value = [
      ...resources,
      ...servers.map((s) => ({ ...s, id: `mcp:${s.id}`, kind: "mcp" })),
    ];
    flags.value = enabled;
  } catch (e) {
    error.value = String(e);
  }
}
async function toggle(id: string) {
  try {
    await call("workspace_resource_set", { id, enabled: !flags.value[id] });
    await refresh();
  } catch (e) {
    error.value = String(e);
  }
}
onMounted(refresh);
</script>
<template>
  <div class="modal-shade" @keydown.esc.stop="emit('close')">
    <section
      class="resource-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="工作空间 AI 资源"
    >
      <header>
        <h3>工作空间 AI 资源</h3>
        <Button @click="emit('close')">关闭</Button>
      </header>
      <Input v-model="query" placeholder="搜索资源" />
      <table class="settings-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>类型</th>
            <th>本工作空间启用</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filtered" :key="item.id">
            <td>{{ item.name }}</td>
            <td>{{ labels[item.kind] }}</td>
            <td>
              <Checkbox
                :model-value="flags[item.id]"
                :aria-label="`启用 ${item.name}`"
                @update:model-value="toggle(item.id)"
              />
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="4" class="empty-hint">没有匹配的资源</td>
          </tr>
        </tbody>
      </table>
      <label
        >添加到全局资源库<Select v-model="adding"
          ><SelectTrigger aria-label="添加资源类型"
            ><SelectValue placeholder="选择类型" /></SelectTrigger
          ><SelectContent>
            <SelectItem v-for="label in labels" :key="label" :value="label">{{
              label
            }}</SelectItem>
          </SelectContent></Select
        ></label
      ><ResourcesPanel v-if="adding" :key="adding" :mode="adding" /><Button
        v-if="adding"
        @click="refresh"
      >
        刷新资源列表
      </Button>
      <p role="alert">{{ error }}</p>
    </section>
  </div>
</template>
