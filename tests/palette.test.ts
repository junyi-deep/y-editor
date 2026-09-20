import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import CommandPalette from "../src/command-palette/CommandPalette.vue";
import { CommandRegistry } from "../src/command-palette/registry";
import { useEditorStore } from "../src/stores/editor";
import { useWorkspaceStore } from "../src/stores/workspace";
import { useSettingsStore } from "../src/stores/settings";
import { backend, call } from "../src/services/backend";
vi.mock("../src/services/backend", () => ({
  call: vi.fn(async () => {}),
  backend: {
    search: vi.fn(),
    mutate: vi.fn(async () => {}),
    entries: vi.fn(async () => []),
  },
}));
vi.mock("../src/services/dialog", () => ({
  choose: vi.fn(async () => "trash"),
}));
beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
it("limits content results to 70 and opens the selected matching line", async () => {
  useWorkspaceStore().root = "/test";
  const ui = useEditorStore();
  ui.paletteMode = "content";
  ui.paletteQuery = "needle";
  vi.mocked(backend.search).mockResolvedValue(
    Array.from({ length: 100 }, (_, i) => ({
      path: "/test/doc.md",
      line: i + 1,
      text: "needle",
      start: 0,
      end: 6,
    })),
  );
  const wrapper = mount(CommandPalette, {
    props: { registry: new CommandRegistry() },
  });
  await vi.advanceTimersByTimeAsync(230);
  await flushPromises();
  expect(wrapper.findAll(".palette-results button")).toHaveLength(70);
  await wrapper.findAll(".palette-results button")[3].trigger("click");
  expect(wrapper.emitted("open")?.[0]).toEqual(["/test/doc.md", 4]);
  wrapper.unmount();
});
it("uses > for commands and empty file search for recent folders", async () => {
  const ui = useEditorStore();
  ui.paletteQuery = ">Save";
  const registry = new CommandRegistry();
  registry.register({
    id: "save",
    title: "Save",
    category: "File",
    execute: () => {},
  });
  const wrapper = mount(CommandPalette, { props: { registry } });
  expect(wrapper.findAll(".palette-results button")).toHaveLength(1);
  useSettingsStore().value.recentEntries = [
    { path: "/recent", kind: "folder" },
  ];
  ui.paletteQuery = "";
  await flushPromises();
  await wrapper.get(".palette-results button").trigger("click");
  expect(wrapper.emitted("folder")?.[0]).toEqual(["/recent"]);
  wrapper.unmount();
});
it("cycles three explicit modes with Tab and Shift+Tab without a prefix", async () => {
  const ui = useEditorStore();
  const wrapper = mount(CommandPalette, {
    props: { registry: new CommandRegistry() },
  });
  await wrapper.get("section").trigger("keydown", { key: "Tab" });
  expect(ui.paletteMode).toBe("content");
  await wrapper.get("section").trigger("keydown", { key: "Tab" });
  expect(ui.paletteMode).toBe("commands");
  expect(ui.paletteQuery).toBe("");
  await wrapper
    .get("section")
    .trigger("keydown", { key: "Tab", shiftKey: true });
  expect(ui.paletteMode).toBe("content");
  wrapper.unmount();
});
it("uses configured search limits and regex preference", async () => {
  useWorkspaceStore().root = "/test";
  useSettingsStore().value.paletteSearchLimit = 5;
  const ui = useEditorStore();
  ui.paletteMode = "content";
  ui.paletteQuery = "needle.*";
  vi.mocked(backend.search).mockResolvedValue(
    Array.from({ length: 20 }, (_, i) => ({
      path: "/test/a.md",
      line: i + 1,
      column: 1,
      text: "needle",
    })),
  );
  const wrapper = mount(CommandPalette, {
    props: { registry: new CommandRegistry() },
  });
  await vi.advanceTimersByTimeAsync(230);
  await flushPromises();
  expect(backend.search).toHaveBeenLastCalledWith(
    expect.objectContaining({ regex: true, limit: 5 }),
  );
  expect(wrapper.findAll(".palette-results button")).toHaveLength(5);
  wrapper.unmount();
});

it("routes file result context actions through bounded native commands", async () => {
  const ws = useWorkspaceStore();
  ws.root = "/test";
  ws.files = [
    {
      name: "doc.md",
      relative: "doc.md",
      path: "/test/doc.md",
      directory: false,
    },
  ];
  const wrapper = mount(CommandPalette, {
    props: { registry: new CommandRegistry() },
  });
  for (const [label, command] of [
    ["在文件管理器中打开", "reveal_file"],
    ["使用系统应用打开", "open_system_file"],
  ]) {
    await wrapper
      .get(".palette-results button")
      .trigger("contextmenu", { clientX: 100, clientY: 100 });
    await wrapper
      .findAll(".palette-context button")
      .find((b) => b.text() === label)!
      .trigger("click");
    await flushPromises();
    expect(call).toHaveBeenCalledWith(command, { path: "/test/doc.md" });
  }
  await wrapper
    .get(".palette-results button")
    .trigger("contextmenu", { clientX: 100, clientY: 100 });
  await wrapper
    .findAll(".palette-context button")
    .find((b) => b.text() === "删除文件…")!
    .trigger("click");
  await flushPromises();
  expect(backend.mutate).toHaveBeenCalledWith("trash", "/test/doc.md");
  expect(wrapper.findAll(".palette-results button")).toHaveLength(0);
  wrapper.unmount();
});
it("previews themes with arrows and restores the original on cancel", async () => {
  const registry = new CommandRegistry();
  registry.register({
    id: "theme.choose",
    title: "切换主题",
    category: "主题",
    execute: () => {},
  });
  const ui = useEditorStore();
  ui.paletteMode = "commands";
  const settings = useSettingsStore();
  const original = settings.value.themePreset;
  const wrapper = mount(CommandPalette, { props: { registry } });
  await wrapper.get(".palette-results button").trigger("click");
  expect(wrapper.findAll(".palette-results button").length).toBeGreaterThan(3);
  Element.prototype.scrollIntoView = vi.fn();
  await wrapper.get("section").trigger("keydown", { key: "ArrowDown" });
  expect(settings.value.themePreset).not.toBe(original);
  wrapper.unmount();
  expect(settings.value.themePreset).toBe(original);
});
