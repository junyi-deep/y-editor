<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { reactive } from "vue";
import { useSettingsStore } from "../stores/settings";
import { call } from "../services/backend";
const settings = useSettingsStore();
const status = reactive({ text: "" });
const rules = [
  {
    label: "正文颜色",
    selector: "",
    property: "color",
    value: "#333333",
    type: "color",
  },
  {
    label: "标题颜色",
    selector: "h1,h2,h3,h4,h5,h6",
    property: "color",
    value: "#333333",
    type: "color",
  },
  {
    label: "段落间距",
    selector: "p",
    property: "margin-bottom",
    value: "0.8em",
    type: "text",
  },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    label: `H${n} 字号`,
    selector: `h${n}`,
    property: "font-size",
    value: [2.25, 1.75, 1.5, 1.25, 1, 0.9][n - 1] + "em",
    type: "text",
  })),
  {
    label: "引用边线",
    selector: "blockquote",
    property: "border-left-color",
    value: "#dddddd",
    type: "color",
  },
  {
    label: "链接颜色",
    selector: "a",
    property: "color",
    value: "#4183c4",
    type: "color",
  },
  {
    label: "行内代码背景",
    selector: "code",
    property: "background-color",
    value: "#f3f3f3",
    type: "color",
  },
  {
    label: "代码块背景",
    selector: "pre",
    property: "background-color",
    value: "#f8f8f8",
    type: "color",
  },
  {
    label: "表格边框",
    selector: "td,th",
    property: "border-color",
    value: "#dddddd",
    type: "color",
  },
  {
    label: "图片圆角",
    selector: "img",
    property: "border-radius",
    value: "0px",
    type: "text",
  },
  {
    label: "公式字号",
    selector: ".katex",
    property: "font-size",
    value: "1.1em",
    type: "text",
  },
];
const values = reactive(
  rules.map((rule) => ({
    ...rule,
    value: readValue(rule.selector, rule.property) ?? rule.value,
  })),
);
function selector(text: string) {
  return text
    ? text
        .split(",")
        .map((s) => `.editor-host .vditor-reset ${s}`)
        .join(",")
    : ".editor-host .vditor-reset";
}
function readValue(target: string, property: string) {
  const prefix = `${selector(target)} { ${property}: `;
  const line = settings.value.customCss
    .split("\n")
    .find((l) => l.startsWith(prefix));
  return line?.slice(prefix.length).replace(/; }$/, "");
}
function update() {
  const css = values
    .filter((r) => CSS.supports(r.property, r.value))
    .map((r) => `${selector(r.selector)} { ${r.property}: ${r.value}; }`)
    .join("\n");
  settings.value.customCss =
    settings.value.customCss
      .replace(/\/\* y-editor tokens \*\/[\s\S]*?\/\* end tokens \*\//g, "")
      .trim() + `\n/* y-editor tokens */\n${css}\n/* end tokens */`;
}
async function importCss() {
  try {
    const css = await call<string | null>("theme_import");
    if (css !== null) {
      settings.value.customCss = css;
      status.text =
        "已导入 CSS。#write 将映射为编辑正文；部分 Typora 专用选择器可能不适用。";
    }
  } catch (e) {
    status.text = String(e);
  }
}
async function exportCss() {
  try {
    await call("export_file", {
      format: "css",
      content: settings.value.customCss,
    });
  } catch (e) {
    status.text = String(e);
  }
}
</script>
<template>
  <section>
    <h3>主题编辑器</h3>
    <p class="help">
      修改后实时预览当前文档。字体、字号、行高和正文宽度在“编辑器”设置中调整。
    </p>
    <div class="theme-actions">
      <Button @click="importCss">导入 Typora CSS…</Button
      ><Button @click="exportCss">导出 CSS…</Button
      ><Button @click="settings.value.customCss = ''">恢复默认主题</Button>
    </div>
    <details>
      <summary>排版与颜色</summary>
      <label v-for="rule in values" :key="rule.label" class="setting-row"
        >{{ rule.label
        }}<input v-model="rule.value" :type="rule.type" @input="update"
      /></label>
    </details>
    <p v-if="status.text" role="status">{{ status.text }}</p>
  </section>
</template>
<style scoped>
.theme-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.theme-actions button {
  border: 1px solid var(--y-border);
  padding: 6px;
  border-radius: var(--y-radius-control);
}
input[type="text"] {
  width: 100px;
}
input[type="color"] {
  width: 40px;
  padding: 0;
}
</style>
