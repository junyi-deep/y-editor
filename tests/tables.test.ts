import { createEditorInteractions } from "../src/editor/adapter/interactions";
import { describe, it, expect, vi } from "vitest";
import {
  reorderTable,
  mutateTable,
  tableMarkdown,
} from "../src/editor/adapter/tables";
function fixture() {
  const host = document.createElement("div");
  host.innerHTML =
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>one</td><td>two</td></tr><tr><td>three</td><td>four</td></tr></tbody></table>";
  return host.querySelector("table")!;
}
describe("table operations", () => {
  it("inserts/removes columns and rows while preserving existing contents", () => {
    const table = fixture();
    const cell = table.rows[1].cells[0];
    const added = mutateTable(cell, "addColumn")!;
    expect(Array.from(table.rows).map((r) => r.cells.length)).toEqual([
      3, 3, 3,
    ]);
    expect(table.rows[1].cells[2].textContent).toBe("two");
    mutateTable(added, "deleteColumn");
    expect(table.rows[1].cells[1].textContent).toBe("two");
    const newRow = mutateTable(cell, "addRow")!;
    expect(table.rows.length).toBe(4);
    mutateTable(newRow, "deleteRow");
    expect(table.rows.length).toBe(3);
  });
  it("aligns only the selected column or every column covered by a range", () => {
    const table = fixture();
    const cell = table.rows[1].cells[1];
    mutateTable(cell, "center");
    expect(table.rows[0].cells[0].getAttribute("align")).toBeNull();
    expect(table.rows[0].cells[1].getAttribute("align")).toBe("center");
    const range = document.createRange();
    range.selectNodeContents(table);
    mutateTable(cell, "right", range);
    expect(
      Array.from(table.querySelectorAll("th,td")).every(
        (c) => c.getAttribute("align") === "right",
      ),
    ).toBe(true);
  });
  it("promotes a body row after header deletion and retains a valid table", () => {
    const table = fixture();
    mutateTable(table.rows[0].cells[0], "deleteRow");
    expect(table.rows.length).toBe(2);
    expect(table.tHead?.rows[0].cells[0].tagName).toBe("TH");
    expect(table.tHead?.textContent).toContain("one");
  });
  it("creates the requested row and column dimensions", () => {
    const lines = tableMarkdown(4, 3).trim().split("\n");
    expect(lines.length).toBe(5);
    expect(lines.every((line) => line.split("|").length === 5)).toBe(true);
  });
});

it("handles each row/column keyboard shortcut once without the engine default", () => {
  const host = document.createElement("div");
  const ir = document.createElement("div");
  ir.className = "vditor-ir";
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  const table = fixture();
  editable.append(table);
  ir.append(editable);
  host.append(ir);
  document.body.append(host);
  const interactions = createEditorInteractions(host, {
    format: vi.fn(),
    insert: vi.fn(),
    changed: vi.fn(),
  });
  function select() {
    const range = document.createRange();
    range.selectNodeContents(table.rows[1].cells[0]);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }
  select();
  const row = new KeyboardEvent("keydown", {
    key: "Enter",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  editable.dispatchEvent(row);
  expect(row.defaultPrevented).toBe(true);
  expect(table.rows.length).toBe(4);
  select();
  const column = new KeyboardEvent("keydown", {
    key: "Enter",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  editable.dispatchEvent(column);
  expect(column.defaultPrevented).toBe(true);
  expect(table.rows.length).toBe(4);
  expect(table.rows[0].cells.length).toBe(3);
  interactions.destroy();
  host.remove();
});

it("inserts before the header without discarding the former header", () => {
  const table = fixture();
  mutateTable(table.rows[0].cells[0], "addRowBefore");
  expect(table.rows.length).toBe(4);
  expect(table.rows[0].textContent).toBe("");
  expect(table.rows[1].textContent).toBe("AB");
  mutateTable(table.rows[1].cells[0], "addColumnBefore");
  expect(table.rows[1].cells[1].textContent).toBe("A");
});
it("deletes all selected rows and preserves unselected rows", () => {
  const table = fixture();
  const range = document.createRange();
  range.selectNodeContents(table.tBodies[0]);
  mutateTable(table.rows[1].cells[0], "deleteRow", range);
  expect(table.rows.length).toBe(1);
  expect(table.rows[0].textContent).toBe("AB");
});

it("reorders columns and promotes dragged rows to a valid header", () => {
  const table = fixture();
  expect(
    reorderTable(table.rows[0].cells[0], table.rows[0].cells[1], "column"),
  ).toBe(true);
  expect(table.rows[1].textContent).toBe("twoone");
  expect(
    reorderTable(table.rows[2].cells[0], table.rows[0].cells[0], "row"),
  ).toBe(true);
  expect(table.rows[0].textContent).toBe("fourthree");
  expect(table.rows[0].cells[0].tagName).toBe("TH");
  expect(table.rows[1].cells[0].tagName).toBe("TD");
});

it("resolves context action hints when the menu opens", () => {
  const host = document.createElement("div");
  host.innerHTML = "<p>text</p>";
  document.body.append(host);
  const shortcut = vi.fn((action: string) =>
    action === "undo" ? "Ctrl+Alt+Z" : action === "copy" ? "Ctrl+C" : "",
  );
  const interactions = createEditorInteractions(host, {
    shortcut,
    format: vi.fn(),
    insert: vi.fn(),
    changed: vi.fn(),
  });
  host.firstElementChild!.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  const items = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".editor-context button"),
  );
  expect(items.find((b) => b.textContent === "撤销")!.title).toBe(
    "撤销 · Ctrl+Alt+Z",
  );
  expect(items.find((b) => b.textContent === "复制")!.title).toBe(
    "复制 · Ctrl+C",
  );
  interactions.destroy();
  host.remove();
});
