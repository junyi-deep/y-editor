import type { Heading } from "./metadata";
export interface OutlineNode extends Heading {
  index: number;
  number: string;
  depth: number;
  parent: number | null;
  hasChildren: boolean;
  key: string;
}
export function outlineTree(headings: Heading[]): OutlineNode[] {
  const stack: OutlineNode[] = [];
  const result: OutlineNode[] = [];
  const counts = new Map<number | null, number>();
  headings.forEach((heading, index) => {
    while (stack.length && stack.at(-1)!.level >= heading.level) stack.pop();
    const parent = stack.at(-1);
    const id = parent?.index ?? null;
    const counter = (counts.get(id) ?? 0) + 1;
    counts.set(id, counter);
    const node: OutlineNode = {
      ...heading,
      index,
      parent: id,
      depth: stack.length,
      number: parent ? `${parent.number}.${counter}` : String(counter),
      hasChildren: false,
      key: `${index}:${heading.level}:${heading.text}`,
    };
    if (parent) parent.hasChildren = true;
    result.push(node);
    stack.push(node);
  });
  return result;
}
export function visibleOutline(
  nodes: OutlineNode[],
  collapsed: Set<string>,
  query: string,
) {
  const matches = query.trim().toLowerCase();
  if (matches)
    return nodes.filter((n) => n.text.toLowerCase().includes(matches));
  const hidden = new Set<number>();
  return nodes.filter((n) => {
    if (n.parent !== null && hidden.has(n.parent)) {
      hidden.add(n.index);
      return false;
    }
    if (collapsed.has(n.key)) hidden.add(n.index);
    return true;
  });
}
