# Architecture

```text
EditorShell → controller / command registry
  ├─ Pinia document / editor / settings / workspace / AI state
  ├─ MarkdownEditor → EditorAdapter → Milkdown / ProseMirror + CodeMirror + Mermaid
  ├─ file / outline / search sidebar + Quick Open Worker
  ├─ settings / theme / resource management
  └─ typed IPC → Rust
       ├─ workspace: native grants, canonical paths, atomic saves
       ├─ search: pinned ripgrep, cancellation and bounded results
       ├─ windows: trusted caller identity → per-window workspace, watcher, search, AI, recovery
       ├─ settings/recovery: executable-sibling .yeditor/data.db (SQLite)
       ├─ AI: native credential record → isolated Pi child → window-scoped JSONL events
       ├─ resources: opt-in references, local index with citations
       └─ MCP: opt-in stdio and Streamable HTTP clients
```

Only the adapter imports Milkdown. Document/selection/undo belongs to ProseMirror; CodeMirror source and code block views never serialize their decorated DOM. Pinia stores Markdown snapshots, versions and dirty baselines. Saving a snapshot cannot erase edits typed while disk I/O is running. Opening another document remounts the adapter; theme changes preserve editor state.

The frontend has no general filesystem or shell plugin. Native dialogs grant file/root access. Watchers signal change; the frontend compares hashes and only reloads clean documents. A dirty document receives a conflict banner. Recovery and settings are serialized independently of user documents.

Pi has no built-in write/shell tools and no automatic discovery of external context. The host-owned extension reads allowed roots and emits proposals. Knowledge/MCP tools send private JSONL requests through Pi's redirected diagnostic stream; Rust replies through an internal extension command. Tests verify the real subprocess round trip. Model keys are passed via child environment; JSON settings contain only references.

AI proposals carry exact original/proposed text. The current document uses a conservative three-way line merge; other files use exact-base checks and the normal atomic save service. Unchecked diff fragments retain their original text.

Resources and MCP changes stop the existing Pi process so previous grants cannot remain active in a reused session. Conversation text and proposals persist locally; resuming starts a fresh Pi process with bounded previous conversation context. The app never silently executes imported Skill scripts.

Settings schema 6 migrates prior SQL settings records. Data lives beside the executable in `.yeditor/data.db`; no legacy JSON migration. Credentials have no read-to-frontend IPC. Shared settings/resources retain process-wide locks; each window has its own recovery key, workspace, watcher, search sequence and Pi manager. A folder opens a new window; trusted Tauri invocation identity resolves its state. Menu/filesystem/AI events target only the owning window. Crash drafts reopen under their original window IDs. See ADR-0005 and ADR-0006.
