# TASK-002 — Complete EditorAdapter

Goal: implement the full engine-independent editor interface from implementation plan §6.

Scope: selection snapshots/replacement, text insertion, save callback, source mode, focus/typewriter mode, font size, reliable line/heading navigation. Register application commands through a shared registry when adding shortcuts.

Non-goals: AI, network providers, workspace filesystem permissions.

Files: `src/types/editor.ts`, `src/editor/adapter/`, `src/editor/VditorEditor.vue`, `tests/`.

Acceptance: operations work in real IR and source modes without losing undo history or document content; no Vditor imports outside the adapter; errors propagate clearly; UI never pretends a callback-less save succeeded.

Tests: selection and replacement with Unicode, mode round trips, initialization cancellation, programmatic update feedback, component unmount, public command availability. Record patches and parity status.
