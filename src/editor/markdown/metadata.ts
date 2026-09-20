export interface Heading {
  text: string;
  level: number;
}

/** Outline of ATX and Setext headings; code fences and front matter are excluded. */
export function headings(markdown: string): Heading[] {
  const result: Heading[] = [];
  let fence: string | undefined;
  let previous = "";
  let frontMatter = false;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (index === 0 && line === "---") {
      frontMatter = true;
      continue;
    }
    if (frontMatter) {
      if (line === "---" || line === "...") frontMatter = false;
      continue;
    }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        /^ {0,3}(?:`+|~+)\s*$/.test(line)
      )
        fence = undefined;
      previous = "";
      continue;
    }
    if (fence) continue;
    const atx = line.match(/^ {0,3}(#{1,6})(?:\s+(.+?)\s*|\s*)$/);
    if (atx) {
      if (atx[2])
        result.push({
          level: atx[1].length,
          text: atx[2].replace(/\s+#+$/, ""),
        });
      previous = "";
      continue;
    }
    const setext = line.match(/^ {0,3}(=+|-+)\s*$/);
    if (
      setext &&
      previous.trim() &&
      !/^\s*(?:>|[-+*] |\d+[.)] )/.test(previous)
    ) {
      result.push({
        level: setext[1][0] === "=" ? 1 : 2,
        text: previous.trim(),
      });
      previous = "";
      continue;
    }
    previous = line;
  }
  return result;
}

export function statistics(content: string) {
  return {
    characters: Array.from(content.replace(/\s/g, "")).length,
    lines: content ? content.split(/\r?\n/).length : 0,
  };
}
