import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDocumentStore } from "../src/stores/document";
import { headings, statistics } from "../src/editor/markdown/metadata";

describe("document snapshots", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("tracks genuine changes and returns independent snapshots", () => {
    const doc = useDocumentStore();
    const before = doc.snapshot();
    doc.update(before.content);
    expect(doc.version).toBe(0);
    doc.update("# New\n正文");
    expect(doc.snapshot()).toEqual({
      content: "# New\n正文",
      dirty: true,
      version: 1,
    });
    expect(before.dirty).toBe(false);
    expect(before.content).not.toEqual(doc.content);
    doc.update(before.content);
    expect(doc.dirty).toBe(false);
    expect(doc.version).toBe(2);
  });
  it("ignores fenced code headings, including shorter nested fences", () => {
    expect(
      headings(
        "# Start\n````md\n# Hidden\n```\n## Also hidden\n````\n## Visible ##\n~~~\n# Hidden\n~~~",
      ),
    ).toEqual([
      { level: 1, text: "Start" },
      { level: 2, text: "Visible" },
    ]);
  });
  it("counts Unicode characters and CRLF lines without counting spaces", () => {
    expect(statistics("你好 📝\r\nabc")).toEqual({ characters: 6, lines: 2 });
    expect(statistics("")).toEqual({ characters: 0, lines: 0 });
  });
});

describe("save concurrency", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("keeps edits made while a disk save was running dirty", () => {
    const doc = useDocumentStore();
    doc.load({
      path: "/a.md",
      content: "old",
      diskHash: "0",
      lineEnding: "LF",
      bom: false,
    });
    doc.update("first");
    const id = doc.identity;
    doc.update("second");
    doc.markSaved(
      {
        path: "/a.md",
        content: "first",
        diskHash: "1",
        lineEnding: "LF",
        bom: false,
      },
      id,
    );
    expect(doc.content).toBe("second");
    expect(doc.dirty).toBe(true);
    doc.load({
      path: "/b.md",
      content: "other",
      diskHash: "2",
      lineEnding: "LF",
      bom: false,
    });
    doc.markSaved(
      {
        path: "/a.md",
        content: "second",
        diskHash: "3",
        lineEnding: "LF",
        bom: false,
      },
      id,
    );
    expect(doc.path).toBe("/b.md");
    expect(doc.content).toBe("other");
  });
});

it("includes Setext headings and excludes YAML front matter", () => {
  expect(
    headings("---\ntitle: title\n---\nMain\n====\n\nSection\n----\n"),
  ).toEqual([
    { level: 1, text: "Main" },
    { level: 2, text: "Section" },
  ]);
});
