import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { afterEach, expect, it } from "vitest";
import ShortcutHelp from "../src/settings/ShortcutHelp.vue";
import FileSidebar from "../src/workspace/FileSidebar.vue";
import { CommandRegistry } from "../src/command-palette/registry";
import { useWorkspaceStore } from "../src/stores/workspace";

afterEach(() => document.body.replaceChildren());
it("focuses help search and matches full pinyin, initials and shortcuts", async () => {
  const registry = new CommandRegistry();
  registry.register({
    id: "file.new",
    title: "新建文件",
    category: "文件",
    shortcut: "Mod+n",
    execute: () => {},
  });
  registry.register({
    id: "file.save",
    title: "保存",
    category: "文件",
    shortcut: "Mod+s",
    execute: () => {},
  });
  const wrapper = mount(ShortcutHelp, {
    props: { registry },
    attachTo: document.body,
  });
  expect(document.activeElement).toBe(wrapper.get("input").element);
  for (const query of ["xinjian", "xjwj", "Mod+n"]) {
    await wrapper.get("input").setValue(query);
    expect(wrapper.text()).toContain("新建文件");
    expect(wrapper.text()).not.toContain("保存");
  }
  wrapper.unmount();
});
it("lists a command that has no shortcut when its name is searched", async () => {
  const registry = new CommandRegistry();
  registry.register({
    id: "file.newFile",
    title: "新建文件",
    category: "文件",
    execute: () => {},
  });
  const wrapper = mount(ShortcutHelp, {
    props: { registry },
    attachTo: document.body,
  });
  // Browsing shows shortcuts only, so a shortcut-less command must not appear.
  expect(wrapper.text()).not.toContain("新建文件");
  await wrapper.get("input").setValue("xinjian");
  expect(wrapper.text()).toContain("新建文件");
  expect(wrapper.text()).toContain("无快捷键");
  wrapper.unmount();
});
it("opens create actions on empty file-list space without a bottom action bar", async () => {
  const pinia = createPinia();
  const ws = useWorkspaceStore(pinia);
  ws.root = "/workspace";
  ws.files = [];
  const wrapper = mount(FileSidebar, {
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await wrapper
    .get(".file-tree")
    .trigger("contextmenu", { clientX: 120, clientY: 150 });
  await flushPromises();
  expect(wrapper.get("[role=menu]").text()).toContain("新建文件…");
  expect(wrapper.get("[role=menu]").text()).toContain("新建文件夹…");
  expect(wrapper.get("[role=menu]").attributes("style")).toContain(
    "left: 120px",
  );
  expect(wrapper.find(".sidebar-bottom").exists()).toBe(false);
  await wrapper.get("[role=menu]").trigger("keydown", { key: "Escape" });
  expect(wrapper.find("[role=menu]").exists()).toBe(false);
  wrapper.unmount();
});
