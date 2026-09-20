import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import EditorShell from "../src/app/EditorShell.vue";
import { useDocumentStore } from "../src/stores/document";
import { useSettingsStore } from "../src/stores/settings";
import { useEditorStore } from "../src/stores/editor";
vi.mock("../src/editor/MarkdownEditor.vue", () => ({
  default: { template: "<div />" },
}));
describe("writing shell", () => {
  it("starts with a blank document and hides both sidebars by default", async () => {
    const wrapper = mount(EditorShell, {
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    expect(wrapper.find(".file-sidebar").exists()).toBe(false);
    expect(wrapper.find(".ai-panel").exists()).toBe(false);
    expect(wrapper.text()).toContain("未命名");
    expect(wrapper.text()).not.toContain("PREVIEW");
    await wrapper.get('[aria-label="切换侧边栏"]').trigger("click");
    expect(wrapper.find(".file-sidebar").exists()).toBe(true);
    await wrapper.get('[aria-label="切换 AI 助手"]').trigger("click");
    await vi.waitFor(() =>
      expect(wrapper.find(".ai-panel").exists()).toBe(true),
    );
    wrapper.unmount();
  });
  it("rounds fractional resize coordinates before saving settings", async () => {
    const pinia = createPinia();
    const wrapper = mount(EditorShell, { global: { plugins: [pinia] } });
    await flushPromises();
    useEditorStore(pinia).sidebar = true;
    await flushPromises();
    await wrapper
      .get('[aria-label="调整左侧栏宽度"]')
      .trigger("pointerdown", { clientX: 240 });
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 248.890625 }),
    );
    window.dispatchEvent(new MouseEvent("pointerup"));
    expect(useSettingsStore(pinia).value.sidebarWidth).toBe(249);
    wrapper.unmount();
  });
  it("reacts to document updates in the outline and statistics", async () => {
    const pinia = createPinia();
    const wrapper = mount(EditorShell, { global: { plugins: [pinia] } });
    await flushPromises();
    useDocumentStore(pinia).update("# Fresh\n## Detail");
    const ui = useEditorStore(pinia);
    ui.sidebar = true;
    ui.sidebarTab = "outline";
    await flushPromises();
    expect(
      wrapper.findAll(".outline-title").map((item) => item.text()),
    ).toEqual(["1 Fresh", "1.1 Detail"]);
    await wrapper.get(".word-count").trigger("click");
    expect(wrapper.get(".statistics-popover").text()).toContain("行数 2");
    wrapper.unmount();
  });
});
