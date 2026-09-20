export type TableAction =
  | "addRowBefore"
  | "addColumnBefore"
  | "addRow"
  | "deleteRow"
  | "addColumn"
  | "deleteColumn"
  | "left"
  | "center"
  | "right";
export function tableMarkdown(rows: number, columns: number) {
  rows = Math.max(1, Math.min(50, Math.round(rows)));
  columns = Math.max(1, Math.min(20, Math.round(columns)));
  const line = (header = false) =>
    "| " +
    Array.from({ length: columns }, (_, i) =>
      header ? `列 ${i + 1}` : " ",
    ).join(" | ") +
    " |";
  return (
    "\n\n" +
    [
      line(true),
      "| " + Array(columns).fill("---").join(" | ") + " |",
      ...Array.from({ length: Math.max(0, rows - 1) }, () => line()),
    ].join("\n") +
    "\n\n"
  );
}
/** Mutates only the selected table; caller dispatches an editor input to retain undo. */
export function mutateTable(
  cell: HTMLTableCellElement,
  action: TableAction,
  selection?: Range | null,
): HTMLTableCellElement | null {
  const table = cell.closest("table");
  if (!table) return null;
  const row = cell.parentElement as HTMLTableRowElement;
  const column = cell.cellIndex;
  if (["left", "center", "right"].includes(action)) {
    const columns = new Set([column]);
    if (selection && !selection.collapsed)
      for (const item of Array.from(table.rows).flatMap((r) =>
        Array.from(r.cells),
      )) {
        if (selection.intersectsNode(item)) columns.add(item.cellIndex);
      }
    for (const r of Array.from(table.rows))
      for (const c of Array.from(r.cells))
        if (columns.has(c.cellIndex)) c.setAttribute("align", action);
    return cell;
  }
  if (selection && !selection.collapsed) {
    const selected = Array.from(table.rows)
      .flatMap((r) => Array.from(r.cells))
      .filter((c) => selection.intersectsNode(c));
    const columns = [...new Set(selected.map((c) => c.cellIndex))].sort(
      (a, b) => a - b,
    );
    const rows = [
      ...new Set(
        selected.map((c) => (c.parentElement as HTMLTableRowElement).rowIndex),
      ),
    ].sort((a, b) => a - b);
    if (action === "deleteRow" || action === "deleteColumn") {
      const indices = action === "deleteRow" ? rows : columns;
      const total =
        action === "deleteRow" ? table.rows.length : row.cells.length;
      if (indices.length >= total) {
        table.remove();
        return null;
      }
      let next: HTMLTableCellElement | null = cell;
      for (const index of indices.reverse()) {
        const target =
          action === "deleteRow"
            ? table.rows[index]?.cells[0]
            : table.rows[0]?.cells[index];
        if (target) next = mutateTable(target, action);
      }
      return next;
    }
    if (
      selected.length &&
      ["addRow", "addRowBefore", "addColumn", "addColumnBefore"].includes(
        action,
      )
    ) {
      const target =
        action === "addRow"
          ? table.rows[rows.at(-1)!].cells[column]
          : action === "addRowBefore"
            ? table.rows[rows[0]].cells[column]
            : row.cells[action === "addColumn" ? columns.at(-1)! : columns[0]];
      return mutateTable(target, action);
    }
  }
  if (action === "addColumn" || action === "addColumnBefore") {
    const insertion = column + (action === "addColumn" ? 1 : 0);
    if (row.cells.length >= 50) return cell;
    for (const r of Array.from(table.rows)) {
      const next = document.createElement(
        r.parentElement?.tagName === "THEAD" ? "th" : "td",
      );
      next.innerHTML = "<br>";
      const align = r.cells[column]?.getAttribute("align");
      if (align) next.setAttribute("align", align);
      r.insertBefore(next, r.cells[insertion] ?? null);
    }
    return row.cells[insertion];
  }
  if (action === "deleteColumn") {
    if (row.cells.length <= 1) return cell;
    for (const r of Array.from(table.rows)) r.cells[column]?.remove();
    return row.cells[Math.min(column, row.cells.length - 1)];
  }
  if (action === "addRow" || action === "addRowBefore") {
    const next = document.createElement("tr");
    for (const c of Array.from(row.cells)) {
      const td = document.createElement("td");
      td.innerHTML = "<br>";
      const align = c.getAttribute("align");
      if (align) td.setAttribute("align", align);
      next.append(td);
    }
    if (row.parentElement?.tagName === "THEAD") {
      const body = table.tBodies[0] ?? table.createTBody();
      body.prepend(next);
      if (action === "addRowBefore") {
        const old = Array.from(row.cells).map((c) => c.innerHTML);
        Array.from(row.cells).forEach((c) => (c.innerHTML = "<br>"));
        Array.from(next.cells).forEach((c, i) => (c.innerHTML = old[i]));
        return row.cells[column];
      }
    } else if (action === "addRowBefore") row.before(next);
    else row.after(next);
    return next.cells[column];
  }
  if (table.rows.length <= 1) return cell;
  const index = row.rowIndex;
  row.remove();
  if (index === 0) {
    const first = table.rows[0];
    for (const td of Array.from(first.cells)) {
      const th = document.createElement("th");
      th.innerHTML = td.innerHTML;
      const align = td.getAttribute("align");
      if (align) th.setAttribute("align", align);
      td.replaceWith(th);
    }
    table.createTHead().append(first);
  }
  return table.rows[Math.min(index, table.rows.length - 1)].cells[column];
}

/** Header remains the first logical row; moving rows preserves their contents. */
export function reorderTable(
  source: HTMLTableCellElement,
  target: HTMLTableCellElement,
  axis: "row" | "column",
) {
  const table = source.closest("table");
  if (!table || table !== target.closest("table")) return false;
  if (axis === "column") {
    const from = source.cellIndex,
      to = target.cellIndex;
    if (from === to) return false;
    for (const row of Array.from(table.rows)) {
      const moving = row.cells[from],
        destination = row.cells[to];
      if (from < to) destination.after(moving);
      else destination.before(moving);
    }
  } else {
    const from = source.parentElement as HTMLTableRowElement,
      to = target.parentElement as HTMLTableRowElement;
    if (from === to) return false;
    const rows = Array.from(table.rows);
    rows.splice(rows.indexOf(from), 1);
    rows.splice(rows.indexOf(to), 0, from);
    const head = table.createTHead(),
      body = table.tBodies[0] ?? table.createTBody();
    rows.forEach((row, i) => {
      for (const cell of Array.from(row.cells)) {
        const replacement = document.createElement(i === 0 ? "th" : "td");
        replacement.innerHTML = cell.innerHTML;
        const align = cell.getAttribute("align");
        if (align) replacement.setAttribute("align", align);
        cell.replaceWith(replacement);
      }
      (i === 0 ? head : body).append(row);
    });
  }
  return true;
}
