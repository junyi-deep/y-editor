# Editor workspace

Target: src/app/EditorShell.vue, src/ai/AiPanel.vue and settings surfaces.
Mode: Operate.

## Direction contract

THESIS: A document workspace whose controls leave room for writing and reviewing AI edits. Retain all existing workflows.

OWN-WORLD: User-pinned minimalist-ui: warm neutral panels, charcoal actions, fine token-based borders, 6px controls, 8px conversation/composer edges, system UI type, Phosphor Bold icons. User-selected editor themes still work.

STORY: Select a connection, discuss the document, inspect changes, decide what to apply. Empty states offer useful starting prompts, never fabricated conversations.

FIRST VIEWPORT: 36px titlebar; existing optional file pane; central document; AI toolbar and connection/model row above a flexible transcript; bordered composer and compact usage below. Settings use a fixed navigation rail with scrolling content and consistent rows.

FORM: Explicit user-selected minimalist desktop tool; no concept lottery. This implementation uses code and actual browser evidence; the unanswered workflow preference is not stored.

SIGNATURE INTERACTION: Starter actions insert an editable prompt and focus the composer without sending it. Menus dismiss on outside interaction and Escape; model input accepts custom identifiers. Quiet focus/hover feedback; reduced motion remains respected.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance


## Implemented interaction and evidence record — 2026-09-24

The durable system is recorded in `DESIGN.md` and `.impeccable/design.json` (schemaVersion 2). This is documentation of the approved minimalist direction, not approval of every rendered state.

The composer anchors `@`/`/` suggestions above its field, with request/assist/full approval choice below; Shift+Enter inserts a newline even with suggestions open. Sessions open in a separate searchable dialog. Table dragging exposes source/target marks and a hint, then animates actual cell movement for 180ms unless reduced motion is requested. Selection locations map serialized state back to preserved Markdown; this metadata is not a visual minimap. Context-menu shortcut labels follow registered bindings.

Available browser evidence: `desktop.png`, `dark-editor.png`, `settings.png`, `dark-settings.png`, `history.png`, and `table.png` in `.impeccable/review/` cover 1280×720 captures; `composer.png` is 810×741, not a phone capture. The documenter inspected desktop, dark-editor and composer images and matched the system to the CSS/token sources. Browser-native-operation errors are visible evidence of the preview limitation, not provider success. Native macOS/Windows appearance and live provider operations have no visual proof in this packet. The external reviewer returned `ship` after scoring all three reported fixes resolved. That verdict covers the listed fixes and the supplied browser evidence; it does not establish native-window or provider visual verification.
