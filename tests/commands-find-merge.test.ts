import { describe, it, expect } from "vitest";
import {
  CommandRegistry,
  fuzzyScore,
  shortcutLabel,
} from "../src/command-palette/registry";
import { findMatches, replaceMatches } from "../src/editor/markdown/find";
import { mergePatch } from "../src/ai/merge";
describe("commands and editing", () => {
  it("renders stored combos as platform glyphs without touching the binding", () => {
    expect(shortcutLabel("Mod+q", "MacIntel")).toBe("⌘Q");
    expect(shortcutLabel("Mod+Shift+n", "MacIntel")).toBe("⌘⇧N");
    expect(shortcutLabel("Mod+,", "MacIntel")).toBe("⌘,");
    expect(shortcutLabel("Mod+/", "MacIntel")).toBe("⌘/");
    expect(shortcutLabel()).toBe("");
    expect(shortcutLabel("Mod+Shift+n", "Win32")).toBe("Ctrl+Shift+N");
  });
  it("does not fire disabled commands and distinguishes modifiers", async () => {
    let calls = 0;
    const registry = new CommandRegistry();
    registry.register({
      id: "save",
      title: "保存",
      category: "文件",
      shortcut: "Mod+s",
      execute: () => {
        calls++;
      },
      when: () => false,
    });
    expect(
      registry.match(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }))
        ?.id,
    ).toBe("save");
    expect(
      registry.match(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBeUndefined();
    await registry.execute("save");
    expect(calls).toBe(0);
  });
  it("fuzzy matches ordered characters", () => {
    expect(fuzzyScore("rdm", "README.md")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "README.md")).toBe(-1);
  });
  it("supports literal, regex and case-sensitive find without replacing literal dollar tokens", () => {
    const options = { regex: false, caseSensitive: false, wholeWord: false };
    expect(findMatches("A.b a.b", "a.b", options)).toHaveLength(2);
    expect(replaceMatches("a.b", "a.b", "$1", options)).toBe("$1");
    expect(
      replaceMatches("a12", "a(\\d+)", "$1", { ...options, regex: true }),
    ).toBe("12");
    expect(() =>
      findMatches("text", "[", { ...options, regex: true }),
    ).toThrow();
  });
  it("rebases separated edits and rejects overlapping changes", () => {
    const base = "one\ntwo\nthree\nfour\n";
    expect(
      mergePatch(base, "ONE\ntwo\nthree\nfour\n", "one\ntwo\nthree\nFOUR\n"),
    ).toBe("ONE\ntwo\nthree\nFOUR\n");
    expect(
      mergePatch(base, "ONE\ntwo\nthree\nfour\n", "other\ntwo\nthree\nfour\n"),
    ).toBeNull();
  });
});
import { selectPatch } from "../src/ai/partial";
import { replaceMatchAt } from "../src/editor/markdown/find";
it("selects one edit without applying the other", () => {
  expect(selectPatch("a\nkeep\nb\n", "A\nkeep\nB\n", [0])).toBe("A\nkeep\nb\n");
});
it("replaces a regex match with lookbehind and capture context", () => {
  expect(
    replaceMatchAt(
      "x12 x34",
      "(?<=x)(\\d+)",
      "[$1]",
      { regex: true, caseSensitive: true, wholeWord: false },
      5,
    ),
  ).toBe("x12 x[34]");
});
