import { invoke, isTauri } from "@tauri-apps/api/core";
import { defaultSettings } from "../types/workspace";
import type {
  Bootstrap,
  FileDocument,
  FileEntry,
  SearchQuery,
  SearchResult,
  Settings,
  Recovery,
} from "../types/workspace";
export const desktop = isTauri();
export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!desktop) throw new Error("此操作需要桌面版，请运行 pnpm tauri dev。");
  return invoke<T>(command, args);
}
export const backend = {
  bootstrap: (): Promise<Bootstrap> =>
    desktop
      ? call("bootstrap")
      : Promise.resolve({
          settings: defaultSettings(),
          root: null,
          configDir: "",
          recovery: null,
        }),
  pickFile: () => call<FileDocument | null>("pick_file"),
  pickFolder: () => call<string | null>("pick_folder"),
  read: (path: string, remember = true) =>
    call<FileDocument>("read_document", { path, remember }),
  save: (document: FileDocument, expected: string) =>
    call<FileDocument>("save_document", { document, expected }),
  saveAs: (content: string, suggested: string) =>
    call<FileDocument | null>("save_as", { content, suggested }),
  entries: (hidden = false, allFiles = false) =>
    call<FileEntry[]>("list_files", { hidden, allFiles }),
  mutate: (operation: string, path: string, target?: string) =>
    call<void>("file_operation", { operation, path, target }),
  search: (query: SearchQuery) =>
    call<SearchResult[]>("search_workspace", { query }),
  settings: (patch: Partial<Settings>): Promise<Settings | null> =>
    desktop ? call<Settings>("save_settings", { patch }) : Promise.resolve(null),
  recover: (snapshot: Recovery | null) =>
    desktop ? call<void>("recovery_save", { snapshot }) : Promise.resolve(),
};
