import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  serializerCtx,
  parserCtx,
} from "@milkdown/kit/core";
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  turnIntoTextCommand,
  wrapInHeadingCommand,
  toggleInlineCodeCommand,
  strongKeymap,
  emphasisKeymap,
  inlineCodeKeymap,
  headingKeymap,
  paragraphKeymap,
  bulletListKeymap,
  orderedListKeymap,
  blockquoteKeymap,
  codeBlockKeymap,
  remarkPreserveEmptyLinePlugin,
} from "@milkdown/kit/preset/commonmark";
import {
  gfm,
  toggleStrikethroughCommand,
  strikethroughKeymap,
} from "@milkdown/kit/preset/gfm";
import {
  history,
  historyKeymap as proseHistoryKeymap,
} from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import {
  $prose,
  callCommand,
  getMarkdown,
  insert,
  replaceAll,
} from "@milkdown/kit/utils";
import { Plugin, TextSelection, AllSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { undo, redo } from "@milkdown/kit/prose/history";
import {
  DOMSerializer,
  type Node as ProseNode,
} from "@milkdown/kit/prose/model";
import type {
  EditorView as ProseView,
  NodeView,
} from "@milkdown/kit/prose/view";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import {
  defaultKeymap,
  history as codeHistory,
  undo as codeUndo,
  redo as codeRedo,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import katex from "katex";
import DOMPurify from "dompurify";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import "katex/dist/katex.min.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import type { Appearance, EditorAdapter } from "../../types/editor";
import { createMermaidRenderer } from "./mermaid";
import { createEditorInteractions } from "./interactions";
import { tableMarkdown } from "./tables";
import {
  changeTable,
  moveTable,
  createTableSelection,
} from "./milkdown-tables";
import {
  mathRemark,
  frontmatterRemark,
  mathInline,
  mathBlock,
  frontmatter,
  inlineMathInput,
  blockMathInput,
} from "./milkdown-extensions";

// The host command registry owns remapping. Keep structural Enter/Tab/list keys.
const hostKeymaps = new Set<unknown>(
  [
    strongKeymap,
    emphasisKeymap,
    inlineCodeKeymap,
    headingKeymap,
    paragraphKeymap,
    bulletListKeymap,
    orderedListKeymap,
    blockquoteKeymap,
    codeBlockKeymap,
    strikethroughKeymap,
    proseHistoryKeymap,
  ].map((keymap) => keymap.shortcuts),
);

export interface EditorHooks {
  save?: () => Promise<void>;
  reference?: (text: string, label: string) => void;
  immersive?: (active: boolean) => void;
  renderLargeDiagrams?: () => boolean;
  image?: (file: File, pasted: boolean) => Promise<string>;
  resolveImage?: (source: string) => Promise<string>;
  link?: (url: string) => void;
  selection?: (text: string, rect?: DOMRect) => void;
  error?: (message: string) => void;
}

export function createEditorAdapter(
  element: HTMLElement,
  onChange: (markdown: string) => void,
  appearance: Appearance,
  hooks: EditorHooks = {},
): EditorAdapter {
  let editor: Editor | undefined,
    ready = false,
    disposed = false,
    original = "",
    baseline = "",
    pendingTheme = appearance;
  let sourceMode = false,
    suppress = false,
    code: EditorView | undefined;
  let activeCode: EditorView | undefined;
  let interactions: ReturnType<typeof createEditorInteractions> | undefined;
  let disposeTableSelection: (() => void) | undefined;
  const readonly = new Compartment();
  const preview = document.createElement("div");
  // Compatibility classes retain user-imported Typora/Vditor CSS; no Vditor runtime.
  preview.className = "milkdown-preview vditor-ir";
  const source = document.createElement("div");
  source.className = "milkdown-source";
  source.hidden = true;
  element.append(preview, source);
  const nodes = new Map<
    HTMLElement,
    {
      source: () => string;
      edit: () => void;
      editing: () => boolean;
      update: (value: string) => void;
      pos: () => number | undefined;
    }
  >();
  const isReadonly = () => element.dataset.readonly === "true";
  const refreshCodeViews = new Set<() => void>();
  const diagrams = createMermaidRenderer(
    () => pendingTheme === "dark",
    hooks.renderLargeDiagrams,
    {
      source: (host) => nodes.get(host)?.source() ?? "",
      edit: (host) => nodes.get(host)?.edit(),
      editing: (host) => nodes.get(host)?.editing() ?? false,
      update: (host, value) => nodes.get(host)?.update(value),
      readonly: isReadonly,
      immersive: hooks.immersive,
      reference: (value, host) => {
        const pos = nodes.get(host)?.pos();
        let line = 1;
        if (pos !== undefined && editor)
          editor.action((ctx) => {
            const doc = view().state.doc;
            let before = "";
            doc.forEach((node, offset) => {
              if (offset < pos)
                before +=
                  ctx.get(serializerCtx)(doc.type.create(null, node)) + "\n";
            });
            line = before.split("\n").length;
          });
        hooks.reference?.(
          value,
          `Line${line}~${line + value.split("\n").length + 1}`,
        );
      },
    },
  );
  function view(): ProseView {
    if (!editor || !ready || disposed) throw new Error("编辑器尚未就绪");
    return editor.action((ctx) => ctx.get(editorViewCtx));
  }
  function value() {
    const serialized = editor!.action(getMarkdown());
    return serialized === baseline ? original : serialized;
  }
  function changed() {
    if (ready && !suppress && !disposed) onChange(value());
  }
  function updateCode(
    node: ProseNode,
    prose: ProseView,
    getPos: () => number | undefined,
    text: string,
  ) {
    const pos = getPos();
    if (pos === undefined || isReadonly() || node.textContent === text) return;
    prose.dispatch(
      prose.state.tr.replaceWith(
        pos + 1,
        pos + 1 + node.content.size,
        text ? prose.state.schema.text(text) : [],
      ),
    );
  }
  function codeView(
    initial: ProseNode,
    prose: ProseView,
    getPos: () => number | undefined,
  ): NodeView {
    let node = initial;
    const dom = document.createElement("div");
    dom.className = "y-code-block";
    dom.contentEditable = "false";
    const language = document.createElement("input");
    language.className = "code-language";
    language.value = node.attrs.language || "";
    language.placeholder = "代码语言";
    language.setAttribute("aria-label", "代码语言");
    language.onchange = () => {
      const pos = getPos();
      if (pos !== undefined && !isReadonly())
        prose.dispatch(
          prose.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            language: language.value,
          }),
        );
    };
    const content = document.createElement("div");
    content.className = "code-editor";
    const diagram = document.createElement("div");
    diagram.className = "mermaid-render";
    dom.append(language, content, diagram);
    const config = new Compartment(),
      languageConfig = new Compartment();
    let editing = false,
      syncing = false;
    const cm = new EditorView({
      parent: content,
      state: EditorState.create({
        doc: node.textContent,
        extensions: [
          lineNumbers(),
          closeBrackets(),
          highlightActiveLine(),
          syntaxHighlighting(defaultHighlightStyle),
          config.of(EditorState.readOnly.of(isReadonly())),
          languageConfig.of([]),
          keymap.of([
            ...closeBracketsKeymap,
            {
              key: "Mod-Enter",
              run: () => {
                const pos = getPos();
                if (pos === undefined || isReadonly()) return false;
                const end = pos + node.nodeSize;
                const tr = prose.state.tr.insert(
                  end,
                  prose.state.schema.nodes.paragraph.create(),
                );
                prose.dispatch(
                  tr.setSelection(TextSelection.create(tr.doc, end + 1)),
                );
                activeCode = undefined;
                exit();
                prose.focus();
                return true;
              },
            },
            {
              // Escape leaves the diagram editor. Registered before
              // defaultKeymap, whose own Escape binding only simplifies a
              // selection and is kept for every other code block.
              key: "Escape",
              run: () => {
                if (cm.composing || !editing) return false;
                activeCode = undefined;
                exit();
                prose.focus();
                return true;
              },
            },
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncing)
              updateCode(node, prose, getPos, update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            focus: () => {
              activeCode = cm;
            },
          }),
        ],
      }),
    });
    let languageGeneration = 0;
    function setLanguage() {
      const generation = ++languageGeneration;
      // @codemirror/language-data ships no Mermaid entry, and the package that
      // does bundles every diagram parser into one module, so it is imported
      // only when a diagram is present rather than on every document.
      if (String(node.attrs.language).toLowerCase() === "mermaid") {
        void import("codemirror-lang-mermaid")
          .then(({ mermaid }) => {
            if (generation === languageGeneration && !disposed)
              cm.dispatch({ effects: languageConfig.reconfigure(mermaid()) });
          })
          .catch(() => {
            if (generation === languageGeneration && !disposed)
              cm.dispatch({ effects: languageConfig.reconfigure([]) });
          });
        return;
      }
      const description = languages.find(
        (l) =>
          l.name.toLowerCase() === String(node.attrs.language).toLowerCase() ||
          l.alias.includes(node.attrs.language),
      );
      if (description)
        void description.load().then((support) => {
          if (generation === languageGeneration && !disposed)
            cm.dispatch({ effects: languageConfig.reconfigure(support) });
        });
      else cm.dispatch({ effects: languageConfig.reconfigure([]) });
    }
    function refresh() {
      const mermaid = node.attrs.language === "mermaid";
      diagram.hidden = !mermaid || editing;
      if (!mermaid) diagrams.forget(diagram);
      content.hidden = mermaid && !editing;
      language.hidden = mermaid && !editing;
      language.readOnly = isReadonly();
      cm.dispatch({
        effects: config.reconfigure(EditorState.readOnly.of(isReadonly())),
      });
      if (mermaid && !editing) diagrams.render(diagram);
    }
    function exit() {
      if (!editing) return;
      editing = false;
      // The focused-editor pointer must drop with the editor, or a later
      // toolbar/palette insert would write into this hidden diagram fence.
      if (activeCode === cm) activeCode = undefined;
      document.removeEventListener("pointerdown", outside, true);
      refresh();
    }
    /**
     * Leaving the source editor means pressing anywhere outside it. Capture
     * phase is required: the render host isolates pointer events by stopping
     * propagation, so a bubble listener would never see a press on a chart.
     */
    function outside(event: PointerEvent) {
      if (!editing) return;
      const target = event.target as Node | null;
      // Containment is the whole block, never `diagram` — that is hidden while
      // editing, so a press on it would always read as "outside".
      if (!target || !dom.contains(target)) exit();
    }
    nodes.set(diagram, {
      source: () => node.textContent,
      pos: getPos,
      editing: () => editing,
      edit: () => {
        if (isReadonly()) return;
        editing = true;
        document.addEventListener("pointerdown", outside, true);
        refresh();
        cm.focus();
      },
      update: (text) => updateCode(node, prose, getPos, text),
    });
    setLanguage();
    refreshCodeViews.add(refresh);
    queueMicrotask(refresh);
    return {
      dom,
      stopEvent: () => true,
      ignoreMutation: () => true,
      update(next) {
        if (next.type !== node.type) return false;
        const oldLanguage = node.attrs.language;
        node = next;
        language.value = node.attrs.language || "";
        if (cm.state.doc.toString() !== node.textContent) {
          syncing = true;
          cm.dispatch({
            changes: {
              from: 0,
              to: cm.state.doc.length,
              insert: node.textContent,
            },
          });
          syncing = false;
        }
        if (oldLanguage !== node.attrs.language) setLanguage();
        refresh();
        return true;
      },
      destroy() {
        if (activeCode === cm) activeCode = undefined;
        document.removeEventListener("pointerdown", outside, true);
        refreshCodeViews.delete(refresh);
        languageGeneration++;
        nodes.delete(diagram);
        diagrams.forget(diagram);
        cm.destroy();
      },
    };
  }
  function mathView(
    initial: ProseNode,
    prose: ProseView,
    getPos: () => number | undefined,
  ): NodeView {
    let node = initial;
    const dom = document.createElement(node.isInline ? "span" : "div");
    dom.className = "y-math";
    dom.contentEditable = "false";
    const draw = () => {
      if (!node.attrs.value) {
        dom.textContent = "双击编辑公式";
        return;
      }
      try {
        katex.render(node.attrs.value, dom, {
          displayMode: !node.isInline,
          throwOnError: false,
          trust: false,
        });
      } catch {
        dom.textContent = node.attrs.value;
      }
    };
    dom.ondblclick = () => {
      if (isReadonly()) return;
      const input = document.createElement("textarea");
      input.value = node.attrs.value;
      input.setAttribute("aria-label", "公式源码");
      dom.replaceChildren(input);
      input.focus();
      input.onblur = () => {
        const pos = getPos();
        if (pos !== undefined && !isReadonly())
          prose.dispatch(
            prose.state.tr.setNodeMarkup(pos, undefined, {
              value: input.value,
            }),
          );
        draw();
      };
    };
    draw();
    return {
      dom,
      stopEvent: () => true,
      ignoreMutation: () => true,
      update(next) {
        if (next.type !== node.type) return false;
        node = next;
        draw();
        return true;
      },
    };
  }
  const integration = $prose(
    () =>
      new Plugin({
        props: {
          decorations(state) {
            const {$from} = state.selection;
            return $from.depth ? DecorationSet.create(state.doc, [Decoration.node($from.before(1), $from.after(1), {class:'y-current-block'})]) : DecorationSet.empty;
          },
          nodeViews: {
            html: (node) => {
              const dom = document.createElement("span");
              dom.className = "y-html-preview";
              dom.innerHTML = DOMPurify.sanitize(node.attrs.value, {
                FORBID_TAGS: ["style", "iframe", "object", "script"],
              });
              return { dom, ignoreMutation: () => true };
            },
            list_item: (initial, prose, getPos) => {
              let node = initial;
              const dom = document.createElement("li"),
                contentDOM = document.createElement("div"),
                checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.contentEditable = "false";
              checkbox.setAttribute("aria-label", "完成待办事项");
              const update = () => {
                const task = node.attrs.checked !== null;
                checkbox.hidden = !task;
                checkbox.checked = !!node.attrs.checked;
                checkbox.disabled = isReadonly();
                dom.classList.toggle("task-list-item", task);
              };
              checkbox.onchange = () => {
                const pos = getPos();
                if (pos !== undefined && !isReadonly())
                  prose.dispatch(
                    prose.state.tr.setNodeMarkup(pos, undefined, {
                      ...node.attrs,
                      checked: checkbox.checked,
                    }),
                  );
              };
              dom.append(checkbox, contentDOM);
              update();
              refreshCodeViews.add(update);
              return {
                dom,
                contentDOM,
                stopEvent: (event) => event.target === checkbox,
                update(next) {
                  if (next.type !== node.type) return false;
                  node = next;
                  update();
                  return true;
                },
                destroy() {
                  refreshCodeViews.delete(update);
                },
              };
            },
            code_block: codeView,
            math_inline: mathView,
            math_block: mathView,
            image: (node) => {
              const dom = document.createElement("img");
              dom.alt = node.attrs.alt ?? "";
              dom.title = node.attrs.title ?? "";
              dom.setAttribute("data-source", node.attrs.src);
              dom.src = node.attrs.src;
              if (
                hooks.resolveImage &&
                !/^(https?:|data:|blob:)/i.test(node.attrs.src)
              )
                void hooks
                  .resolveImage(node.attrs.src)
                  .then((url) => {
                    dom.src = url;
                  })
                  .catch(() => {
                    dom.title = `无法加载图片：${node.attrs.src}`;
                  });
              return { dom, ignoreMutation: () => true };
            },
          },
          handleClick: (_view, _pos, event) => {
            const a = (event.target as Element).closest("a");
            if (a) {
              event.preventDefault();
              hooks.link?.(a.getAttribute("href") ?? "");
              return true;
            }
            return false;
          },
        },
      }),
  );
  async function paste(event: ClipboardEvent | DragEvent) {
    if (isReadonly() || !hooks.image) return;
    const data =
      "clipboardData" in event ? event.clipboardData : event.dataTransfer;
    const file = data?.files[0];
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const path = await hooks.image(file, event.type === "paste");
      if (!disposed)
        adapter.insertText(
          `${file.type.startsWith("image/") ? "!" : ""}[${file.name.replace(/[[\]]/g, "")}](${encodeURI(path).replaceAll("(", "%28").replaceAll(")", "%29")})`,
        );
    } catch (e) {
      hooks.error?.(String(e));
    }
  }
  function selection() {
    if (!ready || disposed || sourceMode) return;
    const text = adapter.getSelection().text;
    const range = window.getSelection();
    hooks.selection?.(
      text,
      text && range?.rangeCount
        ? range.getRangeAt(0).getBoundingClientRect()
        : undefined,
    );
    if (element.classList.contains("y-typewriter"))
      preview.querySelector('.y-current-block')?.scrollIntoView?.({ block: "center" });
  }
  const readObserver = new MutationObserver(() => {
    if (!ready || disposed) return;
    view().setProps({ editable: () => !isReadonly() });
    code?.dispatch({
      effects: readonly.reconfigure(EditorState.readOnly.of(isReadonly())),
    });
    refreshCodeViews.forEach((refresh) => refresh());
  });
  function focusIn(event: FocusEvent) {
    if (!(event.target as Element).closest(".cm-editor"))
      activeCode = undefined;
  }
  const adapter: EditorAdapter = {
    async open(content) {
      if (editor || disposed) throw new Error("编辑器不可重复初始化");
      original = content;
      editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, preview);
          ctx.set(defaultValueCtx, content);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            attributes: {
              class: "milkdown-document vditor-reset",
              role: "textbox",
              "aria-label": "Markdown 正文",
              "aria-multiline": "true",
            },
            editable: () => !isReadonly(),
          }));
          ctx.get(listenerCtx).updated(() => changed());
        })
        .use(
          commonmark.filter(
            (plugin) =>
              !hostKeymaps.has(plugin) &&
              // Both halves of the preserve-empty-line remark must go: the
              // options slice is what makes the serializer emit `<br />` for an
              // empty paragraph, and the plugin is what then strips genuine
              // `<br />` back out of parsed source.
              plugin !== remarkPreserveEmptyLinePlugin.plugin &&
              plugin !== remarkPreserveEmptyLinePlugin.options,
          ),
        )
        .use(gfm.filter((plugin) => !hostKeymaps.has(plugin)))
        .use(history.filter((plugin) => !hostKeymaps.has(plugin)))
        .use(clipboard)
        .use(listener)
        .use(mathRemark)
        .use(frontmatterRemark)
        .use(mathInline)
        .use(mathBlock)
        .use(frontmatter)
        .use(inlineMathInput)
        .use(blockMathInput)
        .use(integration);
      await editor.create();
      if (disposed) {
        await editor.destroy();
        throw new Error("编辑器已关闭");
      }
      ready = true;
      baseline = editor.action(getMarkdown());
      disposeTableSelection = createTableSelection(view(), preview);
      interactions = createEditorInteractions(element, {
        restore: adapter.focus,
        selectAll: () => {
          const cm = sourceMode ? code : activeCode;
          if (cm) {
            cm.dispatch({
              selection: { anchor: 0, head: cm.state.doc.length },
            });
            cm.focus();
          } else {
            const prose = view();
            prose.dispatch(
              prose.state.tr.setSelection(new AllSelection(prose.state.doc)),
            );
            prose.focus();
          }
        },
        format: adapter.format,
        insert: adapter.insertText,
        changed,
        error: hooks.error,
        table: (action, cell, range) =>
          changeTable(view(), action, cell, range),
        reorder: (from, to, axis) => moveTable(view(), from, to, axis),
        newTable: (rows, columns) => {
          const prose = view();
          let depth = prose.state.selection.$from.depth;
          while (
            depth > 0 &&
            prose.state.selection.$from.node(depth).type.name !== "table"
          )
            depth--;
          if (depth > 0) {
            const pos = prose.state.selection.$from.after(depth);
            const tr = prose.state.tr.insert(
              pos,
              prose.state.schema.nodes.paragraph.create(),
            );
            prose.dispatch(
              tr.setSelection(TextSelection.create(tr.doc, pos + 1)),
            );
          }
          adapter.insertText(tableMarkdown(Math.max(2, rows), columns));
        },
      });
      element.addEventListener("paste", paste, true);
      element.addEventListener("drop", paste, true);
      document.addEventListener("selectionchange", selection);
      preview.addEventListener("focusin", focusIn);
      readObserver.observe(element, {
        attributes: true,
        attributeFilter: ["data-readonly"],
      });
      adapter.setTheme(pendingTheme);
    },
    getMarkdown() {
      view();
      return sourceMode && code ? code.state.doc.toString() : value();
    },
    setMarkdown(content, clearHistory = false) {
      view();
      suppress = true;
      original = content;
      editor!.action(replaceAll(content, clearHistory));
      baseline = editor!.action(getMarkdown());
      if (code && code.state.doc.toString() !== content)
        code.dispatch({
          changes: { from: 0, to: code.state.doc.length, insert: content },
        });
      suppress = false;
    },
    getHTML() {
      const prose = view();
      const dom = document.createElement("div");
      const documentNode =
        sourceMode && code
          ? editor!.action((ctx) =>
              ctx.get(parserCtx)(code!.state.doc.toString()),
            )
          : prose.state.doc;
      if (!documentNode) throw new Error("Markdown 解析失败");
      const base = DOMSerializer.fromSchema(prose.state.schema);
      const renderMath = (node: ProseNode) => {
        const output = document.createElement(node.isInline ? "span" : "div");
        // Native MathML keeps exported HTML self-contained without font/CDN assets.
        katex.render(node.attrs.value, output, {
          displayMode: !node.isInline,
          throwOnError: false,
          trust: false,
          output: "mathml",
        });
        return output;
      };
      const serializer = new DOMSerializer(
        {
          ...base.nodes,
          math_inline: renderMath,
          math_block: renderMath,
          html: (node) => {
            const output = document.createElement("span");
            output.innerHTML = DOMPurify.sanitize(node.attrs.value, {
              FORBID_TAGS: ["style", "iframe", "object", "script"],
            });
            return output;
          },
        },
        base.marks,
      );
      dom.append(serializer.serializeFragment(documentNode.content));
      return dom.innerHTML;
    },
    refreshDiagrams() {
      diagrams.refresh();
    },
    async save() {
      await hooks.save?.();
    },
    insertText(text) {
      if (isReadonly()) return;
      const cm = sourceMode ? code : activeCode;
      if (cm) {
        cm.dispatch(cm.state.replaceSelection(text));
        cm.focus();
      } else {
        editor!.action(insert(text, true));
        view().focus();
      }
    },
    replaceSelection(text) {
      adapter.insertText(text);
    },
    getSelection() {
      const cm = sourceMode ? code : activeCode;
      if (cm) {
        const s = cm.state.selection.main;
        return { text: cm.state.sliceDoc(s.from, s.to) };
      }
      const prose = view(),
        s = prose.state.selection;
      return { text: prose.state.doc.textBetween(s.from, s.to, "\n") };
    },
    focus() {
      if (sourceMode) code?.focus();
      else if (activeCode) activeCode.focus();
      else view().focus();
    },
    setTheme(theme) {
      pendingTheme = theme;
      element.dataset.appearance = theme;
      diagrams.refresh();
    },
    setFontSize(size) {
      element.style.setProperty("--y-font-size", `${size}px`);
    },
    toggleSourceMode() {
      view();
      if (!sourceMode) {
        const content = value();
        code?.destroy();
        code = new EditorView({
          parent: source,
          state: EditorState.create({
            doc: content,
            extensions: [
              lineNumbers(),
              markdown({ codeLanguages: languages }),
              syntaxHighlighting(defaultHighlightStyle),
              codeHistory(),
              keymap.of(defaultKeymap),
              readonly.of(EditorState.readOnly.of(isReadonly())),
              EditorView.lineWrapping,
              EditorView.updateListener.of((update) => {
                if (update.docChanged && !suppress)
                  onChange(update.state.doc.toString());
              }),
            ],
          }),
        });
      } else if (code && code.state.doc.toString() !== value())
        adapter.setMarkdown(code.state.doc.toString());
      sourceMode = !sourceMode;
      preview.hidden = sourceMode;
      source.hidden = !sourceMode;
      adapter.focus();
    },
    toggleFocusMode() {
      element.classList.toggle("y-focus");
    },
    toggleTypewriterMode() {
      element.classList.toggle("y-typewriter");
    },
    scrollToLine(line) {
      if (sourceMode && code) {
        const position = code.state.doc.line(
          Math.max(1, Math.min(line, code.state.doc.lines)),
        ).from;
        code.dispatch({
          selection: { anchor: position },
          effects: EditorView.scrollIntoView(position, { y: "center" }),
        });
      } else {
        const prose = view();
        let target = 0,
          current = 1;
        prose.state.doc.forEach((node, offset) => {
          if (current <= line) target = offset;
          current += node.textContent.split("\n").length + 1;
        });
        prose.dispatch(
          prose.state.tr
            .setSelection(TextSelection.near(prose.state.doc.resolve(target)))
            .scrollIntoView(),
        );
      }
    },
    scrollToHeading(index) {
      const headings = Array.from(
        preview.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"),
      ).filter((h) => h.textContent?.trim());
      headings[index]?.scrollIntoView?.({ block: "start" });
    },
    format(name) {
      if (isReadonly()) return;
      if (sourceMode && code) {
        if (name === "undo") codeUndo(code);
        else if (name === "redo") codeRedo(code);
        else {
          const text = adapter.getSelection().text;
          const wrappers: Record<string, [string, string]> = {
            bold: ["**", "**"],
            italic: ["*", "*"],
            strike: ["~~", "~~"],
            "inline-code": ["`", "`"],
            code: ["\n```\n", "\n```\n"],
            link: ["[", "](https://)"],
            quote: ["> ", ""],
            list: ["- ", ""],
            "ordered-list": ["1. ", ""],
            check: ["- [ ] ", ""],
            paragraph: ["", ""],
          };
          if (wrappers[name])
            adapter.insertText(wrappers[name][0] + text + wrappers[name][1]);
          else if (/^h[1-6]$/.test(name))
            adapter.insertText("#".repeat(Number(name[1])) + " " + text);
          else if (name === "table") adapter.insertText(tableMarkdown(3, 3));
          else if (name === "line") adapter.insertText("\n\n---\n\n");
        }
        return;
      }
      const prose = view();
      if (name === "undo") {
        undo(prose.state, prose.dispatch);
        return;
      }
      if (name === "redo") {
        redo(prose.state, prose.dispatch);
        return;
      }
      const commands = {
        bold: toggleStrongCommand.key,
        italic: toggleEmphasisCommand.key,
        strike: toggleStrikethroughCommand.key,
        list: wrapInBulletListCommand.key,
        "ordered-list": wrapInOrderedListCommand.key,
        quote: wrapInBlockquoteCommand.key,
        paragraph: turnIntoTextCommand.key,
      };
      if (name in commands)
        editor!.action(callCommand(commands[name as keyof typeof commands]));
      else if (/^h[1-6]$/.test(name))
        editor!.action(callCommand(wrapInHeadingCommand.key, Number(name[1])));
      else if (name === "check") {
        editor!.action(callCommand(wrapInBulletListCommand.key));
        const state = prose.state;
        const tr = state.tr;
        const { from, to, $from } = state.selection;
        let found = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === "list_item") {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
            found = true;
          }
        });
        if (!found)
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "list_item") {
              tr.setNodeMarkup($from.before(depth), undefined, {
                ...node.attrs,
                checked: false,
              });
              break;
            }
          }
        prose.dispatch(tr);
      } else if (name === "table") adapter.insertText(tableMarkdown(3, 3));
      else if (name === "link")
        adapter.insertText(
          `[${adapter.getSelection().text || "链接文字"}](https://)`,
        );
      else if (name === "inline-code")
        editor!.action(callCommand(toggleInlineCodeCommand.key));
      else if (name === "code")
        adapter.insertText("```\n" + adapter.getSelection().text + "\n```");
      else if (name === "line") adapter.insertText("\n\n---\n\n");
      prose.focus();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      ready = false;
      readObserver.disconnect();
      interactions?.destroy();
      disposeTableSelection?.();
      diagrams.destroy();
      code?.destroy();
      element.removeEventListener("paste", paste, true);
      element.removeEventListener("drop", paste, true);
      document.removeEventListener("selectionchange", selection);
      preview.removeEventListener("focusin", focusIn);
      if (editor?.status === "Created") void editor.destroy();
    },
  };
  return adapter;
}
