<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useSettingsStore } from "../stores/settings";
import { call } from "../services/backend";
import type { Provider } from "../types/workspace";
const settings = useSettingsStore();
const selected = ref(settings.value.ai.apiKeyRef);
const name = ref(
  settings.value.providerProfiles.find(
    (p) => p.provider.apiKeyRef === selected.value,
  )?.name ?? "默认连接",
);
const provider = ref<Provider>({ ...settings.value.ai });
const key = ref("");
const models = ref<string[]>([]);
const message = ref("");
const loading = ref(false);
function edit(reference: string) {
  const profile = settings.value.providerProfiles.find(
    (p) => p.provider.apiKeyRef === reference,
  );
  if (profile) {
    selected.value = reference;
    name.value = profile.name;
    provider.value = { ...profile.provider };
    key.value = "";
    models.value = [];
    void fetchModels();
  }
}
function create() {
  selected.value = "provider:" + crypto.randomUUID();
  name.value = "新连接";
  provider.value = {
    ...settings.value.ai,
    apiKeyRef: selected.value,
    enabled: true,
  };
  key.value = "";
  models.value = [];
}
async function save() {
  try {
    if (!name.value.trim()) throw new Error("请输入连接名称");
    if (key.value) {
      await call("secret_set", {
        reference: provider.value.apiKeyRef,
        key: key.value,
      });
      key.value = "";
    }
    const profile = {
      name: name.value.trim(),
      provider: { ...provider.value },
    };
    const index = settings.value.providerProfiles.findIndex(
      (p) => p.provider.apiKeyRef === provider.value.apiKeyRef,
    );
    if (index < 0) settings.value.providerProfiles.push(profile);
    else settings.value.providerProfiles[index] = profile;
    if (
      settings.value.ai.apiKeyRef === provider.value.apiKeyRef ||
      settings.value.providerProfiles.length === 1
    )
      settings.value.ai = { ...provider.value };
    await settings.persist();
    message.value = "连接已保存";
    return true;
  } catch (e) {
    message.value = String(e);
    return false;
  }
}
async function fetchModels() {
  loading.value = true;
  try {
    if (!(await save())) return;
    models.value = await call<string[]>("ai_models", {
      provider: provider.value,
    });
    message.value = `获取到 ${models.value.length} 个模型`;
  } catch (e) {
    message.value = String(e);
  } finally {
    loading.value = false;
  }
}
async function remove(reference: string) {
  settings.value.providerProfiles = settings.value.providerProfiles.filter(
    (p) => p.provider.apiKeyRef !== reference,
  );
  if (settings.value.ai.apiKeyRef === reference)
    settings.value.ai = { ...settings.value.ai, enabled: false, model: "" };
  await call("secret_set", { reference, key: "" });
  await settings.persist();
}
onMounted(() => {
  if (provider.value.enabled && settings.value.providerProfiles.length)
    void fetchModels();
});
</script>
<template>
  <h3>模型服务</h3>
  <table class="settings-table">
    <thead>
      <tr>
        <th>连接名称</th>
        <th>默认模型</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="profile in settings.value.providerProfiles"
        :key="profile.provider.apiKeyRef"
      >
        <td>{{ profile.name }}</td>
        <td>{{ profile.provider.model }}</td>
        <td>
          <button @click="edit(profile.provider.apiKeyRef)">编辑</button
          ><button
            @click="
              settings.value.ai = { ...profile.provider };
              settings.persist();
            "
          >
            设为默认</button
          ><button
            @click="
              remove(profile.provider.apiKeyRef).catch(
                (e) => (message = String(e)),
              )
            "
          >
            删除
          </button>
        </td>
      </tr>
      <tr v-if="!settings.value.providerProfiles.length">
        <td colspan="3" class="empty-hint">还没有配置模型服务</td>
      </tr>
    </tbody>
  </table>
  <button @click="create">新增连接</button>
  <label class="stacked">连接名称<input v-model="name" /></label>
  <label class="setting-row"
    >启用<input v-model="provider.enabled" type="checkbox"
  /></label>
  <label class="setting-row"
    >协议<select v-model="provider.protocol">
      <option value="openai-compatible">OpenAI compatible</option>
      <option value="anthropic-compatible">Anthropic compatible</option>
    </select></label
  >
  <label class="stacked">Base URL<input v-model="provider.baseUrl" /></label>
  <label class="stacked"
    >API Key<input
      v-model="key"
      type="password"
      autocomplete="off"
      placeholder="留空保留已有密钥"
  /></label>
  <label class="stacked"
    >默认模型<input
      v-model="provider.model"
      list="connection-models" /><datalist id="connection-models">
      <option v-for="model in models" :key="model" :value="model" /></datalist
  ></label>
  <button :disabled="loading" @click="fetchModels">
    {{ loading ? "获取中…" : "获取模型列表" }}</button
  ><button class="primary" @click="save">保存连接</button>
  <p class="help">密钥保存在本地 SQLite 中，请妥善保管 .yeditor 目录。</p>
  <p role="status">{{ message }}</p>
</template>
