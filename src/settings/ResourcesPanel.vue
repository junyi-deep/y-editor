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

import { computed, onMounted, ref } from "vue";
import { call, desktop } from "../services/backend";
import { choose } from "../services/dialog";
interface Resource {
  id: string;
  name: string;
  kind: string;
  path: string;
  enabled: boolean;
  tags?: string[];
}
interface Server {
  id: string;
  name: string;
  transport: string;
  command: string;
  args: string[];
  url: string;
  cwd: string;
  enabled: boolean;
}
const props = defineProps<{ mode: string }>();
const resources = ref<Resource[]>([]),
  servers = ref<Server[]>([]),
  candidates = ref<Resource[]>([]),
  selected = ref<string[]>([]),
  message = ref(""),
  busy = ref(false),
  query = ref("");
const hits = ref<{ path: string; line: number; text: string }[]>([]);
const draft = ref<Server | null>(null),
  args = ref(""),
  tools = ref<{ name: string; description?: string; inputSchema?: unknown }[]>(
    [],
  );
const labels: Record<string, string> = {
  knowledge: "知识库",
  repository: "代码仓库",
  skill: "SKILL",
  prompt: "提示词",
};
const filter = ref("");
const filtered = computed(() =>
  resources.value.filter(
    (r) =>
      (props.mode === "资源" || labels[r.kind] === props.mode) &&
      `${r.name} ${(r.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(filter.value.toLowerCase()),
  ),
);
const promptDraft = ref({ name: "", tags: "", content: "" });
const promptOpen = ref(false);
const promptId = ref<string | null>(null);
async function editPrompt(item: Resource) {
  await run(async () => {
    promptId.value = item.id;
    promptDraft.value = {
      name: item.name,
      tags: (item.tags ?? []).join(", "),
      content: await call<string>("prompt_load", { id: item.id }),
    };
    promptOpen.value = true;
  });
}
async function savePrompt() {
  await run(async () => {
    await call("prompt_save", {
      id: promptId.value,
      name: promptDraft.value.name,
      tags: promptDraft.value.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
      content: promptDraft.value.content,
    });
    promptOpen.value = false;
    await refresh();
  });
}
async function run(work: () => Promise<void>) {
  busy.value = true;
  message.value = "";
  try {
    await work();
  } catch (error) {
    message.value = String(error);
  } finally {
    busy.value = false;
  }
}
async function refresh() {
  if (!desktop) return;
  [resources.value, servers.value] = await Promise.all([
    call<Resource[]>("resource_list"),
    call<Server[]>("mcp_list"),
  ]);
}
onMounted(() => run(refresh));
async function add(kind: string) {
  await run(async () => {
    await call("resource_add", { kind });
    await refresh();
  });
}
/** The import list is a checkbox group; the owned Checkbox is boolean, so the
 * id array is toggled here rather than through v-model. */
function toggleCandidate(id: string) {
  const at = selected.value.indexOf(id);
  if (at < 0) selected.value.push(id);
  else selected.value.splice(at, 1);
}
async function toggle(item: Resource) {
  await run(async () => {
    await call("resource_update", {
      id: item.id,
      enabled: !item.enabled,
      remove: false,
    });
    await refresh();
  });
}
async function remove(item: Resource) {
  await run(async () => {
    await call("resource_update", {
      id: item.id,
      enabled: false,
      remove: true,
    });
    await refresh();
  });
}
async function scan() {
  await run(async () => {
    candidates.value = (await call<Resource[]>("resource_scan")).filter(
      (r) => r.kind === "skill",
    );
    selected.value = [];
  });
}
async function importSelected() {
  await run(async () => {
    const count = await call<number>("resource_import", {
      ids: selected.value,
    });
    message.value = `已导入 ${count} 项，启用后才会进入 AI 上下文`;
    candidates.value = [];
    await refresh();
  });
}
async function index() {
  await run(async () => {
    message.value = `索引完成：${await call<number>("knowledge_index")} 个文本块`;
  });
}
async function search() {
  await run(async () => {
    hits.value = await call("knowledge_search", { query: query.value });
  });
}
function edit(server?: Server) {
  draft.value = server
    ? JSON.parse(JSON.stringify(server))
    : {
        id: crypto.randomUUID(),
        name: "",
        transport: "stdio",
        command: "",
        args: [],
        url: "",
        cwd: "",
        enabled: false,
      };
  args.value = JSON.stringify(draft.value!.args);
  tools.value = [];
}
async function saveServer() {
  if (!draft.value) return;
  await run(async () => {
    const parsed: unknown = JSON.parse(args.value);
    if (!Array.isArray(parsed) || parsed.some((a) => typeof a !== "string"))
      throw new Error("参数必须是 JSON 字符串数组");
    const server = { ...draft.value!, args: parsed as string[] };
    if (server.enabled) {
      const choice = await choose(
        "启用 MCP 服务",
        `${server.name} 的全部工具将允许 AI 调用，可能访问外部服务或执行本地命令。仅启用你信任的服务。`,
        [
          { label: "启用", id: "enable", primary: true },
          { label: "取消", id: "cancel" },
        ],
      );
      if (choice !== "enable") return;
    }
    await call("mcp_save", { server, remove: false });
    draft.value = null;
    await refresh();
  });
}
async function removeServer(server: Server) {
  await run(async () => {
    await call("mcp_save", { server, remove: true });
    await refresh();
  });
}
async function discover(server: Server) {
  await run(async () => {
    const result = await call<{ tools: typeof tools.value }>("mcp_tools", {
      id: server.id,
    });
    tools.value = result.tools ?? [];
  });
}
</script>
<template>
  <div class="resource-settings">
    <template v-if="props.mode !== 'MCP'">
      <h3>{{ props.mode }}</h3>
      <p class="help">
        手动添加并启用资源。仓库只读；Skill
        和提示词作为上下文加载，不执行其中的脚本。更改后当前 AI 连接会重建。
      </p>
      <div class="resource-actions">
        <Button
          v-for="(label, kind) in Object.fromEntries(
            Object.entries(labels).filter(
              ([, label]) => props.mode === '资源' || label === props.mode,
            ),
          )"
          :key="kind"
          :disabled="busy"
          @click="add(kind)"
        >
          添加{{ label }}</Button
        ><Button v-if="props.mode === 'SKILL'" :disabled="busy" @click="scan">
          扫描本机 SKILL
        </Button>
      </div>
      <Input v-model="filter" placeholder="搜索名称或标签" />
      <Button
        v-if="props.mode === '提示词'"
        @click="
          promptId = null;
          promptDraft = { name: '', tags: '', content: '' };
          promptOpen = !promptOpen;
        "
      >
        手动添加提示词
      </Button>
      <form v-if="promptOpen" @submit.prevent="savePrompt">
        <label class="stacked"
          >名称<Input v-model="promptDraft.name" required /></label
        ><label class="stacked"
          >标签（逗号分隔）<Input v-model="promptDraft.tags" /></label
        ><label class="stacked"
          >提示词<textarea
            v-model="promptDraft.content"
            rows="8"
            required
          /></label
        ><Button>保存</Button>
      </form>
      <table class="settings-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>路径 / 标签</th>
            <th>全局启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filtered" :key="item.id">
            <td>{{ item.name }}</td>
            <td :title="item.path">
              {{ item.path }}<small>{{ item.tags?.join(" · ") }}</small>
            </td>
            <td>
              <Checkbox
                :model-value="item.enabled"
                :aria-label="`启用 ${item.name}`"
                @update:model-value="toggle(item)"
              />
            </td>
            <td>
              <Button v-if="item.kind === 'prompt'" @click="editPrompt(item)">
                编辑</Button
              ><Button @click="remove(item)">移除</Button>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="4" class="empty-hint">
              {{ filter ? "没有匹配的结果" : "还没有添加任何内容" }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="help">
        全局启用仅作为新工作空间的默认值；当前工作空间可在 AI 资源面板单独设置。
      </p>
      <section v-if="candidates.length">
        <h4>选择要导入的引用</h4>
        <label
          v-for="item in candidates"
          :key="item.id"
          class="resource-candidate"
          ><Checkbox
            :model-value="selected.includes(item.id)"
            :aria-label="`选择 ${item.name}`"
            @update:model-value="toggleCandidate(item.id)" />{{
            item.name
          }}<small>{{ item.path }}</small></label
        ><Button :disabled="busy || !selected.length" @click="importSelected">
          导入所选（{{ selected.length }}）</Button
        ><Button @click="candidates = []">关闭</Button>
      </section>
      <section v-if="props.mode === '知识库'">
        <h3>知识检索</h3>
        <p class="help">
          启用知识库后建立索引；源文件变化后重新建立。检索结果附带文件路径和行号。
        </p>
        <Button :disabled="busy" @click="index">重建本地索引</Button>
        <form class="resource-actions" @submit.prevent="search">
          <Input
            v-model="query"
            placeholder="搜索知识库"
            aria-label="搜索知识库"
          /><Button :disabled="busy || !query.trim()">搜索</Button>
        </form>
        <article
          v-for="hit in hits"
          :key="`${hit.path}:${hit.line}`"
          class="resource-card knowledge-hit"
        >
          <small>{{ hit.path }}:{{ hit.line }}</small>
          <pre>{{ hit.text }}</pre>
        </article>
      </section>
    </template>
    <template v-else>
      <h3>MCP 服务</h3>
      <p class="help">
        支持 stdio 与 Streamable HTTP。服务默认关闭；启用即授权 AI
        使用该服务的工具。
      </p>
      <Button @click="edit()">添加服务</Button>
      <table class="settings-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>传输</th>
            <th>全局启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="server in servers" :key="server.id">
            <td>{{ server.name }}</td>
            <td>{{ server.transport }}</td>
            <td>{{ server.enabled ? "是" : "否" }}</td>
            <td>
              <Button
                :disabled="!server.enabled || busy"
                @click="discover(server)"
              >
                工具</Button
              ><Button @click="edit(server)">编辑</Button
              ><Button @click="removeServer(server)">移除</Button>
            </td>
          </tr>
          <tr v-if="!servers.length">
            <td colspan="4" class="empty-hint">还没有添加服务</td>
          </tr>
        </tbody>
      </table>
      <form v-if="draft" @submit.prevent="saveServer">
        <label class="stacked"
          >名称<Input v-model="draft.name" required /></label
        ><label class="stacked"
          >传输<Select v-model="draft.transport"
            ><SelectTrigger aria-label="传输"
              ><SelectValue placeholder="选择类型" /></SelectTrigger
            ><SelectContent>
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="http">Streamable HTTP</SelectItem>
            </SelectContent></Select
          ></label
        ><template v-if="draft.transport === 'stdio'"
          ><label class="stacked"
            >可执行文件<Input
              v-model="draft.command"
              required
              placeholder="/absolute/path/to/server" /></label
          ><label class="stacked"
            >参数（JSON 数组）<Input
              v-model="args"
              placeholder='["--port", "3000"]' /></label
          ><label class="stacked"
            >工作目录<Input v-model="draft.cwd" /></label></template
        ><label v-else class="stacked"
          >服务 URL<Input v-model="draft.url" type="url" required /></label
        ><label class="setting-row"
          >允许 AI 调用<Checkbox v-model="draft.enabled" /></label
        ><Button :disabled="busy">保存</Button
        ><Button type="button" @click="draft = null">取消</Button>
      </form>
      <article
        v-for="tool in tools"
        :key="tool.name"
        class="resource-card knowledge-hit"
      >
        <strong>{{ tool.name }}</strong>
        <p>{{ tool.description }}</p>
        <details>
          <summary>参数</summary>
          <pre>{{ JSON.stringify(tool.inputSchema, null, 2) }}</pre>
        </details>
      </article>
    </template>
    <p v-if="message" role="status">{{ message }}</p>
  </div>
</template>
<style scoped>
.resource-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.resource-actions input {
  flex: 1;
  min-width: 120px;
}
.resource-settings button {
  border: 1px solid var(--y-border);
  border-radius: var(--y-radius-control);
  padding: 5px 9px;
}
.resource-card {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--y-border);
  padding: 12px 0;
}
.resource-card > div {
  flex: 1;
  min-width: 0;
}
.resource-card small {
  display: block;
  overflow-wrap: anywhere;
  color: var(--y-muted);
  font-size: var(--y-font-sm);
}
.resource-candidate {
  display: block;
  margin: 8px 0;
}
.resource-candidate small {
  display: block;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.knowledge-hit {
  display: block;
}
.knowledge-hit pre {
  white-space: pre-wrap;
  font-size: 12px;
  max-height: 180px;
  overflow: auto;
}
</style>
