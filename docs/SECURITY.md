# Security boundaries

- Vue has no filesystem/shell plugin grants. Rust exposes task-specific commands and native dialogs. File paths are canonicalized against the selected workspace or explicit file grants; symlink/traversal escapes are rejected.
- Saves compare SHA256 against the loaded disk revision and use same-directory atomic replacement with fsync. This detects normal concurrent edits; it is not a cross-process transactional filesystem lock.
- Markdown HTML sanitization is enabled. Production CSP allows same-origin scripts, disallows inline scripts, frames and objects. Markdown links go through a protocol allowlist/native opener. Remote images are not automatically fetched.
- Pi is pinned and archive-hash verified, with isolated config, no built-in tools, no auto-loaded extensions/skills/prompts/context. Reads are confined; edits are proposals. Repository grants are read-only.
- Provider credentials use macOS Keychain / Windows Credential Manager. Local JSON contains references only. Child environments are minimized, model keys are redacted from forwarded events, raw stderr is not forwarded to the UI.
- AI/stdio IPC frames are bounded before allocation grows beyond 8 MB. HTTP response size and request timeout are bounded. Search has limits/cancellation; file opens are capped at 25 MB.
- MCP is off by default. Enabling a configured server explicitly permits its tools and local command. Such a server can itself have broader OS/network access; confinement of arbitrary third-party MCP executables is not implemented. Imported Skills are text instructions, never automatically executed programs.
- Knowledge sources, repositories, Skills and prompts are individually opt-in. Removing a reference does not delete source files. Disabling a source excludes it from search even if its previous index remains on disk.
- Conversations/recovery/index data are local plaintext. Secret storage is separate. Portable mode does not export OS secrets.

This implementation is not a completed external security audit. Windows WebView2, native dialogs, OS keyring prompts and release distribution still require platform acceptance checks.
