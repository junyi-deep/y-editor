# ADR 0006: Milkdown and isolated editor windows

Accepted 2026-09-19 by explicit user request, superseding ADR 0001 and the Vditor decision in ADR 0005.

Use Milkdown (ProseMirror) behind the existing EditorAdapter. Markdown remains the disk format. Keep the initial source until a genuine document edit; preserve unsupported Markdown as source nodes instead of discarding it. Table edits use transactions; Mermaid uses a custom node view with independent rendering and editing. Source mode uses CodeMirror. Keep existing themes, file/AI hooks and commands.

Each native window owns its workspace, watcher, search cancellation, AI process and recovery key. Shared settings and resources retain process-wide locks and SQLite storage. Resolve window identity from the trusted Tauri invocation, never a caller-provided label. Deliver menu, filesystem and AI events only to their owning window. Opening a folder creates a new window; closing one window must not quit other windows.

UI direction: restrained desktop writing tool. Preserve navigation and product terminology; unify typography, surfaces, spacing and accessible states. Design variance 3, motion 2, density 6. Marketing hero, stock imagery and scroll animation rules are inapplicable to the writing surface.
