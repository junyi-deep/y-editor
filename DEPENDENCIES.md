# Dependency baseline

All direct JS dependencies are exact versions; transitive versions are locked in `pnpm-lock.yaml`. Rust versions are locked in `src-tauri/Cargo.lock`.

| Dependency | Version | Reason / upgrade notes |
| --- | --- | --- |
| vue | 3.5.42 | Bootstrap stack; verify typecheck and desktop integration |
| pinia | 3.0.4 | Bootstrap stack; verify typecheck and desktop integration |
| @milkdown/kit | 7.22.1 | ProseMirror Markdown core; see ADR-0006 and PATCHES.md |
| @codemirror/view / state | 6.43.12 / 6.7.5 | Source mode and transactional code node views |
| katex | 0.18.7 | Offline formula preview and MathML export |
| remark-math / remark-frontmatter | 6.0.0 / 5.0.0 | Extended syntax parsing |
| dompurify | 3.4.15 | Sanitize document HTML previews and export |
| @tauri-apps/api | 2.11.1 | Bootstrap stack; verify typecheck and desktop integration |
| vite | 8.3.0 | Locked development toolchain |
| typescript | 6.0.3 | Locked development toolchain |
| vitest | 3.2.4 | Locked development toolchain |
| @tauri-apps/cli | 2.11.4 | Locked development toolchain |
| tailwindcss / @tailwindcss/vite | 4.3.3 | shadcn-vue styling engine; layered imports, no preflight — see ADR-0007 |
| reka-ui | 2.10.4 | Accessible primitives behind every shadcn-vue component |
| class-variance-authority / clsx / tailwind-merge | 0.7.1 / 2.1.1 / 3.7.0 | Variant + class-merge helpers in copied component source |
| @lucide/vue | 1.47.0 | Stroked monochrome icon set; supersedes `lucide-vue-next`, which is deprecated |
| codemirror-lang-mermaid | 0.5.0 | Mermaid syntax highlighting in the diagram editor; dynamically imported |
| tauri (Rust) | =2.11.5 | Desktop host; test both target platforms |


## Implemented runtime additions

- Mermaid **11.12.0** is the custom lazy renderer; `diff` **8.0.2** supplies line diffs.
- Pi **0.85.1** and ripgrep **15.2.0** are fixed in `scripts/sidecars.json` with separate macOS ARM64 / Windows x64 archive SHA256s.
- Pi companion runtime files are packaged under `pi-runtime/`, resolved with `PI_PACKAGE_DIR`.
- Rust dialog/opener, keyring, notify, tempfile, sha2, ignore, trash, tokio and reqwest are recorded in Cargo.toml and Cargo.lock. JS formatting uses locked Prettier 3.6.2.
