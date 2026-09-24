import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { shortcutLabel } from "../src/command-palette/registry";
import EditorShell from "../src/app/EditorShell.vue";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { settle } from "./settle";
vi.mock("../src/editor/MarkdownEditor.vue", () => ({
  default: { template: '<textarea aria-label="测试正文" />' },
}));
let wrapper: VueWrapper;
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});
it("opens the document actions menu, then dismisses it on Escape", async () => {
  wrapper = mount(EditorShell, { attachTo: document.body });
  await settle();
  const trigger = wrapper.get('[aria-label="文档菜单"]');
  await trigger.trigger("keydown", { key: "Enter" });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(
    document.querySelector('[role="menuitem"][data-disabled]')?.textContent,
  ).toContain("复制文件路径");
  document
    .querySelector('[role="menu"]')!
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  await settle();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
it("keeps native select/datalist and direct engine imports out of business surfaces", () => {
  const scan = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? scan(join(dir, entry.name))
        : [join(dir, entry.name)],
    );
  for (const file of scan("src").filter((file) => /\.(vue|ts)$/.test(file))) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(/<(?:select|datalist)\b/);
    // Owned Checkbox, not a native input: ADR-0007 keeps form controls in one
    // place so padding, focus and dark-mode behaviour cannot drift per surface.
    expect(source, file).not.toMatch(/type=["']checkbox["']/);
    if (!file.includes("components/ui/"))
      expect(source, file).not.toMatch(/from ["']reka-ui["']/);
  }
});

it("renders the remapped shortcut in the icon tooltip", async () => {
  const { useSettingsStore } = await import("../src/stores/settings");
  wrapper = mount(EditorShell, { attachTo: document.body });
  await settle();
  useSettingsStore().value.shortcuts["settings.open"] = "Mod+Shift+p";
  await settle();
  expect(
    wrapper.get('[aria-label="打开偏好设置"]').attributes("title"),
  ).toContain(shortcutLabel("Mod+Shift+p"));
});
