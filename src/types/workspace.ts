export interface FileDocument {
  path: string;
  content: string;
  diskHash: string;
  lineEnding: "LF" | "CRLF";
  bom: boolean;
}
export interface FileEntry {
  path: string;
  name: string;
  relative: string;
  directory: boolean;
}
export interface SearchResult {
  path: string;
  line: number;
  column: number;
  text: string;
}
export interface SearchQuery {
  text: string;
  regex: boolean;
  limit?: number;
  caseSensitive: boolean;
  wholeWord: boolean;
  hidden: boolean;
  include: string;
  exclude: string;
}
export interface Recovery {
  path: string | null;
  content: string;
  diskHash: string;
  lineEnding: "LF" | "CRLF";
  bom: boolean;
  savedAt: number;
}
export interface Provider {
  enabled: boolean;
  protocol: "openai-compatible" | "anthropic-compatible";
  baseUrl: string;
  model: string;
  apiKeyRef: string;
}
export interface RecentEntry {
  path: string;
  kind: "file" | "folder";
}
export interface Settings {
  outlineNumbering: boolean;
  themePreset: string;
  backgroundImage: string;
  shortcuts: Record<string, string>;
  wideEditor: boolean;
  recentEntries: RecentEntry[];
  schemaVersion: 6;
  paletteSearchLimit: number;
  paletteRegex: boolean;
  opacity: number;
  attachmentFolder: string;
  pastePrompt: boolean;
  allowAttachments: boolean;
  renderLargeDiagrams: boolean;
  appearance: "light" | "dark" | "system";
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  autosave: boolean;
  autosaveDelay: number;
  spellcheck: boolean;
  sidebar: boolean;
  sidebarWidth: number;
  aiWidth: number;
  recentFiles: string[];
  lastFolder: string | null;
  customCss: string;
  providerProfiles: { name: string; provider: Provider }[];
  ai: Provider;
}
export interface Bootstrap {
  settings: Settings;
  root: string | null;
  configDir: string;
  recovery: Recovery | null;
}
export const defaultSettings = (): Settings => ({
  schemaVersion: 6,
  paletteSearchLimit: 70,
  paletteRegex: true,
  opacity: 1,
  attachmentFolder: "assets",
  pastePrompt: true,
  allowAttachments: true,
  renderLargeDiagrams: true,
  outlineNumbering: true,
  themePreset: "typora",
  backgroundImage: "",
  shortcuts: {},
  wideEditor: false,
  recentEntries: [],
  appearance: "light",
  fontFamily: "sans-serif",
  fontSize: 16,
  lineHeight: 1.6,
  contentWidth: 800,
  autosave: true,
  autosaveDelay: 1200,
  spellcheck: true,
  sidebar: false,
  sidebarWidth: 240,
  aiWidth: 340,
  recentFiles: [],
  lastFolder: null,
  customCss: "",
  providerProfiles: [],
  ai: {
    enabled: false,
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    apiKeyRef: "provider:default",
  },
});
