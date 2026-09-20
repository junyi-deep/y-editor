# y-editor 工程实施方案

> 2026-09-20 架构更新：按用户要求采用 Milkdown + CodeMirror，替代下文历史方案中的 Vditor；多窗口隔离方案见 ADR-0006，当前任务见 `docs/tasks/TASK-20260919.md`。其余产品能力与安全边界继续保留。

> 项目名称：`y-editor`
> 应用名称：`y-editor`
> 类型：本地优先、AI 深度集成的 Markdown 桌面编辑器
> 核心定位：**Typora-like Markdown 编辑体验 + Agentic AI Markdown 工作空间**

---

# 1. 产品目标

`y-editor` 是一个基于 Tauri 的桌面 Markdown 编辑器。

产品的两个核心方向：

1. **尽可能复现 Typora 的 Markdown 编辑体验**
2. **把 AI Agent 作为编辑器原生能力，而不是普通聊天侧栏**

编辑器部分以 Typora 的 Live Preview / 即时渲染体验作为交互基准：

```text
Markdown 文件
      ↓
即时渲染
      ↓
Markdown 标记智能隐藏
      ↓
光标进入节点时恢复 Markdown 编辑状态
```

AI 部分的目标不是：

```text
Markdown Editor + ChatGPT WebView
```

而是：

```text
Markdown Workspace
        +
AI Agent
        +
Knowledge Base
        +
Repositories
        +
Skills
        +
MCP
        +
Prompt Presets
        +
Workspace Tools
```

AI 应能够理解当前文档和当前工作目录，检索相关资料，并以受控方式修改 Markdown 文件。

---

# 2. 产品设计原则

优先级固定为：

```text
Typora 类似体验
        >
性能 = 可定制程度
        >
集成难易度
```

因此：

* Markdown 编辑器采用 **Vditor IR**
* 不为了降低实现成本而退化成传统“双栏 Markdown Preview”
* UI 应尽量保持轻量，不使用视觉存在感很强的大型组件库
* Markdown 文件始终保存在用户本地
* AI 功能属于可关闭能力
* 所有 AI 修改必须可以查看 Diff
* 网络模型、Knowledge Base、Skill、MCP 都必须可独立开关
* 不把用户 Markdown 数据默认上传到任何 y-editor 服务
* 不引入 y-editor 自有云作为核心依赖

Typora 的功能和交互可以作为兼容目标，但不得复制 Typora 的私有代码、品牌素材、图标或受限制资源。默认主题应自行实现；可以支持用户自行导入/迁移已有 CSS。

---

# 3. 技术栈

## 3.1 桌面框架

```text
Tauri 2
Rust
```

Rust 负责：

* 文件系统
* Workspace 管理
* 文件监听
* 搜索
* 配置管理
* Secret 管理
* AI 子进程管理
* Knowledge Base
* Git / Repository 信息
* Sidecar 管理
* 系统级能力
* 安全边界

---

## 3.2 前端

```text
Vue 3
TypeScript
Vite
Pinia
Vditor
```

UI primitive 推荐：

```text
Reka UI
```

样式体系推荐：

```text
CSS Variables
+
SCSS/CSS Modules
```

不建议使用：

```text
Element Plus
Ant Design Vue
Vuetify
```

作为主要 UI 系统。

原因是这些组件库会使应用天然带有 Web 管理后台风格，很难达到 Typora 式的轻量桌面体验。

---

# 4. 总体架构

```text
┌──────────────────────────────────────────────┐
│                  y-editor                    │
│                                              │
│  ┌──────────── Vue Frontend ──────────────┐  │
│  │                                         │  │
│  │ File Sidebar     Editor       AI Panel │  │
│  │     │              │             │      │  │
│  │     │           Vditor IR        │      │  │
│  │     │              │             │      │  │
│  │ Command Palette / Settings / Theme      │  │
│  └───────────────┬─────────────────────────┘  │
│                  │ Tauri IPC                  │
│  ┌───────────────▼─────────────────────────┐  │
│  │                Rust Core                │  │
│  │                                         │  │
│  │ Workspace     Search       Settings     │  │
│  │ Files         Knowledge    Secrets      │  │
│  │ Watcher       Git          AI Manager   │  │
│  └──────┬──────────────┬───────────────────┘  │
│         │              │                       │
│      ripgrep        Pi Agent                   │
│      sidecar        sidecar                    │
│                        │                       │
│                  AI Providers                  │
│               OpenAI / Anthropic               │
└──────────────────────────────────────────────┘
```

必须保持：

```text
Vue
  ↓
Rust
  ↓
OS / Files / Process
```

不要让 Vue 前端直接拥有任意文件系统和 Shell 权限。

---

# 5. 推荐目录结构

```text
y-editor/
├── AGENTS.md
├── README.md
├── LICENSE
├── package.json
├── pnpm-lock.yaml
│
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── ARCHITECTURE.md
│   ├── AI_ARCHITECTURE.md
│   ├── TYPORA_PARITY.md
│   ├── SECURITY.md
│   └── ADR/
│
├── src/
│   ├── app/
│   ├── components/
│   ├── composables/
│   ├── stores/
│   ├── services/
│   ├── types/
│   │
│   ├── editor/
│   │   ├── VditorEditor.vue
│   │   ├── adapter/
│   │   ├── commands/
│   │   ├── themes/
│   │   ├── markdown/
│   │   └── mermaid/
│   │
│   ├── workspace/
│   │
│   ├── command-palette/
│   │
│   ├── settings/
│   │
│   ├── ai/
│   │
│   └── knowledge/
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   ├── workspace/
│   │   ├── search/
│   │   ├── settings/
│   │   ├── secrets/
│   │   ├── knowledge/
│   │   ├── ai/
│   │   └── sidecar/
│   │
│   ├── binaries/
│   │   ├── rg-...
│   │   └── pi-...
│   │
│   └── capabilities/
│
├── resources/
│   ├── themes/
│   ├── prompts/
│   ├── skills/
│   └── pi-extension/
│
├── tests/
│
└── .github/
    └── workflows/
        ├── ci.yml
        └── release.yml
```

---

# 6. Vditor 集成方案

统一使用：

```ts
mode: "ir"
```

即 Instant Rendering。

Vditor 不允许散落在业务代码里直接调用。

必须增加：

```text
EditorAdapter
```

作为 y-editor 与 Vditor 之间的隔离层：

```text
Vue Components
      ↓
EditorAdapter
      ↓
Vditor
```

接口至少包括：

```ts
interface EditorAdapter {
  open(content: string): Promise<void>
  getMarkdown(): string
  setMarkdown(content: string): void

  save(): Promise<void>

  insertText(text: string): void
  replaceSelection(text: string): void

  getSelection(): EditorSelection
  focus(): void

  setTheme(theme: string): void
  setFontSize(size: number): void

  toggleSourceMode(): void
  toggleFocusMode(): void
  toggleTypewriterMode(): void

  scrollToLine(line: number): void
  scrollToHeading(id: string): void
}
```

目的：

未来如果 Vditor 某些地方无法满足需求，可以：

```text
patch Vditor
```

而不污染整个项目。

---

# 7. Vditor Patch Layer

建立：

```text
src/editor/adapter/vditor-patches/
```

禁止业务代码直接魔改 Vditor。

第一批 Patch：

```text
Mermaid Renderer
Local File Resolver
Link Handler
Image Handler
Selection Helper
IR Behavior
Large File Strategy
```

维护：

```text
PATCHES.md
```

记录：

```text
Patch 原因
对应 Vditor Version
修改文件
Upstream 是否已有解决方案
升级验证步骤
```

---

# 8. Mermaid

Vditor 自带 Mermaid 可以作为 fallback。

y-editor 应自己控制 Mermaid renderer。

原因：

* 控制 Mermaid 版本
* 自定义主题
* Lazy Rendering
* Error UI
* Zoom
* Pan
* Fullscreen
* Export SVG
* Export PNG
* Copy SVG
* 深浅主题同步
* 性能优化

结构：

````text
Vditor
   ↓
```mermaid
   ↓
y-editor MermaidAdapter
   ↓
Mermaid
   ↓
SVG
````

不要让所有 Mermaid 图在打开文件时同时立即渲染。

采用：

```text
IntersectionObserver
```

只有进入 viewport 附近才 render。

特别大的 Diagram：

```text
[ Render diagram ]
```

按需渲染。

---

# 9. 编辑器布局

主窗口：

```text
┌──────────────────────────────────────────────┐
│                   Title Bar                  │
├───────────┬────────────────────┬─────────────┤
│           │                    │             │
│ Files /   │                    │             │
│ Outline   │      Markdown      │     AI      │
│           │       Editor       │    Panel    │
│           │                    │             │
│           │                    │             │
├───────────┴────────────────────┴─────────────┤
│                  Status Bar                  │
└──────────────────────────────────────────────┘
```

左右侧栏均：

```text
可关闭
可 resize
保存 width
```

进入纯写作模式时：

```text
左 Sidebar hidden
右 AI hidden
Toolbar hidden
Status Bar optional
```

---

# 10. Typora 功能对标

截至 2026 年 7 月 Typora 1.14 已经包含新的 Floating Editor Toolbar、侧栏文件显示过滤以及 File Tree 键盘导航。y-editor 的 Typora parity 应以当前版本而不是旧版 Typora 为参考。

建立：

```text
docs/TYPORA_PARITY.md
```

每一项状态：

```text
TODO
PARTIAL
DONE
WONT_FIX
```

## P0：必须实现

### 编辑体验

* Live Preview
* Markdown marker 智能隐藏
* Source Mode
* Undo / Redo
* Select / Copy / Paste
* Auto Pair
* Auto Save
* Crash Recovery
* Find / Replace
* Regex Search
* Zoom
* Spellcheck
* Context Menu
* Floating Toolbar

Typora 官方将 Live Preview 定义为：inline Markdown 标记智能隐藏，block Markdown 标记在渲染后隐藏。

### Markdown

支持：

```text
Paragraph
Heading
Blockquote

Ordered List
Unordered List
Task List

Code Block
Inline Code

Table

Math Block
Inline Math

Footnote

Horizontal Rule

YAML Front Matter

TOC

Links
Internal Links
Reference Links

Images

Emphasis
Strong
Strike

Emoji

Subscript
Superscript
Highlight

HTML
Video / Embed

Mermaid
```

Typora 当前 Markdown Reference 覆盖上述绝大多数 Markdown/GFM 扩展能力。

### 文档管理

必须有：

```text
Open File
Open Folder

File Tree
File List

Outline

Quick Open

Global Search

Recent Files

Reveal in Finder / Explorer
```

Typora 的 Quick Open 支持当前文件夹 fuzzy search，侧栏包含 Outline、File Tree 和 File List，并提供 Global Search。

### 写作模式

支持：

```text
Focus Mode
Typewriter Mode
```

Focus Mode 淡化非当前内容；Typewriter Mode 保持当前 caret 在固定区域。

### 图片

支持：

```text
Paste Image
Drag Image

Copy Image to assets/

Relative Path

Absolute Path

./ prefix

Image Root Path

Local Image Preview

Remote Image Download

Image Upload Adapter
```

Typora 本身支持拖拽、相对路径以及 `typora-root-url` 一类图片路径行为；y-editor 应提供对应能力，但使用自己的配置字段。

---

# 11. Typora Theme / y-editor Theme System

不要直接让业务功能绑定某个 Vditor theme。

定义：

```text
YEditorTheme
```

目录：

```text
themes/
└── github/
    ├── theme.json
    ├── editor.css
    ├── code.css
    └── assets/
```

`theme.json`：

```json
{
  "id": "github",
  "name": "GitHub",
  "version": 1,
  "appearance": "light",
  "author": "y-editor"
}
```

CSS 主要通过变量控制：

```css
:root {
  --y-font-family: ...;
  --y-font-size: 16px;

  --y-text-color: ...;
  --y-bg-color: ...;

  --y-heading-color: ...;

  --y-editor-width: 860px;

  --y-line-height: 1.7;
  --y-paragraph-spacing: 1em;

  --y-code-font: ...;
}
```

---

# 12. Theme Editor

这是 y-editor 的核心差异化能力之一。

提供独立：

```text
Theme Editor
```

功能：

```text
实时 Preview

字体
字号
行高

正文宽度

段落间距

H1 ~ H6

blockquote

link

inline code

code block

table

image

math

mermaid

dark/light
```

同时提供：

```text
Advanced CSS
```

让高级用户直接编辑 CSS。

CSS 编辑自动热更新。

---

# 13. Typora Theme 导入

支持：

```text
Import Typora Theme CSS
```

但定义为：

```text
Best-effort Compatibility
```

而不是承诺 100% DOM 兼容。

实现：

```text
Typora CSS
     ↓
Selector Translator
     ↓
y-editor compatibility stylesheet
```

不把 Typora 官方商业发行包中的默认资源重新分发。

---

# 14. Settings 设置中心

设置中心为 Modal / 独立 Panel：

```text
┌───────────────────────────────────────┐
│ Settings                              │
├────────────┬──────────────────────────┤
│ General    │                          │
│ Editor     │                          │
│ Markdown   │          Setting         │
│ Appearance │                          │
│ AI         │                          │
│ Knowledge  │                          │
│ Skills     │                          │
│ MCP        │                          │
│ Prompts    │                          │
│ Advanced   │                          │
│ About      │                          │
└────────────┴──────────────────────────┘
```

必须自带：

```text
Settings Search
```

---

# 15. 设置分类

## General

```text
语言
启动行为
最近文件
默认工作目录
自动保存
自动恢复
配置目录
数据目录
日志目录
```

## Editor

```text
字体
字号
行高
正文宽度

显示行号

Focus Mode
Typewriter Mode

Auto Pair

Spellcheck

Tab size

Word Wrap

Auto Save delay
```

## Markdown

```text
GFM
Math
Footnotes
Mermaid
HTML
Task List
YAML

Smart Punctuation
```

## Appearance

```text
Light / Dark / System

Theme

Code Theme

Mermaid Theme

Sidebar Width

AI Sidebar Width

Toolbar

Status Bar
```

---

# 16. 配置存储

配置格式：

```text
JSON
```

必须 versioned：

```json
{
  "schemaVersion": 1
}
```

所有版本升级通过：

```text
Settings Migration
```

处理。

禁止在升级时直接假定旧结构与新结构相同。

默认存储：

```text
Tauri AppConfig directory
```

同时提供：

```text
设置 → 数据 → 修改配置目录
```

---

# 17. Portable Mode

支持：

```text
portable.flag
```

如果 executable 附近存在：

```text
portable.flag
```

则：

```text
./data/
├── config/
├── sessions/
├── cache/
├── themes/
├── skills/
└── prompts/
```

否则使用系统 AppData。

Secret 默认不跟随 Portable Data 明文移动。

---

# 18. Secret 管理

API Key 禁止：

```text
直接保存在 config.json
```

默认使用：

```text
macOS Keychain
Windows Credential Manager
```

config 中只存：

```json
{
  "apiKeyRef": "provider:abc123"
}
```

未来可以增加：

```text
Encrypted Portable Secret Store
```

但必须由用户显式启用并设置 Master Password。

---

# 19. Command Palette

设计为类似：

```text
VS Code / Spotlight / Raycast
```

默认：

```text
Cmd/Ctrl + P
```

弹出：

```text
Command Palette
```

输入：

```text
> command
```

表示命令。

其他输入：

```text
快速文件搜索
```

也可以提供：

```text
Cmd/Ctrl + Shift + P
```

直接进入 command mode。

---

# 20. Command Registry

所有命令统一注册：

```ts
interface EditorCommand {
  id: string
  title: string

  category?: string

  shortcut?: string

  execute(): Promise<void>

  when?: () => boolean
}
```

禁止组件直接维护快捷键。

例如：

```text
file.open
file.save
file.quickOpen

editor.bold
editor.italic

editor.focusMode

view.toggleSidebar
view.toggleAi

ai.newSession
ai.explainSelection
ai.rewriteSelection

settings.open
```

快捷键系统与 Command Registry 共用。

---

# 21. Workspace Search

内容搜索：

```text
ripgrep
```

通过 Tauri sidecar 集成。

Tauri 官方支持通过 `externalBin` 打包架构相关 sidecar。

当前 ripgrep 15.2.0 仍在持续优化大型目录遍历性能。

调用：

```text
rg --json
```

结果转为：

```ts
interface SearchResult {
  path: string
  line: number
  column: number

  match: string
  before?: string
  after?: string
}
```

功能：

```text
Case Sensitive
Regex
Whole Word

Include Glob
Exclude Glob

Respect .gitignore
Include Hidden
```

点击结果：

```text
打开文件
 ↓
跳到 line
 ↓
高亮 match
```

搜索必须：

```text
异步
支持 cancel
支持 debounce
```

---

# 22. AI 技术方案

采用：

```text
Pi Agent
```

但不直接在 Vue 中集成。

截至 2026 年，Pi 已从旧的 `@mariozechner/*` namespace 迁移至 Earendil Works，目前正式包为：

```text
@earendil-works/pi-coding-agent
```

项目仓库也已经迁移到：

```text
earendil-works/pi
```

0.74.0 起使用新 package scope。

Pi 已原生提供：

```text
RPC
SDK

Skills

Prompt Templates

Extensions

Sessions

OpenAI / Anthropic 等 Provider
```

官方明确把 RPC 定义为给 IDE、自定义 UI、非 Node 应用嵌入 Agent 的接口，非常适合 Rust/Tauri Host。

因此第一阶段架构采用：

```text
Tauri Rust
    ↓
Pi standalone binary
    ↓
pi --mode rpc
```

而不是重新实现 Agent Loop。

---

# 23. Pi Agent Sidecar

将 Pi 独立 binary 作为 Tauri Sidecar。

```text
src-tauri/binaries/
├── pi-aarch64-apple-darwin
└── pi-x86_64-pc-windows-msvc.exe
```

Rust 实现：

```text
PiProcessManager
```

职责：

```text
start()
stop()
restart()

sendRpc()
abort()

setWorkspace()
setProvider()
setModel()

newSession()
resumeSession()
```

stdin/stdout 使用：

```text
JSONL
```

---

# 24. 为什么不自己实现 Agent Loop

不要第一版自己实现：

```text
LLM loop
Tool call
Tool continuation
Message compaction
Context management
Streaming state
Session branching
```

Pi 已经处理这些。

Pi 当前 SDK/Runtime 也支持工具 allowlist、custom tools、session、resource loader 等能力。

y-editor 应把研发资源用于：

```text
Editor
UI
Workspace
Knowledge
MCP
AI/Editor Interaction
```

---

# 25. AI Provider 配置

设置：

```text
Settings
  ↓
AI
```

可以添加多个 Provider Profile。

数据模型：

```ts
interface AIProvider {
  id: string

  name: string

  protocol:
    | "openai-compatible"
    | "anthropic-compatible"

  baseUrl: string

  apiKeyRef: string

  model: string

  headers?: Record<string, string>

  contextWindow?: number

  enabled: boolean
}
```

支持：

```text
OpenAI
Anthropic

OpenRouter
DeepSeek
MiniMax
Moonshot
自建 Gateway
本地兼容 Server
```

只要使用 OpenAI 或 Anthropic compatible wire format。

Pi 当前也支持通过 custom model/provider configuration 接入兼容 OpenAI、Anthropic 等协议的 Provider。

---

# 26. AI 右侧 Panel

结构：

```text
┌────────────────────────────┐
│ AI                         │
├────────────────────────────┤
│ Model: Claude ...       ▼ │
│                            │
│ Context                    │
│ ☑ Current File            │
│ ☑ Workspace               │
│                            │
│ Knowledge                  │
│ ☑ Product Docs            │
│ ☑ Research                │
│                            │
│ Repositories               │
│ ☑ repo-a                  │
│ ☑ repo-b                  │
│                            │
│ Skills                     │
│ ☑ writing                 │
│ ☑ technical-doc           │
│                            │
│ MCP                        │
│ ☑ filesystem              │
│ ☐ github                  │
│                            │
│ Prompt                     │
│ Technical Writer       ▼  │
├────────────────────────────┤
│                            │
│ Conversation               │
│                            │
├────────────────────────────┤
│ message...                 │
└────────────────────────────┘
```

Selections 属于：

```text
AI Session
```

可以持久化。

---

# 27. AI 默认上下文规则

如果：

```text
有打开文件
+
用户没有明确指定文件
```

则：

```text
Current File
```

自动成为 primary context。

用户选中文字时：

```text
Selection
```

优先级高于整个文件。

Prompt context：

```text
User Prompt

Selection

Current File

Selected Knowledge

Selected Repositories

Skills

Prompt Preset
```

不得每次把整个 repo 塞进 context。

---

# 28. AI 文件修改

默认 AI 不应直接无提示写文件。

第一阶段采用：

```text
AI
 ↓
Proposed Patch
 ↓
Diff Viewer
 ↓
Accept / Reject
```

Diff：

```text
original
vs
proposed
```

支持：

```text
Accept All

Reject All

Apply Hunk
Reject Hunk
```

应用后：

```text
reload current document
```

或者直接更新当前 Vditor state。

---

# 29. AI Tool 安全模型

Pi 本身默认可以提供：

```text
read
write
edit
bash
```

而且 Pi 官方明确指出 project trust 并不是 sandbox。

因此 y-editor 默认启动 AI 时不要开放：

```text
bash
write
edit
powershell
```

默认 allowlist：

```text
read
grep
find
ls
```

Pi 本身支持 `--tools` 严格 allowlist、`--no-builtin-tools` 和 `--exclude-tools`。

文件写操作通过 y-editor 自己的：

```text
propose_patch
```

机制完成。

高级设置可以提供：

```text
Agent Full Access
```

必须显式开启。

---

# 30. AI 权限级别

定义：

```text
Read Only

Review Writes

Full Access
```

### Read Only

```text
read
grep
find
ls
```

### Review Writes

增加：

```text
propose_patch
```

所有修改用户确认。

### Full Access

允许：

```text
edit
write

bash / powershell
```

必须显示明显风险提示。

---

# 31. Skills

Skills 使用标准：

```text
SKILL.md
```

y-editor 自己的目录：

```text
skills/
└── xxx/
    └── SKILL.md
```

支持：

```text
Add Folder

Import

Enable / Disable

Global

Workspace

Session selection
```

Pi 原生支持 Skill discovery，并支持通过 `--skill <path>` 重复指定 skill。

---

# 32. Skill 自动发现 / 迁移

扫描：

```text
~/.pi/
~/.agents/

~/.claude/
~/.codex/

项目：
.pi/
.agents/
.claude/
```

具体 importer 做成：

```text
PiImporter
ClaudeImporter
CodexImporter
```

禁止整个设置系统到处出现：

```text
if claude
if codex
```

统一输出：

```ts
interface ImportedResource {
  type:
    | "skill"
    | "prompt"
    | "mcp"

  source:
    | "pi"
    | "claude"
    | "codex"
    | "other"

  sourcePath: string
}
```

用户确认后再迁移。

---

# 33. Pi Agent 迁移

Pi 自身 Skill / Prompt 应优先：

```text
reference path
```

而不是强制 copy。

也可以：

```text
Copy into y-editor
```

由用户选择。

Pi 当前 Resource 系统包含：

```text
extensions
skills
prompt templates
themes
context files
```

适合作为 y-editor AI Resource 基础。

---

# 34. Claude Code / Codex 迁移

实现：

```text
Scan
 ↓
Preview
 ↓
Select
 ↓
Import
```

不要第一次启动时未经允许修改：

```text
~/.claude
~/.codex
```

始终：

```text
Read Only Scan
```

导入到 y-editor 后再独立管理。

---

# 35. Prompt Presets

数据格式：

```text
prompts/
└── technical-writer.md
```

支持 metadata：

```yaml
---
name: Technical Writer
description: Improve technical documentation
---

You are...
```

AI Panel 可选择：

```text
None
Technical Writer
Proofreader
Translator
Research Assistant
```

用户可以自行创建。

Pi 原生支持 file-based Prompt Templates，y-editor 可以直接映射。

---

# 36. MCP

必须单独设计。

Pi 当前**故意不内置 MCP**；官方建议通过 Extension 自行增加。

因此：

```text
不要等待 Pi 原生 MCP
```

y-editor 自己实现：

```text
MCP Manager
```

模型：

```ts
interface McpServer {
  id: string
  name: string

  transport:
    | "stdio"
    | "http"

  command?: string

  args?: string[]

  url?: string

  env?: Record<string, string>

  enabled: boolean
}
```

---

# 37. MCP 与 Pi 的连接

推荐实现一个 y-editor Pi Extension：

```text
resources/pi-extension/y-editor-extension.js
```

通过：

```text
pi --extension ...
```

加载。

Extension 向 Pi 注册：

```text
y_mcp_call
y_knowledge_search
y_propose_patch
```

Pi 官方 Extension API 支持注册工具、命令和事件。

第一版不要把每个 MCP Tool 全部无条件塞入 system prompt。

应：

```text
MCP Server
   ↓
Tool Discovery
   ↓
用户选择 Enabled Server
   ↓
按需注册 Tool
```

避免 tool context 爆炸。

---

# 38. Knowledge Base

Knowledge Base 不应等价为：

```text
把整个文档发送给模型
```

结构：

```text
Knowledge Source
       ↓
Indexer
       ↓
Chunk
       ↓
Search
       ↓
Relevant Chunks
       ↓
LLM
```

支持 source：

```text
Folder

Markdown

Text

PDF（后续）

Repository

Manual Notes
```

---

# 39. Knowledge Index

第一阶段：

```text
Keyword Search
```

第二阶段：

```text
Hybrid Search

BM25
+
Embedding
```

Rust 推荐架构：

```text
SQLite
  ↓
Metadata

Tantivy
  ↓
Full Text

Vector Index
  ↓
optional
```

Embedding 应是可选能力。

用户不配置 embedding provider 时：

```text
Knowledge Base 仍然正常工作
```

---

# 40. 多 Repository

AI Panel 可添加：

```text
Repository
```

数据：

```ts
interface RepositorySource {
  id: string
  root: string
  name: string

  writable: boolean

  enabled: boolean
}
```

默认为：

```text
read-only
```

用户当前工作目录默认加入。

其他代码仓可以多选。

---

# 41. Workspace 与 Repository 的区别

```text
Workspace
```

表示当前 Markdown 编辑目录。

```text
Repository
```

表示 AI 可以额外读取的目录。

例如：

```text
docs/
    ← Workspace

backend/
frontend/
    ← AI Repository
```

这样用户可以：

```text
根据代码仓自动更新 Markdown 文档
```

---

# 42. 当前文件与 AI 的实时同步

AI 发起请求前：

```text
如果 Vditor 有未保存内容
```

优先使用：

```text
editor.getMarkdown()
```

而不是从磁盘读取旧文件。

因此建立：

```text
DocumentSnapshot
```

：

```ts
interface DocumentSnapshot {
  path?: string

  content: string

  dirty: boolean

  version: number
}
```

避免 Agent 修改过期版本。

---

# 43. AI Diff 冲突处理

发送请求：

```text
Document version = 12
```

AI 返回 patch。

应用时当前：

```text
Document version = 15
```

则：

```text
禁止无脑 apply
```

必须：

```text
3-way / contextual rebase
```

失败则提示：

```text
Document changed since AI generated this edit.
```

---

# 44. Autosave / Recovery

Autosave：

```text
Vditor input
   ↓
debounce
   ↓
Atomic Write
```

不要：

```text
fs::write original
```

直接覆盖。

采用：

```text
temp
 ↓
fsync
 ↓
rename
```

降低崩溃损坏风险。

另保存：

```text
Recovery Snapshot
```

Typora 自身也提供自动保存和未保存 draft recovery；这是功能对标项。

---

# 45. File Watcher

Rust：

```text
notify
```

监听：

```text
当前文件
当前 Workspace
Theme folder
Skill folder
Prompt folder
```

当外部程序修改当前文件：

```text
Editor clean
→ reload

Editor dirty
→ Conflict Dialog
```

---

# 46. 大文件策略

Vditor 的主要目标并不是超大文本 virtualization。

因此定义：

```text
Large File Mode
```

默认阈值先设为：

```text
2 MB
```

并通过 benchmark 后调整。

Large File Mode：

```text
降低 autosave frequency

Mermaid lazy

停止非可见 diagram

关闭 expensive enhancements

减少实时统计频率

关闭实时 AI indexing
```

特别大的文件：

```text
> 10 MB
```

提示：

```text
Open normally
Open with reduced rendering
Cancel
```

数值属于 y-editor 自己的初始策略，最终必须通过性能测试决定。

---

# 47. Performance Benchmark

仓库提供：

```text
benchmarks/
```

测试：

```text
100 KB
1 MB
5 MB
10 MB
20 MB
```

指标：

```text
Open time

First editable time

Typing latency

Scroll FPS

Memory

Save time

Search time
```

每次升级 Vditor 必须至少跑：

```text
1 MB
5 MB
10 MB
```

---

# 48. Word Count / Status Bar

Status Bar：

```text
Words
Characters
Lines
Selection Words

Reading Time

Encoding

Line Ending

AI status
```

Typora 官方同样提供 words、characters、lines 和 reading minutes 等统计。

---

# 49. Export

P0：

```text
Markdown
HTML
PDF
```

P1：

```text
Image
```

P2：

通过：

```text
Pandoc
```

支持：

```text
DOCX
EPUB
LaTeX
RTF
OpenDocument
```

Typora 自身目前也通过 Pandoc 扩展 Word、RTF 等更多导出格式。

Pandoc 不作为第一版必装 dependency。

检测：

```text
system pandoc
```

不存在时：

```text
提示安装
```

---

# 50. 文件导航

Left Sidebar：

```text
Files
Outline
```

Files 支持：

```text
Tree
List

Rename

Delete

New File

New Folder

Duplicate

Reveal
```

支持过滤：

```text
Markdown only

Show hidden

Show all files

custom glob
```

这是对标 Typora 1.14 当前 Sidebar filter 能力。

---

# 51. Outline

根据：

```text
Markdown Heading
```

生成。

支持：

```text
Collapse

Current Heading Highlight

Search

Click to Jump
```

Typora 当前 Outline 同样支持 heading navigation、当前 heading 高亮、搜索以及 collapsible structure。

---

# 52. Quick Open

使用：

```text
rg --files
```

或者 Rust filesystem index。

在打开 Workspace 时后台建立：

```text
FileIndex
```

Command Palette 输入：

```text
read
```

进行 fuzzy match。

目标：

```text
10 万文件下输入无明显卡顿
```

搜索工作必须离开 Vue main thread。

---

# 53. Settings 配置结构

建议：

```ts
interface AppSettings {
  schemaVersion: number

  general: GeneralSettings

  editor: EditorSettings

  markdown: MarkdownSettings

  appearance: AppearanceSettings

  ai: AISettings

  knowledge: KnowledgeSettings

  skills: SkillSettings

  mcp: MCPSettings

  prompts: PromptSettings

  advanced: AdvancedSettings
}
```

不要创建：

```text
一个巨大的 settings store
```

Pinia store 按 domain 分开。

---

# 54. 日志

Rust 使用：

```text
tracing
```

区分：

```text
app.log
ai.log
search.log
```

API Keys 必须 redact。

例如：

```text
Authorization: ***
x-api-key: ***
```

AI request log 默认：

```text
不记录完整 prompt
```

Debug 模式才可显式开启。

---

# 55. GitHub Repository

最终：

```text
github.com/<owner>/y-editor
```

Public repository。

README 包含：

```text
Screenshot

Features

Installation

Portable Downloads

Development

Architecture

Roadmap

License
```

---

# 56. GitHub Actions

两个 workflow：

```text
ci.yml
release.yml
```

---

# 57. CI

所有 Pull Request：

```text
pnpm install

pnpm lint
pnpm typecheck
pnpm test

cargo fmt --check
cargo clippy
cargo test

pnpm build
```

禁止 CI 使用真实 AI API Key。

AI Provider tests 使用：

```text
Mock Server
```

分别模拟：

```text
OpenAI-compatible
Anthropic-compatible
```

---

# 58. Release Pipeline

触发：

```yaml
on:
  push:
    tags:
      - "v*"
```

构建：

```text
macOS arm64

Windows amd64
```

使用：

```text
tauri-apps/tauri-action
```

官方 action 可以创建 GitHub Release 并上传 Tauri artifact。

---

# 59. Portable Release 形式

用户要求的“portable”定义为：

### Windows

```text
y-editor-windows-amd64-portable.zip
```

内容：

```text
y-editor.exe
sidecars/
resources/
```

解压即运行。

### macOS ARM64

```text
y-editor-macos-arm64.app.zip
```

解压：

```text
y-editor.app
```

直接运行。

不要尝试发布单独 macOS executable。

macOS GUI 标准形式是 `.app` application bundle。

---

# 60. 关于 Tauri Portable 的重要约束

Tauri 官方目前明确说明：

```text
portable mode 并非正式支持的标准发行形式
```

`tauri-action` 虽然支持上传 unbundled binary，但官方尤其提醒非 Windows 平台不存在通用 GUI standalone binary 形式。

因此 y-editor 自己定义：

```text
Portable ZIP
```

而不是依赖 Tauri 所谓 portable target。

---

# 61. macOS Signing

如果暂时没有 Apple Developer Certificate：

至少：

```text
ad-hoc sign
```

Tauri 官方 CI 指南特别建议 Apple Silicon 的 GitHub release 在没有正式证书时配置 ad-hoc signing，避免系统把下载的应用判定为 damaged。

正式发布后支持：

```text
Developer ID
Notarization
```

---

# 62. Windows Signing

第一阶段允许：

```text
unsigned portable
```

README 明确 SmartScreen 提示。

后续接：

```text
Authenticode
```

GitHub Secret：

```text
WINDOWS_CERTIFICATE
WINDOWS_CERTIFICATE_PASSWORD
```

---

# 63. Sidecar Packaging

需要两个基础 sidecar：

```text
ripgrep
Pi
```

Tauri `externalBin` 根据 target triple 自动寻找对应 binary，例如 Apple Silicon 与 Windows x64 分别使用不同 suffix。

CI 构建前执行：

```text
scripts/fetch-sidecars.ts
```

根据：

```text
target
version
SHA256
```

下载。

版本必须：

```text
pin
```

不要构建时自动拿 `latest`。

---

# 64. Dependency Lock

对于：

```text
Vditor
Pi
Mermaid
ripgrep
Tauri
```

全部明确版本。

创建：

```text
DEPENDENCIES.md
```

记录：

```text
Current Version

Why

Upgrade Notes

Patch Status
```

尤其：

```text
Vditor
```

不能随意升级，因为存在 Patch Layer。

---

# 65. 开发阶段

## Phase 0：Skeleton

目标：

```text
可启动
可构建
CI 正常
```

完成：

```text
Tauri 2
Vue 3
TypeScript
Pinia

Rust commands

GitHub Actions basic
```

验收：

```text
macOS
Windows

dev
build
```

都通过。

---

## Phase 1：Markdown MVP

完成：

```text
Open File

Open Folder

Vditor IR

Save

Autosave

File Tree

Outline

Theme

Settings

Recent Files

Basic Shortcuts
```

验收：

```text
可以作为普通 Typora-like Markdown 编辑器日常使用
```

---

## Phase 2：Typora Parity

完成：

```text
Focus Mode
Typewriter

Floating Toolbar

Search / Replace

Global Search

Quick Open

Images

Math

Mermaid

Source Mode

Theme Editor

Word Count

Recovery

Export HTML/PDF
```

每完成一个功能更新：

```text
TYPORA_PARITY.md
```

---

## Phase 3：AI Core

完成：

```text
Pi RPC

OpenAI-compatible

Anthropic-compatible

AI Sidebar

Streaming

Session

Current File Context

Selection Context

Read-only Workspace Agent
```

验收：

```text
AI 可以阅读和回答当前 Markdown 内容
AI 可以检索 Workspace
AI 默认不能修改文件
```

---

## Phase 4：AI Editing

实现：

```text
propose_patch

Diff UI

Accept / Reject

Document Version Check

Multi-file Markdown Edit
```

验收：

```text
AI 能安全修改当前文件

AI 能安全修改 Workspace 中多个 Markdown

任何修改都可以审查
```

---

## Phase 5：AI Resources

实现：

```text
Knowledge Base

Repositories

Skills

Prompt Presets

Pi Import

Claude Import

Codex Import
```

---

## Phase 6：MCP

实现：

```text
MCP Manager

stdio

HTTP

Tool discovery

Per-session Enable

Pi Extension bridge
```

---

## Phase 7：Production

完成：

```text
Portable

Signing

Crash logs

Benchmark

Release Pipeline

Documentation
```

---

# 66. 第一版明确不做

避免无限扩 scope。

第一版不要求：

```text
实时多人协作

云同步

账号体系

移动端

在线市场

浏览器版本

完整 Notion Block Editor

数据库 Block

Sub Agents

自有 AI Proxy Service
```

这些以后单独做 ADR。

---

# 67. 测试体系

Frontend：

```text
Vitest

Vue Test Utils
```

重点测试：

```text
Settings

Command Registry

AI Store

Theme

EditorAdapter
```

Rust：

```text
cargo test
```

重点：

```text
File atomic write

Workspace boundaries

Search parsing

Path normalization

Settings migration

AI process lifecycle
```

---

# 68. Editor Regression Tests

准备固定 fixtures：

```text
basic.md

table.md

math.md

mermaid.md

images.md

yaml.md

html.md

large-1mb.md
large-5mb.md
```

每次 Vditor upgrade 自动跑。

---

# 69. AI Contract Tests

模拟：

```text
OpenAI compatible endpoint
```

测试：

```text
stream
tool call
error
timeout
invalid JSON
429
```

模拟：

```text
Anthropic compatible endpoint
```

测试同样能力。

---

# 70. 安全约束

所有 Agent 必须遵守：

```text
Frontend 无任意 Shell 权限

Frontend 无任意 filesystem 权限

Workspace path 全部 canonicalize

禁止 ../../ 逃逸

AI write 必须验证 allowed roots

MCP 属于不可信扩展

Skill 属于不可信指令

API Keys 不进入日志

HTML 默认 sanitize

外部 URL 通过 opener
```

Tauri shell plugin 本身支持 command/argument allowlist，应严格配置 sidecar scope，而不是放开任意 shell command。

---

# 71. Markdown HTML 安全

如果 Markdown 包含：

```html
<script>
```

默认：

```text
不执行
```

HTML renderer：

```text
sanitize
```

用户可以选择：

```text
Allow Unsafe HTML
```

但必须属于 Advanced Setting。

---

# 72. MCP 安全

每个 MCP Server 首次启用时展示：

```text
command

args

environment

working directory

tools
```

用户确认后才启用。

不自动扫描后直接运行：

```text
Claude MCP
Codex MCP
```

迁移只复制配置。

---

# 73. Agent 开发规则

根目录建立：

```text
AGENTS.md
```

要求所有开发 Agent：

1. 开始工作前阅读 `docs/IMPLEMENTATION_PLAN.md`。
2. 再阅读相关 ADR。
3. 不允许私自替换核心技术栈。
4. 不允许绕过 `EditorAdapter` 直接依赖 Vditor。
5. 不允许 Vue 直接执行 shell。
6. 不允许把 Secret 写入普通 settings。
7. 新功能必须有测试。
8. 修改公共架构必须新增 ADR。
9. 修改设置结构必须增加 migration。
10. 修改 Vditor Patch 必须更新 `PATCHES.md`。
11. 完成 Typora 功能必须更新 `TYPORA_PARITY.md`。
12. 完成任务后必须执行项目检查。

检查：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cargo fmt --check
cargo clippy
cargo test
```

---

# 74. Agent 任务粒度

禁止给 Agent：

```text
实现 y-editor
```

这种超大型任务。

应拆成：

```text
TASK-001 Bootstrap Tauri/Vue

TASK-002 EditorAdapter

TASK-003 Vditor IR

TASK-004 File Open/Save

TASK-005 File Tree

TASK-006 Settings Framework

...

TASK-030 Pi RPC

TASK-031 AI Sidebar

TASK-032 Provider Settings
```

每个任务必须有：

```text
Goal

Scope

Non-goals

Files

Acceptance Criteria

Tests
```

---

# 75. ADR

重要技术决策全部进入：

```text
docs/ADR/
```

例如：

```text
0001-use-vditor.md

0002-use-pi-agent.md

0003-ai-write-review.md

0004-use-ripgrep.md

0005-theme-system.md

0006-portable-distribution.md
```

这样后面的 Agent 不会重新争论：

```text
Milkdown 还是 Vditor？
```

这类已经确定的问题。

---

# 76. 项目编码原则

TypeScript：

```text
strict = true
```

禁止：

```text
any
```

除非明确说明原因。

Rust：

```text
rustfmt
clippy
```

错误使用：

```text
thiserror
```

Application boundary：

```text
Result<T, AppError>
```

避免：

```text
unwrap()
```

进入业务路径。

---

# 77. 前端 State Boundary

Pinia store 建议：

```text
workspaceStore

documentStore

editorStore

settingsStore

themeStore

aiStore

knowledgeStore
```

不要建立：

```text
appStore
```

然后塞所有状态。

---

# 78. Rust API Boundary

Tauri command 不直接：

```text
做全部业务
```

例如：

```rust
#[tauri::command]
async fn search_workspace(...) {
    search_service.search(...).await
}
```

而不是在 command 函数中写完整 ripgrep orchestration。

---

# 79. MVP 完成定义

满足以下条件才称为：

```text
0.1.0
```

用户能够：

```text
打开一个目录

浏览 Markdown 文件

使用类似 Typora 的 IR 编辑

切换 Theme

调整字体字号

查看 Outline

全文搜索

快速打开文件

自动保存

使用 Mermaid

使用 Math

打开 Settings

连接 OpenAI / Anthropic compatible model

在 AI Sidebar 对话

让 AI 阅读当前文件

让 AI 搜索 Workspace

让 AI 提议修改 Markdown

查看 Diff

接受修改
```

并且 GitHub tag：

```text
v0.1.0
```

自动发布：

```text
y-editor-macos-arm64.app.zip

y-editor-windows-amd64-portable.zip
```

---

# 80. 0.2.0 目标

```text
Knowledge Base

Skills

Prompt Presets

Multi Repository

Claude / Codex / Pi migration
```

---

# 81. 0.3.0 目标

```text
MCP

Hybrid RAG

Advanced Theme Editor

Pandoc Export

Full Typora parity cleanup
```

---

# 82. 最终架构决策摘要

固定技术方案：

```text
Desktop
    Tauri 2

Frontend
    Vue 3
    TypeScript
    Pinia
    Vite

Markdown
    Vditor IR

Editor Integration
    EditorAdapter
    Vditor Patch Layer

Mermaid
    Custom Renderer

Search
    ripgrep Sidecar

Backend
    Rust

AI
    Pi Agent
    RPC Sidecar

Providers
    OpenAI-compatible
    Anthropic-compatible

Skills
    SKILL.md

Prompts
    Markdown Prompt Templates

MCP
    y-editor MCP Manager
    Pi Extension Bridge

Knowledge
    Rust Local Index

Secrets
    OS Credential Store

Distribution
    GitHub Releases

Targets
    macOS arm64
    Windows amd64

Artifacts
    .app.zip
    portable.zip
```

---

# 83. 最重要的实现顺序

不要先开发复杂 AI。

正确顺序：

```text
Tauri Skeleton
       ↓
Vditor
       ↓
文件系统
       ↓
Typora UX
       ↓
Settings
       ↓
Search
       ↓
Theme
       ↓
Pi Agent
       ↓
AI Editing
       ↓
Knowledge
       ↓
Skill
       ↓
Prompt
       ↓
MCP
       ↓
Migration
       ↓
Release
```

原因：

**y-editor 首先必须是一个优秀的 Markdown 编辑器，然后才是一个优秀的 AI Editor。**

AI 再强，如果基础 Markdown 编辑体验不如 Typora，产品定位就没有成立。

---

# 84. Agent 的第一个开发任务

第一张开发任务卡固定为：

```text
TASK-001 — Bootstrap y-editor
```

Goal：

创建可以在 macOS / Windows 编译的基础工程。

实现：

```text
Tauri 2

Vue 3

TypeScript

Vite

Pinia

Vditor

基础 Layout

Rust command example

CI
```

界面只要求：

```text
Left Sidebar

Editor

Right Sidebar

Status Bar
```

Vditor：

```text
mode: ir
```

加载一份 demo Markdown。

本阶段：

```text
不要实现 AI
不要实现 Knowledge
不要实现 MCP
不要实现 Theme Editor
```

Acceptance：

```text
pnpm dev

pnpm tauri dev

pnpm build

cargo test
```

成功。

GitHub Actions：

```text
CI green
```

以后再进入：

```text
TASK-002 EditorAdapter
```

---

# 85. 产品长期技术原则

y-editor 不应该成为：

```text
Vditor wrapper
```

也不应该成为：

```text
Pi Agent GUI
```

应该保持：

```text
           y-editor
         /          \
Editor Platform    AI Platform
      │                │
   Vditor            Pi Agent
```

Vditor 和 Pi 都只是：

```text
Replaceable Engine
```

上层：

```text
EditorAdapter
AgentAdapter
```

必须由 y-editor 自己掌控。

这样未来：

```text
Vditor → 自研 Editor
```

或者：

```text
Pi → 其他 Agent Runtime
```

都不会要求重写整个产品。
