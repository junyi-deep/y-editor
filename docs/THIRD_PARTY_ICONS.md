# Icon sources

- ChatGPT/OpenAI blossom: Simple Icons v11 `openai.svg`, CC0 project. https://github.com/simple-icons/simple-icons/blob/11.0.0/icons/openai.svg . Brand/trademark remains OpenAI's; the icon identifies the requested AI entry point, not product ownership or endorsement.
- Material file/folder/UI glyphs: Google Material Design Icons, Apache 2.0. https://github.com/google/material-design-icons . Reference file glyph: `src/action/description/materialicons/24px.svg`. Paths are embedded in `src/components/UiIcon.vue` for offline rendering.
- Application icon: original repository SVG at `src/assets/app-icon.svg`, folded-paper Y design; generated platform assets via `pnpm tauri icon src/assets/app-icon.svg`.
- UI glyphs inside copied shadcn-vue components (check, chevron and the other control marks): Lucide 1.47.0 via `@lucide/vue`, ISC licence. https://lucide.dev . Chosen because it is a single stroked monochrome set at one weight, which is what the macOS-style pass needs; the earlier Material fills in `UiIcon.vue` are being replaced by it. `lucide-vue-next` is deprecated upstream — use `@lucide/vue`.
