import type { InjectionKey } from "vue";
export const commandRegistryKey: InjectionKey<CommandRegistry> =
  Symbol("commands");
import { matchesShortcut } from "./shortcuts";
export interface EditorCommand {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  execute: () => void | Promise<unknown>;
  when?: () => boolean;
}
export class CommandRegistry {
  constructor(private overrides: () => Record<string, string> = () => ({})) {}
  defaults() {
    return [...this.commands.values()];
  }
  private commands = new Map<string, EditorCommand>();
  register(command: EditorCommand) {
    if (this.commands.has(command.id))
      throw new Error(`重复命令 ${command.id}`);
    this.commands.set(command.id, command);
  }
  list(query = "") {
    const text = query.toLowerCase().replace(/^>/, "").trim();
    return [...this.commands.values()]
      .map((c) => ({ ...c, shortcut: this.overrides()[c.id] ?? c.shortcut }))
      .filter((c) => `${c.title} ${c.id}`.toLowerCase().includes(text));
  }
  async execute(id: string) {
    const command = this.commands.get(id);
    if (command && (!command.when || command.when())) await command.execute();
  }
  match(event: KeyboardEvent) {
    if (event.isComposing) return undefined;
    return this.list().find(
      (c) => !!c.shortcut && matchesShortcut(c.shortcut, event),
    );
  }
}
const GLYPHS: Record<string, string> = {
  Mod: "⌘",
  Shift: "⇧",
  Alt: "⌥",
  Ctrl: "⌃",
};
/**
 * Read-only rendering of a stored combo for the menus and the palette. The
 * stored spelling stays `Mod+Shift+n`: that is what the editor binds and what
 * ShortcutSettings shows while it captures a new combination.
 */
export function shortcutLabel(
  shortcut?: string,
  platform = navigator.platform,
): string {
  if (!shortcut) return "";
  const mac = !/Win|Linux/i.test(platform);
  return shortcut
    .split("+")
    .map((key) =>
      mac
        ? (GLYPHS[key] ?? key.toUpperCase())
        : key === "Mod"
          ? "Ctrl"
          : key.length === 1
            ? key.toUpperCase()
            : key,
    )
    .join(mac ? "" : "+");
}
export function fuzzyScore(query: string, value: string): number {
  if (!query.trim()) return 0;
  let score = 0;
  let from = 0;
  for (const char of query.toLowerCase()) {
    const at = value.toLowerCase().indexOf(char, from);
    if (at < 0) return -1;
    score += at === from ? 3 : 1;
    from = at + 1;
  }
  return score - value.length / 1000;
}
