import { diffLines } from "diff";
interface Change {
  start: number;
  end: number;
  lines: string[];
}
function lines(text: string) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}
function changes(base: string, next: string): Change[] {
  let offset = 0;
  const result: Change[] = [];
  let pending: Change | undefined;
  for (const part of diffLines(base, next)) {
    const chunk = lines(part.value);
    if (!part.added && !part.removed) {
      if (pending) {
        result.push(pending);
        pending = undefined;
      }
      offset += chunk.length;
    } else {
      pending ??= { start: offset, end: offset, lines: [] };
      if (part.removed) {
        offset += chunk.length;
        pending.end = offset;
      } else pending.lines.push(...chunk);
    }
  }
  if (pending) result.push(pending);
  return result;
}
export function mergePatch(
  base: string,
  current: string,
  proposed: string,
): string | null {
  if (current === base) return proposed;
  if (current === proposed) return current;
  const ours = changes(base, current);
  const theirs = changes(base, proposed);
  for (const a of ours)
    for (const b of theirs) {
      if (a.start <= b.end && b.start <= a.end) return null;
    }
  const result = lines(base);
  for (const change of [...ours, ...theirs].sort((a, b) => b.start - a.start)) {
    result.splice(change.start, change.end - change.start, ...change.lines);
  }
  return result.join("");
}

/** Match the editor's UTF-8/BOM and LF representation at the approval boundary. */
export function normalizePatchText(text: string) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

export function applyDocumentPatch(
  original: string,
  current: string,
  proposed: string,
): string | null {
  const base = normalizePatchText(original);
  const replacement = normalizePatchText(proposed);
  const merged = mergePatch(base, current, replacement);
  if (merged !== null) return merged;

  // The model may propose a local excerpt instead of the whole document.
  // Only an exact, unique occurrence is safe to replace; an edited or
  // ambiguous excerpt still requires a fresh proposal.
  if (
    !base ||
    !current.includes(base) ||
    current.indexOf(base) !== current.lastIndexOf(base)
  )
    return null;
  return current.replace(base, replacement);
}
