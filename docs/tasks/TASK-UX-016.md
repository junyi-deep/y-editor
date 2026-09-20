# TASK UX-016 — Sixteen user-requested editor refinements

Date: 2026-09-18. Scope: the sixteen requests in the current task; architecture and schema migration in ADR 0003.

1. Enlarged status controls, hover tips, ChatGPT icon after word count.
2. Collapsible hierarchical numbered outline, numbering setting default true, title ellipsis/tips.
3. File/content/>command palette, rounded panel, Ctrl/Cmd+Shift+F, maximum 70 results; removed search sidebar.
4. Record, disable, reset and persist shortcut overrides; conflict checking and native menu synchronization.
5. Typora/Atom/ChatGPT App/GitHub/JetBrains/VS Code/Nord/Dracula palettes, app background, CSS dialog.
6. Full-width editor scroll container with centered content padding.
7. File/outline filters at sidebar bottom.
8. Mermaid presentation, drag-pan/double-click edit, hint, clipboard exports, no nested scrollbars.
9. Native-owned combined recent history capped at eight; palette and sidebar entry points.
10. Mermaid source/state/generation tracking, isolated pointer events, retry on failure and replaced-DOM recovery.
11. Top-right wide-mode toggle and optional command shortcut.
12. Folded-paper Y app SVG and platform icons.
13. Status file path with leading ellipsis, full-path tooltip and double-click copy.
14. Context menu anchored to client coordinates, constrained to viewport.
15. Offline Material file/folder glyphs.
16. Original-vs-serialized baseline prevents untouched documents from becoming dirty.

Verification: frontend unit/component tests, Rust schema/search/file-boundary tests, lint/typecheck/build/fmt/clippy, browser smoke and macOS application packaging. Windows execution and native UI regression are not implied by successful browser checks.

## Local verification result

- 27 frontend tests and 13 Rust tests passed; lint/typecheck/build/fmt/clippy passed.
- Browser checks: outline numbering/collapse, theme and CSS dialog, shortcut capture plus execution, content-mode shortcut, editor scroll edge, large Mermaid render/pan/presentation, double-click editing, actual SVG and PNG clipboard payloads.
- Release macOS ARM64 .app and portable zip built; deep/strict codesign verification passed (ad-hoc signature, no Apple notarization).
- Portable native application launched with the new controls. Open-file chooser appeared; subsequent native automation timed out, so native file-switch/clipboard/dialog regression is not claimed as fully verified. Windows runtime verification is pending.
