import { $nodeSchema, $remark, $inputRule } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";

export const mathRemark = $remark("yMath", () => remarkMath);
export const frontmatterRemark = $remark(
  "yFrontmatter",
  () => remarkFrontmatter,
  ["yaml"],
);
export const mathInline = $nodeSchema("math_inline", () => ({
  inline: true,
  group: "inline",
  atom: true,
  attrs: { value: { default: "" } },
  parseDOM: [
    {
      tag: "span[data-math]",
      getAttrs: (el) => ({ value: el.getAttribute("data-math") }),
    },
  ],
  toDOM: (node) => [
    "span",
    { "data-math": node.attrs.value },
    node.attrs.value,
  ],
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_inline",
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, node.attrs.value);
    },
  },
}));
export const mathBlock = $nodeSchema("math_block", () => ({
  group: "block",
  atom: true,
  attrs: { value: { default: "" } },
  parseDOM: [
    {
      tag: "div[data-math]",
      getAttrs: (el) => ({ value: el.getAttribute("data-math") }),
    },
  ],
  toDOM: (node) => ["div", { "data-math": node.attrs.value }, node.attrs.value],
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_block",
    runner: (state, node) => {
      state.addNode("math", undefined, node.attrs.value);
    },
  },
}));
export const frontmatter = $nodeSchema("frontmatter", () => ({
  group: "block",
  content: "text*",
  code: true,
  marks: "",
  defining: true,
  parseDOM: [{ tag: "pre[data-frontmatter]" }],
  toDOM: () => ["pre", { "data-frontmatter": "true" }, ["code", 0]],
  parseMarkdown: {
    match: (node) => node.type === "yaml",
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(String(node.value));
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "frontmatter",
    runner: (state, node) => {
      state.addNode("yaml", undefined, node.textContent);
    },
  },
}));

export const inlineMathInput = $inputRule(
  (ctx) =>
    new InputRule(/\$([^$\n]+)\$$/, (state, match, start, end) =>
      state.tr.replaceWith(
        start,
        end,
        mathInline.type(ctx).create({ value: match[1] }),
      ),
    ),
);
export const blockMathInput = $inputRule(
  (ctx) =>
    new InputRule(/^\$\$\s$/, (state, _match, start, end) =>
      state.tr.replaceWith(
        start - 1,
        end,
        mathBlock.type(ctx).create({ value: "" }),
      ),
    ),
);
