import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import FileSidebar from "../src/workspace/FileSidebar.vue";
import { useWorkspaceStore } from "../src/stores/workspace";
import { nextTick } from "vue";
vi.mock("../src/services/backend", () => ({
  call: vi.fn(),
  backend: { entries: vi.fn(async () => []), search: vi.fn(async () => []) },
}));
beforeEach(() => setActivePinia(createPinia()));
it("keeps a large folder bounded and renders rows at the scroll position", async () => {
  const ws = useWorkspaceStore();
  ws.root = "/fixture";
  ws.files = Array.from({ length: 10000 }, (_, i) => ({
    name: `${String(i).padStart(5, "0")}.md`,
    relative: `${String(i).padStart(5, "0")}.md`,
    path: `/fixture/${i}.md`,
    directory: false,
  }));
  const wrapper = mount(FileSidebar);
  expect(wrapper.findAll(".tree-item")).toHaveLength(100);
  const tree = wrapper.get(".file-tree");
  // 31px per row is the --y-row-height fallback the virtualiser uses off-DOM.
  (tree.element as HTMLElement).scrollTop = 1000 * 31;
  await tree.trigger("scroll");
  await nextTick();
  expect(wrapper.findAll(".tree-item")).toHaveLength(100);
  expect(wrapper.findAll(".tree-item")[0].text()).toContain("00988.md");
  wrapper.unmount();
});
it("anchors context actions at the mouse position", async () => {
  const ws = useWorkspaceStore();
  ws.root = "/fixture";
  ws.files = [
    {
      name: "note.md",
      relative: "note.md",
      path: "/fixture/note.md",
      directory: false,
    },
  ];
  const wrapper = mount(FileSidebar);
  await wrapper
    .get(".tree-item")
    .trigger("contextmenu", { clientX: 140, clientY: 180 });
  expect(wrapper.get(".file-context").attributes("style")).toContain(
    "left: 140px",
  );
  expect(wrapper.get(".file-context").attributes("style")).toContain(
    "top: 180px",
  );
  wrapper.unmount();
});
