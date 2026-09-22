<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import ResourcesPanel from "./ResourcesPanel.vue";
import { trapDialogTab } from "../services/focus";
import ShortcutSettings from "./ShortcutSettings.vue";
import CssEditor from "./CssEditor.vue";
import { themePresets } from "./themes";
import type { CommandRegistry } from "../command-palette/registry";
import ThemeEditor from "./ThemeEditor.vue";
import { useSettingsStore } from "../stores/settings";
import { useEditorStore } from "../stores/editor";
import { call } from "../services/backend";
import ModelConnections from "./ModelConnections.vue";
import UiIcon from "../components/UiIcon.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const props = defineProps<{ registry: CommandRegistry }>();
const cssOpen = ref(false);
const aiCategory = ref("模型服务");
const panel = ref<HTMLElement>();
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => panel.value?.querySelector<HTMLInputElement>("input")?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
const settings = useSettingsStore();
const ui = useEditorStore();
const category = computed({
  get: () => ui.settingsCategory,
  set: (value: string) => {
    ui.settingsCategory = value;
  },
});
const filter = ref("");
const message = ref("");
const categories = [
  "通用",
  "编辑器",
  "外观",
  "AI",
  "快捷键",
  "快捷面板",
  "数据",
];
const shown = computed(() =>
  categories.filter(
    (name) =>
      !filter.value ||
      name.includes(filter.value) ||
      (
        {
          通用: "自动 保存",
          编辑器: "字体 字号 行高 宽度 拼写",
          外观: "主题 CSS 背景 图片 Atom ChatGPT Github JetBrains",
          快捷面板: "搜索 条数 正则 内容",
          快捷键: "键盘 快捷键 重新 映射",
          AI: "模型 密钥 Provider",
          数据: "配置 恢复",
        }[name] ?? ""
      )
        .toLowerCase()
        .includes(filter.value.toLowerCase()),
  ),
);
async function importBackground() {
  try {
    const name = await call<string | null>("background_import");
    if (name) settings.value.backgroundImage = name;
  } catch (e) {
    message.value = String(e);
  }
}
async function close() {
  try {
    await settings.persist();
    ui.settingsOpen = false;
  } catch (error) {
    message.value = String(error);
  }
}
</script>
<template>
  <div class="modal-shade" @keydown.esc="close">
    <section
      ref="panel"
      class="settings-panel"
      @keydown="trapDialogTab"
      role="dialog"
      aria-modal="true"
      aria-label="偏好设置"
    >
      <header>
        <h2>偏好设置</h2>
        <Button aria-label="关闭设置" @click="close">
          <UiIcon name="close" />
        </Button>
      </header>
      <div class="settings-body">
        <nav>
          <Input
            v-model="filter"
            placeholder="搜索设置"
            aria-label="搜索设置"
          /><Button
            v-for="name in shown"
            :key="name"
            :class="{ active: category === name }"
            @click="category = name"
          >
            {{ name }}
          </Button>
        </nav>
        <div class="settings-content">
          <template v-if="category === '通用'"
            ><h3>文件与保存</h3>
            <label class="setting-row"
              >自动保存<Switch v-model="settings.value.autosave" /></label
            ><label class="setting-row"
              >保存延迟（毫秒）<input
                v-model.number="settings.value.autosaveDelay"
                type="number"
                min="500"
                max="30000"
                step="100"
            /></label>
            <p class="help">
              已命名文件在停止输入后自动保存。未命名文档会保存恢复草稿。
            </p>
            <label class="setting-row"
              >启动时显示侧栏<Switch v-model="settings.value.sidebar" /></label
          ></template>
          <template v-if="category === '编辑器'">
            <h3>编辑器</h3>
            <label class="setting-row">自动渲染大型 Mermaid 图表<Switch v-model="settings.value.renderLargeDiagrams" /></label>
            <label class="setting-row"
              >附件目录<Input
                v-model="settings.value.attachmentFolder"
                placeholder="assets"
            /></label>
            <label class="setting-row"
              >粘贴时询问文件名<Switch v-model="settings.value.pastePrompt"
            /></label>
            <label class="setting-row"
              >允许其他附件<Switch v-model="settings.value.allowAttachments"
            /></label>
            <label class="setting-row"
              >大纲显示层级序号<Switch
                v-model="settings.value.outlineNumbering"
            /></label>
            <label class="setting-row"
              >正文字体<Select v-model="settings.value.fontFamily"
                ><SelectTrigger aria-label="正文字体"
                  ><SelectValue placeholder="选择类型" /></SelectTrigger
                ><SelectContent>
                  <SelectItem value="sans-serif">系统无衬线</SelectItem>
                  <SelectItem value="serif">系统衬线</SelectItem>
                  <SelectItem value="monospace">等宽字体</SelectItem>
                  <SelectItem value="'PingFang SC', sans-serif"
                    >苹方</SelectItem
                  >
                  <SelectItem value="'Songti SC', serif">宋体</SelectItem>
                </SelectContent></Select
              ></label
            ><label class="setting-row"
              >字号<input
                v-model.number="settings.value.fontSize"
                type="number"
                min="10"
                max="40" /></label
            ><label class="setting-row"
              >行高<input
                v-model.number="settings.value.lineHeight"
                type="number"
                min="1.2"
                max="2.5"
                step=".1" /></label
            ><label class="setting-row"
              >正文宽度<input
                v-model.number="settings.value.contentWidth"
                type="number"
                min="480"
                max="1400"
                step="20" /></label
            ><label class="setting-row"
              >拼写检查<Switch v-model="settings.value.spellcheck" /></label
            ><label class="setting-row"
              >专注模式<Switch v-model="ui.focus" /></label
            ><label class="setting-row"
              >打字机模式<Switch v-model="ui.typewriter" /></label
          ></template>
          <template v-if="category === '快捷面板'"
            ><h3>快捷面板</h3>
            <label class="setting-row"
              >内容搜索条数<input
                v-model.number="settings.value.paletteSearchLimit"
                type="number"
                min="1"
                max="1000"
                step="1"
                @change="
                  settings.value.paletteSearchLimit = Math.round(
                    Math.max(
                      1,
                      Math.min(
                        1000,
                        Number(settings.value.paletteSearchLimit) || 70,
                      ),
                    ),
                  )
                "
            /></label>
            <label class="checkbox-row"
              ><Switch
                v-model="settings.value.paletteRegex"
              />启用正则内容搜索（默认开启）</label
            >
            <p class="help">关闭后按普通文本匹配。搜索最多显示 1–1000 条。</p>
          </template>
          <template v-if="category === '外观'"
            ><h3>主题</h3>
            <label class="setting-row"
              >应用不透明度
              {{ Math.round(settings.value.opacity * 100) }}%<input
                v-model.number="settings.value.opacity"
                type="range"
                min="0.3"
                max="1"
                step="0.01"
            /></label>
            <label class="setting-row"
              >预置主题<Select v-model="settings.value.themePreset">
                <SelectTrigger class="w-[155px]" aria-label="预置主题">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="preset in themePresets"
                    :key="preset.id"
                    :value="preset.id"
                  >
                    {{ preset.name }}
                  </SelectItem>
                </SelectContent>
              </Select></label
            ><label class="setting-row"
              >应用背景图片<span
                ><Button @click="importBackground">选择图片…</Button
                ><Button
                  v-if="settings.value.backgroundImage"
                  @click="settings.value.backgroundImage = ''"
                >
                  移除
                </Button></span
              ></label
            >
            <label class="setting-row"
              >外观<Select v-model="settings.value.appearance">
                <SelectTrigger class="w-[155px]" aria-label="外观">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">浅色</SelectItem>
                  <SelectItem value="dark">深色</SelectItem>
                  <SelectItem value="system">跟随系统</SelectItem>
                </SelectContent>
              </Select></label
            ><ThemeEditor />
            <p class="help">
              样式实时作用于正在编辑的文档。使用 .vditor-reset
              选择正文；兼容导入的 #write 选择器。
            </p>
            <Button class="css-open-button" @click="cssOpen = true">
              自定义 CSS…
            </Button></template
          >
          <template v-if="category === 'AI'">
            <nav class="ai-settings-tabs">
              <Button
                v-for="name in [
                  '模型服务',
                  '知识库',
                  '代码仓库',
                  'SKILL',
                  'MCP',
                  '提示词',
                ]"
                :key="name"
                @click="aiCategory = name"
                :class="{ active: aiCategory === name }"
              >
                {{ name }}
              </Button>
            </nav>
            <ModelConnections v-if="aiCategory === '模型服务'" />
            <ResourcesPanel v-else :key="aiCategory" :mode="aiCategory" />
          </template>
          <ShortcutSettings
            v-if="category === '快捷键'"
            :registry="props.registry"
          />
          <template v-if="category === '数据'">
            <h3>本地数据</h3>
            <p>SQLite 数据库</p>
            <code class="data-path">{{
              settings.configDir
                ? settings.configDir + "/data.db"
                : "浏览器预览不保存数据"
            }}</code>
            <p class="help">
              配置、密钥、工作空间和会话保存在可执行文件旁的
              .yeditor/data.db。资源文件位于 .yeditor/res。
            </p>
          </template>
          <p v-if="message" class="form-message" role="status">{{ message }}</p>
        </div>
      </div>
    </section>
    <CssEditor v-if="cssOpen" @close="cssOpen = false" />
  </div>
</template>
