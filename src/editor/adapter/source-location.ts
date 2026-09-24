import type { EditorState } from "@milkdown/kit/prose/state";
import type { Node } from "@milkdown/kit/prose/model";
import { diffChars } from "diff";

export function lineRange(source: string, from: number, to: number) {
  const point = (offset: number) => {
    const prefix = source.slice(0, offset);
    return `Line${prefix.split("\n").length}:${offset - prefix.lastIndexOf("\n") - 1}`;
  };
  return `${point(from)}~${point(to)}`;
}
/** Serialize a detached transaction with markers. Never mutate the editor or
 * infer a repeated phrase's position with indexOf(text). Map formatting-only
 * serializer differences back to the preserved Markdown source. */
export function selectionRange(
  state: EditorState,
  from: number,
  to: number,
  serialize: (doc: Node) => string,
  source: string,
) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const start = `YEditorStart${nonce}`,
    end = `YEditorEnd${nonce}`;
  const marked = state.tr.insertText(end, to).insertText(start, from).doc;
  const output = serialize(marked);
  const a = output.indexOf(start),
    b = output.indexOf(end) - start.length;
  if (a < 0 || b < a) return undefined;
  const clean = output.replace(start, "").replace(end, "");
  if (clean === source) return lineRange(source, a, b);
  const parts = diffChars(clean, source, { timeout: 80 });
  if (!parts) return undefined;
  function map(offset: number) {
    let old = 0,
      next = 0;
    for (const part of parts!) {
      if (part.added) {
        next += part.value.length;
        continue;
      }
      if (offset <= old + part.value.length)
        return next + (part.removed ? 0 : offset - old);
      old += part.value.length;
      if (!part.removed) next += part.value.length;
    }
    return next;
  }
  return lineRange(source, map(a), map(b));
}
