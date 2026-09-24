import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  CellSelection,
  selectedRect,
  tableEditingKey,
} from "@milkdown/kit/prose/tables";
import type { TableAction } from "./tables";

/** Spreadsheet-style selection; double-click enters text, edges retain reordering. */
export function createTableSelection(view: EditorView, host: HTMLElement) {
  let anchor: HTMLTableCellElement | undefined;
  function position(cell: HTMLTableCellElement) {
    const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));
    for (let depth = $pos.depth; depth > 0; depth--)
      if (
        ["cell", "header_cell"].includes(
          $pos.node(depth).type.spec.tableRole ?? "",
        )
      )
        return $pos.before(depth);
    return undefined;
  }
  function select(from: HTMLTableCellElement, to: HTMLTableCellElement) {
    if (from.closest("table") !== to.closest("table")) return;
    const a = position(from),
      b = position(to);
    if (a === undefined || b === undefined) return;
    const selection = CellSelection.create(view.state.doc, a, b);
    if (!view.state.selection.eq(selection))
      view.dispatch(
        view.state.tr
          .setSelection(selection)
          .setMeta(tableEditingKey, anchor ? a : -1),
      );
  }
  function cellAt(event: MouseEvent) {
    const cell = (event.target as Element)?.closest?.<HTMLTableCellElement>(
      "td,th",
    );
    return cell && host.contains(cell) ? cell : undefined;
  }
  function down(event: MouseEvent) {
    // A right-click (or macOS ctrl+click) on a live cell selection must leave it
    // alone: without this the browser moves the DOM caret, ProseMirror reads it
    // back and replaces the CellSelection, and the menu can no longer act on it.
    if (
      (event.button !== 0 || event.ctrlKey) &&
      view.state.selection instanceof CellSelection
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
    const cell = cellAt(event);
    if (
      !cell ||
      event.button !== 0 ||
      event.detail >= 2 ||
      cell.draggable ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    anchor = cell;
    if (event.shiftKey && view.state.selection instanceof CellSelection) {
      const dom = view.nodeDOM(view.state.selection.$anchorCell.pos);
      if (
        dom instanceof HTMLTableCellElement &&
        dom.closest("table") === cell.closest("table")
      )
        anchor = dom;
    }
    view.focus();
    select(anchor, cell);
  }
  function move(event: MouseEvent) {
    if (!anchor?.isConnected) {
      anchor = undefined;
      return;
    }
    const cell = cellAt(event);
    if (cell) {
      event.preventDefault();
      select(anchor, cell);
    }
    const rect = view.dom.getBoundingClientRect();
    if (event.clientY > rect.bottom - 28) view.dom.scrollTop += 16;
    else if (event.clientY < rect.top + 28) view.dom.scrollTop -= 16;
  }
  function stop() {
    anchor = undefined;
    if (tableEditingKey.getState(view.state) != null)
      view.dispatch(view.state.tr.setMeta(tableEditingKey, -1));
  }
  function context(event: MouseEvent) {
    const cell = cellAt(event);
    if (cell && !cell.classList.contains("selectedCell")) select(cell, cell);
  }
  host.addEventListener("mousedown", down, true);
  host.addEventListener("contextmenu", context, true);
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", stop);
  window.addEventListener("blur", stop);
  return () => {
    host.removeEventListener("mousedown", down, true);
    host.removeEventListener("contextmenu", context, true);
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", stop);
    window.removeEventListener("blur", stop);
  };
}

function tableAt(view: EditorView, cell: HTMLTableCellElement) {
  const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === "table")
      return { node: $pos.node(depth), pos: $pos.before(depth) };
  }
  return null;
}
function rowsOf(node: ProseNode) {
  const rows: ProseNode[][] = [];
  node.forEach((row) => {
    const cells: ProseNode[] = [];
    row.forEach((cell) => cells.push(cell));
    rows.push(cells);
  });
  return rows;
}
function commit(
  view: EditorView,
  table: { node: ProseNode; pos: number },
  rows: ProseNode[][],
) {
  const schema = view.state.schema;
  const tr = view.state.tr;
  if (!rows.length || !rows[0]?.length)
    tr.delete(table.pos, table.pos + table.node.nodeSize);
  else {
    // GFM always has a header row; reordering keeps content and converts roles.
    while (rows.length < 2)
      rows.push(
        rows[0].map((c) =>
          schema.nodes.table_cell.create(
            c.attrs,
            schema.nodes.paragraph.create(),
          ),
        ),
      );
    const node = schema.nodes.table.create(
      table.node.attrs,
      rows.map((row, index) =>
        schema.nodes[index ? "table_row" : "table_header_row"].create(
          null,
          row.map((c) =>
            schema.nodes[index ? "table_cell" : "table_header"].create(
              c.attrs,
              c.content,
            ),
          ),
        ),
      ),
    );
    tr.replaceWith(table.pos, table.pos + table.node.nodeSize, node);
    tr.setSelection(TextSelection.near(tr.doc.resolve(table.pos + 3)));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}
export function changeTable(
  view: EditorView,
  action: TableAction,
  cell: HTMLTableCellElement,
  range: Range | null,
) {
  const table = tableAt(view, cell);
  if (!table) return;
  const rows = rowsOf(table.node),
    html = cell.closest("table")!;
  const r = (cell.parentElement as HTMLTableRowElement).rowIndex,
    c = cell.cellIndex;
  let rowIndices = [r],
    cols = [c];
  if (view.state.selection instanceof CellSelection) {
    const rect = selectedRect(view.state);
    rowIndices = Array.from(
      { length: rect.bottom - rect.top },
      (_, i) => rect.top + i,
    );
    cols = Array.from(
      { length: rect.right - rect.left },
      (_, i) => rect.left + i,
    );
  } else if (range && !range.collapsed) {
    const cells = Array.from(html.rows)
      .flatMap((row) => Array.from(row.cells))
      .filter((el) => range.intersectsNode(el));
    if (cells.length) {
      rowIndices = [
        ...new Set(
          cells.map((el) => (el.parentElement as HTMLTableRowElement).rowIndex),
        ),
      ];
      cols = [...new Set(cells.map((el) => el.cellIndex))];
    }
  }
  const blank = (reference: ProseNode) =>
    view.state.schema.nodes.table_cell.create(
      reference.attrs,
      view.state.schema.nodes.paragraph.create(),
    );
  if (["left", "center", "right"].includes(action))
    rows.forEach((row) =>
      cols.forEach((i) => {
        row[i] = row[i].type.create(
          { ...row[i].attrs, alignment: action },
          row[i].content,
        );
      }),
    );
  if (action === "deleteTable") rows.splice(0);
  if (action === "deleteRow")
    rowIndices.sort((a, b) => b - a).forEach((i) => rows.splice(i, 1));
  if (action === "deleteColumn")
    rows.forEach((row) =>
      cols.sort((a, b) => b - a).forEach((i) => row.splice(i, 1)),
    );
  if (action === "addRow" || action === "addRowBefore")
    rows.splice(
      action === "addRow"
        ? Math.max(...rowIndices) + 1
        : Math.min(...rowIndices),
      0,
      rows[r].map(blank),
    );
  if (action === "addColumn" || action === "addColumnBefore")
    rows.forEach((row) =>
      row.splice(
        action === "addColumn" ? Math.max(...cols) + 1 : Math.min(...cols),
        0,
        blank(row[c]),
      ),
    );
  commit(view, table, rows);
}
export function moveTable(
  view: EditorView,
  from: HTMLTableCellElement,
  to: HTMLTableCellElement,
  axis: "row" | "column",
) {
  if (from.closest("table") !== to.closest("table")) return;
  const source =
    axis === "row"
      ? (from.parentElement as HTMLTableRowElement | null)?.rowIndex
      : from.cellIndex;
  const target =
    axis === "row"
      ? (to.parentElement as HTMLTableRowElement | null)?.rowIndex
      : to.cellIndex;
  // Edge presses that end on the origin row/column are clicks, not reorders.
  // Committing anyway would rebuild the table, drop the cell selection and
  // push a phantom undo step.
  if (source === undefined || target === undefined || source === target) return;
  const table = tableAt(view, from);
  if (!table) return;
  const rows = rowsOf(table.node);
  const move = <T>(items: T[], a: number, b: number) =>
    items.splice(b, 0, items.splice(a, 1)[0]);
  if (axis === "row") move(rows, source, target);
  else rows.forEach((row) => move(row, source, target));
  commit(view, table, rows);
}
