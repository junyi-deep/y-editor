# Local validation — 2026-09-21

Environment: macOS ARM64, Node 22, Rust stable; local browser preview and actual sidecar processes. No production AI credentials used.

| Check | Result |
| --- | --- |
| ESLint | Passed |
| Vue/TypeScript typecheck | Passed |
| Vitest | 70 tests passed, 15 files |
| Rust fmt (`--check`) | Passed |
| Rust clippy (`-D warnings`, all targets) | Passed |
| Rust tests | 19 passed |
| Production frontend build | Passed |
| Actual Pi + mock OpenAI stream | Passed (2026-09-17 run) |
| Actual Pi + mock Anthropic stream | Passed (2026-09-17 run) |
| Pi → host tool → Pi continuation | Passed (2026-09-17 run) |
| MCP stdio initialize/call | Passed in Rust integration test |
| MCP HTTP/SSE session headers | Passed in Rust integration test |
| 10,000-file sidebar bounded DOM | Passed, 100 rows mounted |
| macOS .app build / ad-hoc signing | Passed (2026-09-17 run) |

Browser interaction checks: initially blank document and hidden sidebars; Chinese text/headings/strong/emphasis; live-preview ↔ CodeMirror source round trip; Markdown retained without Mermaid controls; tasks/tables/math; dark theme and Mermaid rerender; settings modal focuses its search field and returns focus on close.

2026-09-21 additions: native macOS traffic lights replace the drawn window controls, so the titlebar geometry needs a look on an unlocked host; the settings preset/appearance selects are now shadcn-vue components inside a portal, so their z-order above the modal shade needs the same look. A Mermaid diagram now exits editing on an outside press or Escape, and its source is syntax-highlighted. Table columns drag from the header row. Theme presets recolour the portalled components with no reload.

2026-09-20 additions worth re-checking by hand: table edge press-and-release leaves the cell selected without an undo step; inserting a table row does not write `<br />`; a second window's settings save no longer rolls back the first window's edits; the document "more actions" menu fits its labels; the shortcut panel lists shortcut-less commands while searching and focuses its search field on every open.

Native UI testing was blocked by host lock screen. File pickers, keychain prompts, desktop print/PDF, macOS close prompts and Windows WebView2 must still be exercised on an unlocked host. Rust tests cover underlying file/save/conflict boundaries; they do not replace those native acceptance tests. CI runs on push at github.com/junyi-deep/y-editor (macOS and Windows matrix). The first run found two things a macOS-only local check could not: a Windows file-lock race in the AI sidecar test's teardown, and `title_bar_style`/`hidden_title`/`traffic_light_position` being macOS-only builder methods, which broke the Windows compile. Both are fixed; the macOS job was green on the first run.

Known limitations and incomplete plan items are tracked in TYPORA_PARITY.md and README.md. This is not certification of exact Typora parity, semantic Knowledge retrieval, or production readiness.
