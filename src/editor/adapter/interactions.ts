import {
  reorderTable,
  mutateTable,
  tableMarkdown,
  type TableAction,
} from "./tables";
interface Hooks {
  shortcut?: (action: string) => string;
  restore?: () => void;
  remember?: () => void;
  selectAll?: () => void;
  table?: (
    action: TableAction,
    cell: HTMLTableCellElement,
    range: Range | null,
  ) => void;
  reorder?: (
    from: HTMLTableCellElement,
    to: HTMLTableCellElement,
    axis: "row" | "column",
  ) => void;
  newTable?: (rows: number, columns: number) => void;
  format: (name: string) => void;
  insert: (text: string) => void;
  changed: () => void;
  error?: (message: string) => void;
}
export function createEditorInteractions(host: HTMLElement, hooks: Hooks) {
  let menu: HTMLDivElement | undefined, dialog: HTMLDialogElement | undefined;
  let saved: Range | null = null;
  let cell: HTMLTableCellElement | null = null;
  function selectedCell() {
    const node = window.getSelection()?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    return el?.closest<HTMLTableCellElement>("td,th") ?? null;
  }
  function remember() {
    hooks.remember?.();
    const selection = window.getSelection();
    if (selection?.rangeCount && host.contains(selection.anchorNode))
      saved = selection.getRangeAt(0).cloneRange();
  }
  function restore() {
    if (hooks.restore) {
      hooks.restore();
      return;
    }
    if (saved && saved.startContainer.isConnected) {
      const editable = host.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      editable?.focus();
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(saved);
    }
  }
  /** Detached menus inherit nothing; copy every app token onto them. */
  function theme(el: HTMLElement) {
    const style = getComputedStyle(host);
    for (const key of Array.from(style))
      if (key.startsWith("--y-"))
        el.style.setProperty(key, style.getPropertyValue(key));
  }
  function button(parent: HTMLElement, label: string, action: () => void) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    const commands: Record<string, string> = {
      撤销: "undo",
      重做: "redo",
      剪切: "cut",
      复制: "copy",
      粘贴: "paste",
      全选: "selectAll",
    };
    b.title = `${label} · ${hooks.shortcut?.(commands[label] ?? "") || "未设置快捷键"}`;
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      restore();
      action();
    };
    parent.append(b);
    return b;
  }
  function closeMenu() {
    menu?.remove();
    menu = undefined;
  }
  function tableAction(action: TableAction) {
    closeMenu();
    restore();
    if (!cell?.isConnected) return;
    if (hooks.table) {
      hooks.table(action, cell, saved);
      return;
    }
    const next = mutateTable(cell, action, saved);
    if (!next) {
      host
        .querySelector('.vditor-ir [contenteditable="true"]')
        ?.dispatchEvent(new InputEvent("input", { bubbles: true }));
      hooks.changed();
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const editable = host.querySelector<HTMLElement>(
      '.vditor-ir [contenteditable="true"]',
    );
    editable?.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: null,
      }),
    );
    hooks.changed();
    remember();
    refresh();
  }
  function picker() {
    closeMenu();
    dialog?.remove();
    dialog = document.createElement("dialog");
    dialog.className = "table-picker";
    dialog.setAttribute("aria-label", "新增表格");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const title = document.createElement("h3");
    title.textContent = "新增表格";
    dialog.append(title);
    let locked = false;
    let rows = 3,
      columns = 3;
    const info = document.createElement("p");
    const grid = document.createElement("div");
    grid.className = "table-picker-grid";
    const update = () => {
      info.textContent = `${rows} 行 × ${columns} 列（含表头）`;
      dialog
        ?.querySelectorAll<HTMLInputElement>(".table-dimensions input")
        .forEach((input, i) => (input.value = String(i ? columns : rows)));
      grid
        .querySelectorAll("button")
        .forEach((b, i) =>
          b.classList.toggle(
            "selected",
            Math.floor(i / 8) < rows && i % 8 < columns,
          ),
        );
    };
    for (let r = 1; r <= 8; r++)
      for (let c = 1; c <= 8; c++) {
        const b = button(grid, `${r} 行 ${c} 列`, () => {
          locked = true;
          rows = r;
          columns = c;
          update();
        });
        b.setAttribute("aria-label", b.textContent!);
        b.onmouseenter = () => {
          if (locked) return;
          rows = r;
          columns = c;
          update();
        };
      }
    const dimensions = document.createElement("div");
    dimensions.className = "table-dimensions";
    for (const [label, max] of [
      ["行数", 50],
      ["列数", 20],
    ] as const) {
      const wrapper = document.createElement("label");
      wrapper.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = String(max);
      input.value = "3";
      input.setAttribute("aria-label", label);
      input.oninput = () => {
        locked = true;
        const value = Math.max(
          1,
          Math.min(max, Math.round(Number(input.value) || 1)),
        );
        if (label === "行数") rows = value;
        else columns = value;
        update();
      };
      wrapper.append(input);
      dimensions.append(wrapper);
    }
    dialog.append(info, grid, dimensions);
    const footer = document.createElement("footer");
    button(footer, "取消", () => dialog?.close());
    button(footer, "创建表格", () => {
      dialog?.close();
      restore();
      if (hooks.newTable) {
        hooks.newTable(rows, columns);
        return;
      }
      if (cell?.isConnected) {
        const table = cell.closest("table");
        const paragraph = document.createElement("p");
        paragraph.setAttribute("data-block", "0");
        paragraph.append(document.createElement("br"));
        table?.after(paragraph);
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        saved = range;
      }
      hooks.insert(tableMarkdown(rows, columns));
    });
    dialog.append(footer);
    dialog.onclose = () => {
      dialog?.remove();
      dialog = undefined;
      restore();
    };
    theme(dialog);
    document.body.append(dialog);
    update();
    dialog.showModal();
  }
  function context(event: MouseEvent) {
    if (host.dataset.readonly === "true") return;
    const target = event.target as Element;
    if (target.closest(".diagram-viewport,.diagram-controls")) return;
    event.preventDefault();
    event.stopPropagation();
    remember();
    cell = target.closest<HTMLTableCellElement>("td,th");
    if (cell && (!saved || !saved.intersectsNode(cell))) {
      saved = document.createRange();
      saved.selectNodeContents(cell);
      saved.collapse(true);
    }
    closeMenu();
    menu = document.createElement("div");
    menu.className = "editor-context";
    menu.setAttribute("role", "menu");
    menu.style.left =
      Math.max(0, Math.min(event.clientX, window.innerWidth - 215)) + "px";
    menu.style.top =
      Math.max(
        0,
        Math.min(event.clientY, window.innerHeight - (cell ? 600 : 435)),
      ) + "px";
    button(menu, "撤销", () => {
      closeMenu();
      hooks.format("undo");
    });
    button(menu, "重做", () => {
      closeMenu();
      hooks.format("redo");
    });
    button(menu, "剪切", () => {
      closeMenu();
      document.execCommand("cut");
    });
    button(menu, "复制", () => {
      closeMenu();
      document.execCommand("copy");
    });
    button(menu, "粘贴", () => {
      const target = saved?.cloneRange();
      closeMenu();
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (target?.startContainer.isConnected) {
            saved = target;
            restore();
            hooks.insert(text);
          }
        })
        .catch((e) => hooks.error?.(`无法读取剪贴板：${String(e)}`));
    });
    button(menu, "全选", () => {
      closeMenu();
      if (hooks.selectAll) {
        hooks.selectAll();
        return;
      }
      const editable = host.querySelector<HTMLElement>(
        '.vditor-ir [contenteditable="true"],.vditor-sv',
      );
      if (editable) {
        const range = document.createRange();
        range.selectNodeContents(editable);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    });
    function submenu(parent: HTMLElement, label: string) {
      const group = document.createElement("div");
      group.className = "editor-submenu";
      const trigger = button(group, label + " ›", () =>
        group.classList.toggle("open"),
      );
      trigger.setAttribute("aria-haspopup", "menu");
      const items = document.createElement("div");
      items.className = "editor-submenu-items";
      items.setAttribute("role", "menu");
      group.append(items);
      parent.append(group);
      group.onmouseenter = () => {
        items.style.left = "100%";
        items.style.right = "auto";
        items.style.top = "0";
        const rect = items.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
          items.style.left = "auto";
          items.style.right = "100%";
        }
        if (rect.bottom > window.innerHeight - 8)
          items.style.top = `${Math.min(0, window.innerHeight - 8 - rect.bottom)}px`;
      };
      trigger.onkeydown = (event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          group.classList.add("open");
          items.querySelector("button")?.focus();
        }
      };
      return items;
    }
    const tableMenu = submenu(menu, "表格");
    // Right-clicking a cell means the table actions are what the user wants.
    if (cell) tableMenu.parentElement?.classList.add("open");
    button(tableMenu, "新增表格…", picker);
    if (cell) {
      for (const [label, action] of [
        ["内容左对齐", "left"],
        ["内容居中", "center"],
        ["内容右对齐", "right"],
      ] as const)
        button(tableMenu, label, () => tableAction(action));
      if (cell) {
        button(tableMenu, "删除行", () => tableAction("deleteRow"));
        button(tableMenu, "删除列", () => tableAction("deleteColumn"));
        const rows = submenu(tableMenu, "插入行");
        button(rows, "上方插入", () => tableAction("addRowBefore"));
        button(rows, "下方插入", () => tableAction("addRow"));
        const columns = submenu(tableMenu, "插入列");
        button(columns, "前方插入", () => tableAction("addColumnBefore"));
        button(columns, "后方插入", () => tableAction("addColumn"));
      }
      button(tableMenu, "删除表格", () => tableAction("deleteTable"));
      button(tableMenu, "复制表格", () => {
        const table = cell?.closest("table");
        if (!table) return;
        const lines = Array.from(table.rows).map(
          (row) =>
            "| " +
            Array.from(row.cells)
              .map((c) => (c.textContent ?? "").replaceAll("|", "\\|"))
              .join(" | ") +
            " |",
        );
        lines.splice(
          1,
          0,
          "| " +
            Array.from(table.rows[0].cells)
              .map((c) =>
                (c.style.textAlign || c.getAttribute("align")) === "center"
                  ? ":---:"
                  : (c.style.textAlign || c.getAttribute("align")) === "right"
                    ? "---:"
                    : ":---",
              )
              .join(" | ") +
            " |",
        );
        void navigator.clipboard
          .writeText(lines.join("\n"))
          .catch((e) => hooks.error?.(String(e)));
        closeMenu();
      });
      const hint = document.createElement("small");
      hint.textContent = "拖动表头移动列，拖动单元格左边缘移动行";
      tableMenu.append(hint);
    }
    const styleMenu = submenu(menu, "样式");
    for (const [label, name] of [
      ["有序列表", "ordered-list"],
      ["无序列表", "list"],
      ["待办事项", "check"],
    ] as const)
      button(styleMenu, label, () => {
        closeMenu();
        hooks.format(name);
      });
    const contentMenu = submenu(menu, "内容");
    button(contentMenu, "添加当前时间", () => {
      closeMenu();
      hooks.insert(new Date().toLocaleString("sv-SE"));
    });
    button(contentMenu, "添加当前时间戳", () => {
      closeMenu();
      hooks.insert(String(Math.floor(Date.now() / 1000)));
    });
    menu.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
        restore();
      }
    };
    theme(menu);
    document.body.append(menu);
  }
  const toolbar = document.createElement("div");
  toolbar.className = "table-actions";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "表格操作");
  toolbar.hidden = true;
  const icons = {
    deleteTable: "M4 4h16v16H4z M4 10h16 M10 4v16 M14 14l4 4m0-4-4 4",
    addRowBefore: "M4 11h16v9H4z M4 15h16 M12 2v6 M9 5h6",
    addRow: "M4 4h16v9H4z M4 8h16 M12 16v6 M9 19h6",
    addColumnBefore: "M11 4h9v16h-9z M15 4v16 M2 12h6 M5 9v6",
    addColumn: "M4 4h9v16H4z M8 4v16 M16 12h6 M19 9v6",
    deleteRow: "M4 4h16v16H4z M4 10h16 M4 14h16 M9 12h6",
    deleteColumn: "M4 4h16v16H4z M10 4v16 M14 4v16 M12 9v6",
  };
  for (const [action, label] of [
    ["deleteTable", "删除表格"],
    ["addRowBefore", "上方插入行"],
    ["addRow", "下方插入行"],
    ["addColumnBefore", "左侧插入列"],
    ["addColumn", "右侧插入列"],
    ["deleteRow", "删除行"],
    ["deleteColumn", "删除列"],
  ] as const) {
    const control = button(toolbar, label, () => {
      tableAction(action);
      refresh();
    });
    control.setAttribute("aria-label", label);
    control.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[action]}"/></svg>`;
    if (action === "addRow") control.title = label + " · Shift+Enter";
    if (action === "addColumn") control.title = label + " · Ctrl/⌘+Enter";
  }
  theme(toolbar);
  document.body.append(toolbar);
  function positionToolbar() {
    if (!cell?.isConnected || host.dataset.readonly === "true") {
      toolbar.hidden = true;
      return;
    }
    const rect = cell.closest("table")!.getBoundingClientRect();
    const bounds = host.getBoundingClientRect();
    toolbar.hidden = rect.bottom < bounds.top || rect.top > bounds.bottom;
    toolbar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 235))}px`;
    toolbar.style.top = `${Math.max(bounds.top, rect.top - 34)}px`;
  }
  function refresh() {
    if (dialog || menu) return;
    cell = selectedCell();
    remember();
    positionToolbar();
  }
  function tableClick(event: MouseEvent) {
    const target = (event.target as Element).closest<HTMLTableCellElement>(
      "td,th",
    );
    if (target) {
      cell = target;
      remember();
      positionToolbar();
    }
  }
  let drag: { cell: HTMLTableCellElement; axis: "row" | "column" } | null =
    null;
  const hint = document.createElement("div");
  hint.className = "table-drag-hint";
  function clearDrag() {
    host
      .querySelectorAll(".table-drag-source,.table-drop-target")
      .forEach((el) =>
        el.classList.remove("table-drag-source", "table-drop-target"),
      );
    hint.remove();
    drag = null;
  }
  function dragMove(event: PointerEvent) {
    if (!drag) return;
    const target = (event.target as Element).closest<HTMLTableCellElement>(
      "th,td",
    );
    if (!target || target.closest("table") !== drag.cell.closest("table"))
      return;
    const table = target.closest("table")!;
    const index = (c: HTMLTableCellElement) =>
      drag!.axis === "column"
        ? c.cellIndex
        : (c.parentElement as HTMLTableRowElement).rowIndex;
    table.querySelectorAll<HTMLTableCellElement>("th,td").forEach((c) => {
      c.classList.toggle("table-drag-source", index(c) === index(drag!.cell));
      c.classList.toggle(
        "table-drop-target",
        index(c) === index(target) && index(c) !== index(drag!.cell),
      );
    });
    hint.textContent = `移动第 ${index(drag.cell) + 1} ${drag.axis === "row" ? "行" : "列"} → ${index(target) + 1}`;
    hint.style.left = `${event.clientX + 12}px`;
    hint.style.top = `${event.clientY + 12}px`;
    theme(hint);
    document.body.append(hint);
  }
  function drop(event: PointerEvent) {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const target = (event.target as Element).closest<HTMLTableCellElement>(
      "th,td",
    );
    const table = drag.cell.closest("table")!;
    const old = Array.from(table.rows).map((row) =>
      Array.from(row.cells).map((c) => c.getBoundingClientRect()),
    );
    const axis = drag.axis;
    const from =
      axis === "row"
        ? (drag.cell.parentElement as HTMLTableRowElement).rowIndex
        : drag.cell.cellIndex;
    const to = target
      ? axis === "row"
        ? (target.parentElement as HTMLTableRowElement).rowIndex
        : target.cellIndex
      : from;
    const tableIndex = Array.from(host.querySelectorAll("table")).indexOf(
      table,
    );
    if (target && host.contains(target) && target.closest("table") === table) {
      if (hooks.reorder) hooks.reorder(drag.cell, target, axis);
      else if (reorderTable(drag.cell, target, axis)) {
        target
          .closest('[contenteditable="true"]')
          ?.dispatchEvent(new InputEvent("input", { bubbles: true }));
        hooks.changed();
      }
      if (
        from !== to &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        const order = Array.from(
          { length: axis === "row" ? old.length : old[0].length },
          (_, i) => i,
        );
        order.splice(to, 0, order.splice(from, 1)[0]);
        const next = host.querySelectorAll("table")[tableIndex];
        Array.from(next?.rows ?? []).forEach((row, r) =>
          Array.from(row.cells).forEach((c, col) => {
            const before =
              old[axis === "row" ? order[r] : r]?.[
                axis === "column" ? order[col] : col
              ];
            if (!before) return;
            const after = c.getBoundingClientRect();
            c.animate?.(
              [
                {
                  transform: `translate(${before.left - after.left}px,${before.top - after.top}px)`,
                },
                { transform: "translate(0,0)" },
              ],
              { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
            );
          }),
        );
      }
    }
    clearDrag();
    refresh();
  }
  function prepareDrag(event: PointerEvent) {
    if (host.dataset.readonly === "true" || event.button !== 0) return;
    const cell = (event.target as Element).closest<HTMLTableCellElement>(
      "th,td",
    );
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const row =
      event.altKey || (cell.cellIndex === 0 && event.clientX - rect.left < 10);
    const column =
      !row && (cell.tagName === "TH" || event.clientY - rect.top < 6);
    if (column || row) {
      if (row) event.preventDefault();
      drag = { cell, axis: row ? "row" : "column" };
    }
  }
  function cancelDrag(event: KeyboardEvent) {
    if (event.key === "Escape") {
      clearDrag();
      closeMenu();
    }
  }
  function key(event: KeyboardEvent) {
    if (host.dataset.readonly === "true") return;
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      (!event.shiftKey && !event.ctrlKey && !event.metaKey)
    )
      return;
    const target = selectedCell();
    if (!target || !host.contains(target) || !target.closest(".vditor-ir"))
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cell = target;
    remember();
    tableAction(event.ctrlKey || event.metaKey ? "addColumn" : "addRow");
  }
  function dismiss(event: PointerEvent) {
    const target = event.target as Element;
    if (!target.closest(".editor-context,.table-actions,.table-picker"))
      closeMenu();
  }
  const scroll = () => {
    closeMenu();
    positionToolbar();
  };
  host.addEventListener("pointerdown", prepareDrag);
  document.addEventListener("pointerup", drop);
  document.addEventListener("pointermove", dragMove);
  document.addEventListener("pointercancel", clearDrag);
  document.addEventListener("keydown", cancelDrag);
  host.addEventListener("click", tableClick);
  host.addEventListener("contextmenu", context);
  host.addEventListener("keydown", key, true);
  host.addEventListener("scroll", scroll, true);
  document.addEventListener("selectionchange", refresh);
  document.addEventListener("pointerdown", dismiss);
  return {
    destroy() {
      host.removeEventListener("pointerdown", prepareDrag);
      document.removeEventListener("pointerup", drop);
      document.removeEventListener("pointermove", dragMove);
      document.removeEventListener("pointercancel", clearDrag);
      document.removeEventListener("keydown", cancelDrag);
      host.removeEventListener("click", tableClick);
      clearDrag();
      toolbar.remove();
      host.removeEventListener("contextmenu", context);
      host.removeEventListener("keydown", key, true);
      host.removeEventListener("scroll", scroll, true);
      document.removeEventListener("selectionchange", refresh);
      document.removeEventListener("pointerdown", dismiss);
      closeMenu();
      dialog?.remove();
    },
  };
}
