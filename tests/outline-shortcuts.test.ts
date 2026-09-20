import { describe, it, expect } from "vitest";
import { outlineTree, visibleOutline } from "../src/editor/markdown/outline";
import { CommandRegistry } from "../src/command-palette/registry";
describe("outline and remapped shortcuts", () => {
  it("numbers logical hierarchy, collapses descendants and finds hidden headings", () => {
    const nodes = outlineTree([
      { level: 1, text: "One" },
      { level: 3, text: "Child" },
      { level: 4, text: "Leaf" },
      { level: 2, text: "Second child" },
      { level: 1, text: "Two" },
    ]);
    expect(nodes.map((n) => n.number)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.2",
      "2",
    ]);
    const collapsed = new Set([nodes[0].key]);
    expect(visibleOutline(nodes, collapsed, "").map((n) => n.text)).toEqual([
      "One",
      "Two",
    ]);
    expect(
      visibleOutline(nodes, collapsed, "leaf").map((n) => n.number),
    ).toEqual(["1.1.1"]);
    expect(visibleOutline(nodes, new Set(), "").length).toBe(5);
  });
  it("replaces and disables default accelerators", () => {
    const overrides: Record<string, string> = { save: "Mod+Alt+s" };
    const registry = new CommandRegistry(() => overrides);
    registry.register({
      id: "save",
      title: "Save",
      category: "File",
      shortcut: "Mod+s",
      execute: () => {},
    });
    expect(
      registry.match(new KeyboardEvent("keydown", { key: "s", ctrlKey: true })),
    ).toBeUndefined();
    expect(
      registry.match(
        new KeyboardEvent("keydown", { key: "s", metaKey: true, altKey: true }),
      )?.id,
    ).toBe("save");
    overrides.save = "";
    expect(
      registry.match(
        new KeyboardEvent("keydown", { key: "s", metaKey: true, altKey: true }),
      ),
    ).toBeUndefined();
    delete overrides.save;
    expect(
      registry.match(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }))
        ?.id,
    ).toBe("save");
  });
});
