import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import SettingsPanel from "../src/settings/SettingsPanel.vue";
import { CommandRegistry } from "../src/command-palette/registry";
import { useSettingsStore } from "../src/stores/settings";
import { useEditorStore } from "../src/stores/editor";
import { settle } from "./settle";

vi.mock("../src/services/backend", () => ({
  desktop: false,
  call: vi.fn(async () => []),
  backend: { settings: vi.fn(async () => null) },
}));

beforeEach(() => setActivePinia(createPinia()));

it("renders the preset and appearance rows with the component select", async () => {
  const settings = useSettingsStore();
  settings.value.themePreset = "atom";
  settings.value.appearance = "dark";
  // The preset and appearance rows live in the 外观 category.
  useEditorStore().settingsCategory = "外观";
  const wrapper = mount(SettingsPanel, {
    props: { registry: new CommandRegistry() },
    attachTo: document.body,
  });
  await settle();
  const triggers = wrapper.findAll("[role=combobox]");
  expect(triggers).toHaveLength(2);
  // SelectValue shows the matched option's label, not the stored id.
  expect(triggers[0].text()).toContain("Atom One");
  expect(triggers[1].text()).toContain("深色");
  wrapper.unmount();
  document.body.replaceChildren();
});

it("selects a font through the real portalled picker without closing settings", async () => {
  useEditorStore().settingsCategory = "编辑器";
  const wrapper = mount(SettingsPanel, {
    props: { registry: new CommandRegistry() },
    attachTo: document.body,
  });
  await settle();
  await wrapper.get('[aria-label="正文字体"]').trigger("keydown", { key: "Enter" });
  const serif = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent?.includes("系统衬线"))!;
  expect(serif).toBeDefined();
  serif.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
  expect(useSettingsStore().value.fontFamily).toBe("serif");
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  expect(wrapper.get('[aria-label="正文字体"]').text()).toContain("系统衬线");
  wrapper.unmount();
  document.body.replaceChildren();
});
