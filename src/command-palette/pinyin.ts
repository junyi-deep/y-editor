import { pinyin } from "pinyin-pro";
import type { EditorCommand } from "./registry";
const cache = new Map<string, string>();
const GLYPH: Record<string, string> = {
  "⌘": "mod",
  "⌃": "ctrl",
  "⌥": "alt",
  "⇧": "shift",
};
/** Lowercase, expand modifier glyphs, drop every separator. */
export function normalizeQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[⌘⌃⌥⇧]/g, (glyph) => GLYPH[glyph])
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
/** "Mod" is portable; search for the key the user actually presses. */
function shortcutVariants(shortcut: string) {
  const lower = shortcut.toLowerCase();
  return [lower, ...["cmd", "command", "ctrl", "control"].map((key) => lower.replace(/mod/g, key))];
}
export function searchCommands<T extends EditorCommand>(
  commands: T[],
  query: string,
): T[] {
  const needle = normalizeQuery(query.replace(/^>/, ""));
  return commands.filter((command) => {
    const shortcut = command.shortcut ?? "";
    const key = command.id + command.title + shortcut;
    let index = cache.get(key);
    if (!index) {
      const syllables = pinyin(command.title, {
        toneType: "none",
        type: "array",
      });
      index = [
        command.title,
        command.id,
        syllables.join(""),
        syllables.map((s) => s[0]).join(""),
        ...shortcutVariants(shortcut),
      ]
        .map(normalizeQuery)
        .join(" ");
      cache.set(key, index);
    }
    return index.includes(needle);
  });
}
