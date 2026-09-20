# ADR 0001 — Vditor IR behind EditorAdapter

Status: Accepted

Use Tauri 2 + Vue 3 + TypeScript + Pinia. Vditor is an implementation detail of `src/editor/adapter/vditor.ts`; business components consume the application-owned `EditorAdapter` interface. Default mode is `ir`, never a split preview.

TASK-001 deliberately defines only lifecycle/content/theme/navigation operations. TASK-002 will add selection, source/focus/typewriter modes and the save callback contract; no placeholder methods that pretend to save.

Pin Vditor at 3.11.2 for the initial tested baseline rather than adopting the 4.x major release without regression review. Copy its complete `dist` resources (including Lute, language, fonts and highlighting) into generated `public/vendor/vditor/dist` before dev/build. Keep the upstream license alongside them. No runtime CDN dependency.

HTML sanitization is enabled, links do not open inside the webview, remote resources are blocked by desktop CSP, no upload endpoint is configured. External URL handling is deferred to a validated Rust/opener boundary in a future task.

References: https://github.com/Vanessa219/vditor/blob/master/README_en_US.md and https://v2.tauri.app/security/csp/
