import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import SettingsPanel from "../src/settings/SettingsPanel.vue";
import { CommandRegistry } from "../src/command-palette/registry";
import { useSettingsStore } from "../src/stores/settings";
import { useEditorStore } from "../src/stores/editor";

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
  await flushPromises();
  const triggers = wrapper.findAll("[role=combobox]");
  expect(triggers).toHaveLength(2);
  // SelectValue shows the matched option's label, not the stored id.
  expect(triggers[0].text()).toContain("Atom One");
  expect(triggers[1].text()).toContain("深色");
  wrapper.unmount();
});
