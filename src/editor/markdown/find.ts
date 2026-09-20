export interface FindOptions {
  regex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
}
export function pattern(query: string, options: FindOptions) {
  const text = options.regex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    options.wholeWord ? `\\b(?:${text})\\b` : text,
    options.caseSensitive ? "gu" : "giu",
  );
}
export function findMatches(
  content: string,
  query: string,
  options: FindOptions,
) {
  if (!query) return [];
  return Array.from(content.matchAll(pattern(query, options)))
    .slice(0, 10000)
    .map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      line: content.slice(0, match.index).split("\n").length,
    }));
}
export function replaceMatches(
  content: string,
  query: string,
  replacement: string,
  options: FindOptions,
) {
  if (!query) return content;
  return options.regex
    ? content.replace(pattern(query, options), replacement)
    : content.replace(pattern(query, options), () => replacement);
}

export function replaceMatchAt(
  content: string,
  query: string,
  replacement: string,
  options: FindOptions,
  start: number,
) {
  if (!query) return content;
  const expression = pattern(query, options);
  const single = new RegExp(
    expression.source,
    expression.flags.replace("g", "y"),
  );
  single.lastIndex = start;
  return options.regex
    ? content.replace(single, replacement)
    : content.replace(single, () => replacement);
}
