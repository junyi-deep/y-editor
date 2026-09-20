import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createEditorAdapter } from "../src/editor/adapter/milkdown";
import type { EditorAdapter } from "../src/types/editor";
import { EditorView } from "@codemirror/view";

let adapter: EditorAdapter | undefined;
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  adapter?.destroy();
  adapter = undefined;
  document.body.replaceChildren();
});
async function open(content: string) {
  const host = document.createElement("div");
  document.body.append(host);
  const change = vi.fn();
  adapter = createEditorAdapter(host, change, "light");
  await adapter.open(content);
  return { host, change, editor: adapter };
}
describe("Milkdown real editor integration", () => {
  it("selects rectangular cell ranges by dragging and aligns the selected columns with undo", async () => {
    const input =
      "| A | B | C |\n| --- | --- | --- |\n| 一 | 二 | 三 |\n| 四 | 五 | 六 |\n";
    const { editor, host } = await open(input);
    const cells = host.querySelectorAll("td");
    cells[0].dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        detail: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(host.querySelectorAll(".selectedCell")).toHaveLength(1);
    cells[4].dispatchEvent(
      new MouseEvent("mousemove", {
        buttons: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(host.querySelectorAll(".selectedCell")).toHaveLength(4);
    expect(editor.getMarkdown()).toBe(input);
    cells[4].dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    const center = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".editor-context button"),
    ).find((button) => button.textContent === "内容居中")!;
    center.click();
    expect(
      Array.from(host.querySelectorAll<HTMLElement>("td,th")).filter(
        (cell) => cell.style.textAlign === "center",
      ),
    ).toHaveLength(6);
    expect(editor.getMarkdown().match(/:-+:/g)).toHaveLength(2);
    editor.format("undo");
    expect(editor.getMarkdown()).toBe(input);
  });
  it("retains extended Markdown after real edits and exports safe math/HTML", async () => {
    const input =
      "---\ntitle: 示例\n---\n\n正文 $x^2$\n\n$$\na+b\n$$\n\n注释[^1]\n\n[^1]: 脚注\n\n<div>原始 HTML</div>\n";
    const { editor } = await open(input);
    editor.toggleSourceMode();
    editor.insertText("新增段落\n\n");
    expect(editor.getHTML()).toContain("新增段落");
    editor.toggleSourceMode();
    // Force a ProseMirror serialization after parsing all extended syntax.
    editor.insertText("真实修改");
    const result = editor.getMarkdown();
    for (const text of [
      "title: 示例",
      "$x^2$",
      "a+b",
      "[^1]",
      "脚注",
      "<div>原始 HTML</div>",
    ])
      expect(result).toContain(text);
    expect(editor.getHTML()).toContain("<math");
    editor.setMarkdown(
      '<img src="x" onerror="alert(1)"><script>alert(2)</script>',
    );
    expect(editor.getHTML()).not.toMatch(/onerror|<script/);
  });
  it("edits code through transactions, preserving plain source and undo", async () => {
    const { editor, host } = await open("```typescript\nconst value = 1;\n```");
    const cm = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    cm.focus();
    cm.dispatch({
      changes: { from: cm.state.doc.length, insert: "\nconsole.log(value);" },
    });
    expect(editor.getMarkdown()).toContain("console.log(value);");
    expect(editor.getMarkdown()).not.toContain("<span");
    editor.format("undo");
    expect(editor.getMarkdown()).not.toContain("console.log");
    cm.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(editor.getSelection().text).toBe("const");
    editor.replaceSelection("let");
    expect(editor.getMarkdown()).toContain("let value");
  });
  it("toggles task checkboxes with undo and respects read-only", async () => {
    const input = "- [ ] 待办\n";
    const { editor, host } = await open(input);
    const checkbox = host.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    )!;
    checkbox.click();
    expect(editor.getMarkdown()).toContain("[x]");
    editor.format("undo");
    expect(editor.getMarkdown()).toBe(input);
    host.dataset.readonly = "true";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkbox.disabled).toBe(true);
  });
  it("handles unmount during asynchronous initialization", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    adapter = createEditorAdapter(host, vi.fn(), "light");
    const pending = adapter.open("");
    adapter.destroy();
    await expect(pending).rejects.toThrow("已关闭");
  });
  it("preserves exact source, round trips frontmatter/math/GFM/HTML and undo", async () => {
    const input =
      "---\ntitle: 示例\n---\n\n# 标题\n\n**粗体**、$x^2$\n\n| A | B |\n| --- | --- |\n| 甲 | 乙 |\n\n[^1]: 脚注\n\n注释[^1]\n\n<div>原始 HTML</div>\n";
    const { editor, host } = await open(input);
    expect(editor.getMarkdown()).toBe(input);
    expect(host.querySelector("table")).not.toBeNull();
    expect(host.querySelector(".katex")).not.toBeNull();
    editor.setMarkdown("原文", true);
    editor.insertText("修改");
    expect(editor.getMarkdown()).toContain("修改");
    editor.format("undo");
    expect(editor.getMarkdown()).toBe("原文");
    editor.format("redo");
    expect(editor.getMarkdown()).toContain("修改");
  });
  it("switches source modes without making a clean document dirty", async () => {
    const { editor, change } = await open("# 原标题");
    editor.toggleSourceMode();
    expect(editor.getMarkdown()).toBe("# 原标题");
    editor.toggleSourceMode();
    expect(editor.getMarkdown()).toBe("# 原标题");
    expect(change).not.toHaveBeenCalled();
    editor.toggleSourceMode();
    editor.insertText("新内容");
    expect(editor.getMarkdown()).toContain("新内容");
    editor.toggleSourceMode();
    expect(editor.getMarkdown()).toContain("新内容");
  });
  it("keeps a diagram source intact and source editing updates Markdown", async () => {
    const input = "```mermaid\nflowchart LR\n A-->B\n```";
    const { editor, host } = await open(input);
    expect(host.querySelector(".mermaid-render")).not.toBeNull();
    expect(editor.getMarkdown()).toBe(input);
    host
      .querySelector(".mermaid-render")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect((host.querySelector(".code-editor") as HTMLElement).hidden).toBe(
      false,
    );
    expect(editor.getMarkdown()).toBe(input);
  });
  it("leaves diagram editing on an outside press or Escape, not on an inner press", async () => {
    const input = "```mermaid\nflowchart LR\n A-->B\n```";
    const { editor, host } = await open(input);
    const diagram = host.querySelector(".mermaid-render")!;
    const source = host.querySelector(".code-editor") as HTMLElement;
    diagram.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(source.hidden).toBe(false);
    // A press inside the block stays in the editor.
    host
      .querySelector(".cm-content")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(source.hidden).toBe(false);
    // A press anywhere else leaves it and renders the diagram again.
    host
      .querySelector(".milkdown-document")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(source.hidden).toBe(true);
    expect(diagram.hidden).toBe(false);
    // Escape is the keyboard exit, since the 完成编辑 button is gone.
    diagram.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(source.hidden).toBe(false);
    host
      .querySelector(".cm-content")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(source.hidden).toBe(true);
    expect(editor.getMarkdown()).toBe(input);
  });
  it("drops the code-editor focus pointer when a diagram editor closes", async () => {
    const fence = "```mermaid\nflowchart LR\n A-->B\n```";
    const { editor, host } = await open(`前言\n\n${fence}\n`);
    const diagram = host.querySelector(".mermaid-render")!;
    diagram.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    // jsdom fires no focus event from cm.focus(), so set the pointer the way
    // a real focus would.
    const cm = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    cm.contentDOM.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    host
      .querySelector(".milkdown-document")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect((host.querySelector(".code-editor") as HTMLElement).hidden).toBe(
      true,
    );
    // A later insert must reach the document, not the hidden diagram fence.
    editor.insertText("追加");
    expect(editor.getMarkdown()).toContain(fence);
    expect(editor.getMarkdown()).toContain("追加");
  });
  it("highlights mermaid source in the diagram editor", async () => {
    const { host } = await open("```mermaid\nflowchart LR\n A-->B\n```");
    await vi.waitFor(() =>
      expect(
        host.querySelectorAll(".code-editor .cm-line span").length,
      ).toBeGreaterThan(0),
    );
  });
  it("blocks programmatic editing in read-only mode", async () => {
    const { editor, host } = await open("原文");
    host.dataset.readonly = "true";
    editor.insertText("不应写入");
    editor.format("bold");
    expect(editor.getMarkdown()).toBe("原文");
    editor.toggleSourceMode();
    editor.insertText("不应写入");
    expect(editor.getMarkdown()).toBe("原文");
  });
  it("inserts rows using keyboard and includes the change in undo history", async () => {
    const input = "| A | B |\n| --- | --- |\n| 甲 | 乙 |\n";
    const { editor, host } = await open(input);
    const cell = host.querySelector("td")!;
    const range = document.createRange();
    range.selectNodeContents(cell.querySelector("p")!);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    cell.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(host.querySelectorAll("tr")).toHaveLength(3);
    // An empty cell must serialize as an empty cell, never as literal <br />.
    expect(editor.getMarkdown()).not.toContain("<br");
    editor.format("undo");
    expect(host.querySelectorAll("tr")).toHaveLength(2);
    expect(editor.getMarkdown()).toBe(input);
  });
  it("treats an edge press released on its own column as a click, not a reorder", async () => {
    // Committing a reorder here rebuilt the whole table: the cell selection was
    // replaced by a text selection and an undo step was burned.
    const input = "| A | B |\n| --- | --- |\n| 甲 | 乙 |\n";
    const { editor, host } = await open(input);
    const header = host.querySelectorAll("th")[1];
    header.dispatchEvent(
      new MouseEvent("pointerdown", {
        button: 0,
        clientX: 50,
        clientY: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    header.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        detail: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(host.querySelectorAll(".selectedCell")).toHaveLength(1);
    header.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
    );
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(host.querySelectorAll(".selectedCell")).toHaveLength(1);
    expect(editor.getMarkdown()).toBe(input);
    editor.format("undo");
    expect(editor.getMarkdown()).toBe(input);
  });
  it("reorders columns when a header is dragged onto another header", async () => {
    const input = "| A | B |\n| --- | --- |\n| 甲 | 乙 |\n";
    const { editor, host } = await open(input);
    const headers = host.querySelectorAll("th");
    // Mid-header, outside the old 6px border band: the header is the handle.
    headers[1].dispatchEvent(
      new MouseEvent("pointerdown", {
        button: 0,
        clientX: 50,
        clientY: 20,
        bubbles: true,
        cancelable: true,
      }),
    );
    headers[0].dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.getMarkdown()).toMatch(/^\| B \| A \|/);
    editor.format("undo");
    expect(editor.getMarkdown()).toBe(input);
  });
  it("keeps a multi-cell selection when the context menu opens on it", async () => {
    const input =
      "| A | B | C |\n| --- | --- | --- |\n| 一 | 二 | 三 |\n| 四 | 五 | 六 |\n";
    const { editor, host } = await open(input);
    const cells = host.querySelectorAll("td");
    cells[0].dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        detail: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    cells[4].dispatchEvent(
      new MouseEvent("mousemove", { buttons: 1, bubbles: true, cancelable: true }),
    );
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(host.querySelectorAll(".selectedCell")).toHaveLength(4);
    const press = new MouseEvent("mousedown", {
      button: 2,
      bubbles: true,
      cancelable: true,
    });
    cells[0].dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    cells[0].dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(host.querySelectorAll(".selectedCell")).toHaveLength(4);
    editor.format("undo");
    expect(editor.getMarkdown()).toBe(input);
  });
  it("opens the table submenu already expanded on right-click", async () => {
    const input = "| A | B |\n| --- | --- |\n| 甲 | 乙 |\n";
    const { host } = await open(input);
    host
      .querySelector("td")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const expanded = document.querySelector(".editor-submenu.open");
    expect(expanded).not.toBeNull();
    expect(expanded!.textContent).toContain("内容居中");
  });
  it("still reorders columns when the drag ends on another column", async () => {
    const input = "| A | B |\n| --- | --- |\n| 甲 | 乙 |\n";
    const { editor, host } = await open(input);
    const headers = host.querySelectorAll("th");
    headers[1].dispatchEvent(
      new MouseEvent("pointerdown", {
        button: 0,
        clientX: 50,
        clientY: 2,
        bubbles: true,
      }),
    );
    headers[1].dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        detail: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    headers[0].dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(editor.getMarkdown()).toMatch(/^\| B \| A \|/);
    editor.format("undo");
    expect(editor.getMarkdown()).toBe(input);
  });
});
