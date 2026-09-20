export type Appearance = "light" | "dark";
export interface EditorSelection {
  text: string;
}
export interface EditorAdapter {
  open(content: string): Promise<void>;
  getMarkdown(): string;
  setMarkdown(content: string, clearHistory?: boolean): void;
  getHTML(): string;
  refreshDiagrams(): void;
  save(): Promise<void>;
  insertText(text: string): void;
  replaceSelection(text: string): void;
  getSelection(): EditorSelection;
  focus(): void;
  setTheme(theme: Appearance): void;
  setFontSize(size: number): void;
  toggleSourceMode(): void;
  toggleFocusMode(): void;
  toggleTypewriterMode(): void;
  scrollToLine(line: number): void;
  scrollToHeading(index: number): void;
  format(name: string): void;
  destroy(): void;
}
export interface DocumentSnapshot {
  path?: string;
  content: string;
  dirty: boolean;
  version: number;
}
