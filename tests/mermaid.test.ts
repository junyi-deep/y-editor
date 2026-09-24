import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { createMermaidRenderer } from "../src/editor/adapter/mermaid";
const mock = vi.hoisted(() => ({
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Graph</text></svg>',
  })),
  initialize: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mock }));
let intersect: (entries: unknown[]) => void;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof intersect) {
        intersect = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
/** A preview host inside a parent, wired the way the Milkdown node view wires it. */
function fixture(source: string) {
  const wrapper = document.createElement("div");
  const host = document.createElement("div");
  wrapper.append(host);
  document.body.append(wrapper);
  const state = { source, editing: false };
  const hooks = {
    source: () => state.source,
    editing: () => state.editing,
    edit: vi.fn(),
    update: vi.fn(),
    reference: vi.fn(),
  };
  return { wrapper, host, state, hooks };
}
describe("Mermaid preview lifecycle", () => {
  it("automatically renders large graphs by default when visible", async () => {
    const { host, hooks } = fixture("graph LR\n" + "%% comment\n".repeat(600));
    const renderer = createMermaidRenderer(
      () => false,
      () => true,
      hooks,
    );
    renderer.render(host);
    expect(host.querySelector("button")).toBeNull();
    intersect([{ isIntersecting: true, target: host }]);
    await flushPromises();
    expect(host.querySelector("svg")).not.toBeNull();
    renderer.destroy();
  });
  it("renders large diagrams without bubbling clicks into code editing", async () => {
    const { wrapper, host, hooks } = fixture(
      "graph LR\n" + "%% long comment\n".repeat(500),
    );
    const parentClick = vi.fn();
    wrapper.addEventListener("click", parentClick);
    const renderer = createMermaidRenderer(
      () => false,
      () => false,
      hooks,
    );
    renderer.render(host);
    (host.querySelector("button") as HTMLButtonElement).click();
    await flushPromises();
    expect(mock.render).toHaveBeenCalledOnce();
    expect(host.querySelector("svg")).not.toBeNull();
    expect(parentClick).not.toHaveBeenCalled();
    expect(host.textContent).toContain("演示");
    expect(host.textContent).toContain("双击进行编辑");
    expect(host.textContent).not.toContain("保存");
    renderer.render(host);
    expect(mock.render).toHaveBeenCalledOnce();
    host.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(hooks.edit).toHaveBeenCalledWith(host);
    renderer.destroy();
  });
  it("re-renders changed sources and recovers a replaced preview DOM", async () => {
    const { host, state, hooks } = fixture("graph LR\n A-->B");
    const renderer = createMermaidRenderer(
      () => false,
      () => true,
      hooks,
    );
    renderer.render(host);
    intersect([{ isIntersecting: true, target: host }]);
    await flushPromises();
    state.source = "graph LR\n B-->C";
    renderer.render(host);
    intersect([{ isIntersecting: true, target: host }]);
    await flushPromises();
    expect(mock.render).toHaveBeenLastCalledWith(
      expect.any(String),
      "graph LR\n B-->C",
    );
    host.replaceChildren();
    renderer.render(host);
    intersect([{ isIntersecting: true, target: host }]);
    await flushPromises();
    expect(host.querySelector("svg")).not.toBeNull();
    expect(mock.render).toHaveBeenCalledTimes(3);
    renderer.destroy();
  });
});

it("zooms with Ctrl+wheel and sends the diagram source as an AI reference", async () => {
  const { host, hooks } = fixture("graph TD\n A-->B");
  const renderer = createMermaidRenderer(
    () => false,
    () => true,
    hooks,
  );
  renderer.render(host);
  intersect([{ isIntersecting: true, target: host }]);
  await flushPromises();
  host.querySelector(".diagram-viewport")!.dispatchEvent(
    new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: -100,
      cancelable: true,
    }),
  );
  expect(
    (host.querySelector(".diagram-stage") as HTMLElement).style.transform,
  ).not.toContain("scale(");
  expect(
    Number(host.querySelector<HTMLElement>(".diagram-stage")!.dataset.zoom),
  ).toBeCloseTo(1.6487, 3);
  expect(parseFloat(host.querySelector("svg")!.style.width)).toBeGreaterThan(
    800,
  );
  Array.from(host.querySelectorAll("button"))
    .find((b) => b.getAttribute("aria-label") === "引用到 AI")!
    .click();
  expect(hooks.reference).toHaveBeenCalledWith("graph TD\n A-->B", host);
  renderer.destroy();
});
it("keeps the chart hidden and avoids render work while its source is being edited", async () => {
  const { host, state, hooks } = fixture("graph TD\n A-->B");
  const renderer = createMermaidRenderer(
    () => false,
    () => true,
    hooks,
  );
  renderer.render(host);
  intersect([{ isIntersecting: true, target: host }]);
  await flushPromises();
  expect(mock.render).toHaveBeenCalledTimes(1);
  state.editing = true;
  state.source = "graph TD\n A-->C";
  renderer.render(host);
  intersect([{ isIntersecting: true, target: host }]);
  await flushPromises();
  expect(host.hidden).toBe(true);
  expect(mock.render).toHaveBeenCalledTimes(1);
  state.editing = false;
  renderer.refresh();
  await flushPromises();
  expect(host.hidden).toBe(false);
  expect(mock.render).toHaveBeenCalledTimes(2);
  renderer.destroy();
});
