# ADR 0004 — Palette, tables and staged startup (settings schema 5)

Accepted 2026-09-18 for the user's second interaction refinement request.

Settings schema 5 adds paletteSearchLimit (70, bounded 1–1000), paletteRegex (true) and renderLargeDiagrams (true). Migrations retain all schema 4 preferences. Panel widths are rounded on drag; Rust also deserializes finite fractional widths by rounding before clamping. This covers existing configurations and subpixel browser coordinates. Search limit input has equivalent numeric validation.

Palette mode is an explicit files/content/commands state. Tab cycles forward and Shift+Tab backward; > remains a compatibility shortcut. Regex defaults on, can be toggled per search and disabled in settings. Native rg applies a bounded result limit independently of file boundaries. File results offer copy path, reveal, system open and trash. Native system open canonicalizes through the existing workspace authorization; deletion uses the existing trash command and protects dirty open documents.

Command pinyin matching uses pinned pinyin-pro 3.29.4, loaded only with command search. Full transliteration and initials are indexed alongside labels/IDs, including preset-theme commands and the shortcut-settings command.

Table DOM integration remains entirely inside the Vditor adapter. It preserves selection before menus, mutates the selected table, then dispatches a standard input through Vditor's existing serialization/undo pipeline. Alignment affects selected columns across all rows. Whole-table selection affects all columns. Shift+Enter adds one row and Ctrl/Cmd+Enter one column in IR tables. Tables retain at least one column and header row. The row/column picker inserts a Markdown table outside the current table to avoid nesting. Date/time insertion uses local time; timestamps are Unix seconds.

Startup renders a small inline HTML status before app modules load. Settings, AI, palette and Vditor components use separate chunks; pinyin is also deferred. The native window starts hidden and shows on the page-finished event, avoiding display of an uninitialized WebView. Editor loading is visible and does not block the shell. Bundled entry JavaScript measured ~83 KB versus ~473 KB before splitting (uncompressed); this is a resource-size result, not a claimed cold-start timing benchmark.
