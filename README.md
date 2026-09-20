# y-editor

本地优先的 Markdown 桌面编辑器，基于 Tauri 2、Vue 3、TypeScript、Pinia 和 Milkdown。默认采用居中正文、隐藏格式工具栏和可选侧栏；默认不打开 AI，也不预填演示文档。样式为独立实现，不包含 Typora 私有代码或资源。

当前版本 `0.1.0-dev.1` 已实现可运行的编辑、文件、搜索、主题、AI 审查和资源链路，仍为开发版本，不代表已经通过 Typora 全部交互一致性验收。

## 功能

- Markdown 即时渲染、源码模式、快捷键、选区格式工具、大纲、查找替换、专注/打字机模式、字数统计。
- 多窗口；打开文件夹自动新开窗口，每个窗口独立工作区、AI 会话与恢复草稿。快捷键 `Mod+Shift+N` 新建窗口。
- 表格单击选中单元格、拖动多选、双击编辑文字；选区对齐、行列调整与撤销。
- 原生打开/保存/另存为、目录树/列表、最近文件、快速打开、ripgrep 全文搜索、新建/重命名/复制/废纸篓。
- 原子保存、外部修改冲突检测、自动保存、恢复草稿、UTF-8 BOM 和 CRLF 保留。
- 本地图片粘贴/拖入与相对路径、离线数学公式、Mermaid 延迟渲染、缩放/拖动/全屏/SVG/PNG 导出。
- 浅色/深色/系统主题、字体与版式设置、可视化主题参数、自定义 CSS、Typora CSS 尽力兼容导入。
- HTML 导出及系统打印/PDF、便携模式、配置目录迁移。
- Pi 0.85.1 JSONL RPC；OpenAI-compatible / Anthropic-compatible、多连接预设、系统凭据库密钥、流式响应、取消、本地会话历史。
- AI 当前文档快照、工作目录搜索、只读外部仓库、修改提案、逐片段差异选择、冲突保护；AI 不直接写文件。
- 手动启用 Skills/提示词、本机资源扫描与引用导入、带文件/行号的本地知识检索。
- MCP stdio / Streamable HTTP、显式启用、工具发现、Pi → Rust → MCP 调用链路。

## 开发和构建

需要 Node.js 22.12+、pnpm 9.9.0、Rust stable，以及 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。目标平台是 macOS ARM64、Windows x64。

```sh
pnpm install --frozen-lockfile
pnpm sidecars          # 下载固定版本并核对 SHA256
pnpm tauri dev         # 完整桌面版
# 或 pnpm dev          # 仅浏览器 UI 预览，不提供文件/AI IPC
pnpm tauri build --bundles app  # macOS
# Windows: pnpm tauri build --no-bundle
pnpm package:portable
```

便携 ZIP 输出到 `artifacts/`，包含应用、`portable.flag`、数据目录和 SHA256 校验文件。macOS 的 flag 放在 `.app` 旁边；Windows 放在 `.exe` 旁边。密钥不会随便携数据移动。macOS 使用 ad-hoc 签名，未做 Apple 公证；Windows 包需要 WebView2，且未做 Authenticode 签名。

Milkdown、CodeMirror、KaTeX 字体与 Mermaid 均由构建工具打包，不依赖运行时 CDN。Pi 及其运行资源、ripgrep 会随应用打包。首次安装和下载依赖需要网络。

## 验证

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:ai
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

AI 合约测试运行真实 Pi sidecar，模型端为本机 Mock Server，不需要 API Key。Rust 测试覆盖文件边界、BOM/CRLF、过期版本保存拒绝、配置迁移、IPC 限制、知识源开关，以及 MCP stdio 与 HTTP/SSE。

CI 配置覆盖两个目标平台。`v*` tag 构建便携包并创建草稿 Release；本地生成工作流不表示远端已执行。

## 当前限制

详见 [功能验收表](docs/TYPORA_PARITY.md)。知识库当前使用本地文本块与关键词排序，没有向量 embedding；MCP 当前不含 OAuth、服务环境变量编辑或工具级授权；CSS 导入不复制相邻字体/图片资源。远程图片下载/上传适配器、完整 Markdown AST 光标映射、性能基线及 Windows 实机回归尚需继续完善。原生 PDF 输出取决于系统打印对话框。

## 文档

- [完整实施方案](docs/IMPLEMENTATION_PLAN.md)
- [架构](docs/ARCHITECTURE.md) / [安全边界](docs/SECURITY.md) / [ADR](docs/ADR/0002-local-files-and-agent-boundaries.md)
- [Typora 对标](docs/TYPORA_PARITY.md) / [依赖](DEPENDENCIES.md) / [编辑器集成](PATCHES.md)

应用自身的开源许可证待项目所有者确定。第三方依赖沿用其各自许可证。
