# ADR 0008: Owned shadcn-vue controls and compact minimalist workspace

Accepted 2026-09-21 by the user's explicit request. Extends ADR-0007, with no changes to the editor/runtime or persistence architecture.

Business surfaces import controls from src/components/ui. Reka UI is an internal dependency of those copied shadcn-vue components, not a competing application UI layer. Removing it would break the official components. DropdownMenu provides dismissal, focus and keyboard behavior; Select replaces fixed choices; Combobox supports free-text model identifiers alongside fetched options. Checkbox replaces native checkboxes for the same reason. UI engine types do not leak into business files.

The document action menu is non-modal: the document and AI composer remain interactive, and outside clicks/focus and Escape dismiss it. Reconfirmed in the browser on 2026-09-23 (a click into the composer leaves zero menus). jsdom tests cover Escape; browser checks cover outside dismissal. This supersedes the earlier blanket modal requirement, which was based on a test-environment timer limitation rather than a product constraint.

Adopt the user's minimalist-ui direction: warm monochrome default panel, readable muted text, system typography, Phosphor Bold icon family, almost-flat borders and shadows, one 36px chrome row shared by the titlebar, the sidebar tabs and the AI panel header, and consistent panel controls. The titlebar carries orientation (the workspace folder) beside the centred document title; the macOS traffic lights are positioned for that height. Preserve selectable themes and user document typography. No settings schema changes are required. Existing desktop editor exceptions from ADR-0007 remain.

AI first-use prompts populate the composer only; they never send automatically. Native backend errors remain visible in a browser-only preview. Do not present browser-only visual validation as native IPC or provider validation.
