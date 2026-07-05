# Biji Note 项目手册

## 目录结构

```
BIJI-rust/
├── biji-core/              # Rust 核心库 — 所有业务逻辑
│   ├── Cargo.toml
│   ├── migrations/         # SQLite 数据库迁移脚本
│   │   └── 001_init.sql    # 初始 schema（含 FTS5 全文搜索）
│   ├── src/
│   │   ├── lib.rs          # 入口：App 结构体，统一 API
│   │   ├── database/       # 数据库层
│   │   │   ├── mod.rs      # Database 结构体，note_from_row()
│   │   │   ├── connection.rs  # with_transaction() 工具
│   │   │   ├── note_repo.rs   # 笔记 CRUD
│   │   │   ├── folder_repo.rs # 文件夹 CRUD
│   │   │   ├── tag_repo.rs    # 标签 CRUD（含批量加载）
│   │   │   ├── link_repo.rs   # Wiki 链接管理 + 图谱数据
│   │   │   └── search.rs      # 全文搜索（FTS5 + LIKE 兜底）
│   │   ├── models/         # 数据模型
│   │   │   ├── mod.rs      # 重导出
│   │   │   ├── note.rs     # Note, NoteLink, SyncStatus, NoteFrontmatter
│   │   │   ├── folder.rs   # Folder
│   │   │   └── settings.rs # AppSettings, ThemeMode, Shortcuts 等
│   │   ├── services/       # 服务层
│   │   │   ├── mod.rs
│   │   │   ├── settings.rs   # 设置管理（JSON 持久化）
│   │   │   ├── encryption.rs # AES-256-GCM 加密
│   │   │   ├── git.rs        # Git 集成
│   │   │   ├── publish.rs    # 静态站点发布（Hugo/Astro/VitePress）
│   │   │   ├── import_export.rs  # Markdown/ZIP 导入导出
│   │   │   ├── sync.rs       # WebDAV 同步
│   │   │   ├── webdav.rs     # WebDAV HTTP 客户端
│   │   │   └── plugin.rs     # 插件管理
│   │   └── utils/         # 工具模块
│   │       ├── mod.rs       # 重导出 + slugify()
│   │       ├── errors.rs    # 统一错误类型
│   │       ├── markdown.rs  # Markdown 渲染（pulldown-cmark）
│   │       ├── wikilink.rs  # [[链接]] 解析与替换
│   │       └── frontmatter.rs  # YAML frontmatter 解析
│   └── tests/
│       └── integration.rs  # 集成测试（19 个测试用例）
│
├── biji-cli/              # Rust CLI 工具
│   ├── Cargo.toml
│   └── src/main.rs         # 命令行接口（clap）
│
├── biji-tauri/            # Rust Tauri 桌面壳
│   ├── Cargo.toml
│   ├── icons/              # 应用图标
│   └── src/
│       ├── lib.rs          # Tauri 入口 + 命令注册
│       └── commands/       # Tauri 命令
│           ├── io.rs       # 导入/导出
│           ├── sync.rs     # 同步
│           └── plugins.rs  # 插件
│
├── frontend/              # React 前端
│   ├── package.json        # 依赖声明
│   ├── vite.config.ts      # Vite 构建配置
│   ├── index.html          # HTML 入口
│   ├── themes/             # 主题文件（CSS 变量覆盖）
│   │   ├── biji-light.css
│   │   └── biji-dark.css
│   └── src/
│       ├── main.tsx        # 入口
│       ├── App.tsx         # 根组件 + 状态管理
│       ├── App.css         # 全局变量 + 布局 + 共享组件样式
│       ├── icons.tsx       # SVG 图标集中管理
│       ├── api/            # 后端适配层
│       │   ├── index.ts
│       │   ├── backend.ts     # 类型定义
│       │   ├── tauri-adapter.ts  # Tauri API 调用
│       │   └── mock-adapter.ts   # 开发模拟数据
│       └── components/     # React 组件
│           ├── Editor.tsx/css
│           ├── Sidebar.tsx/css
│           ├── Toolbar.tsx/css
│           ├── NoteList.tsx/css
│           ├── StatusBar.tsx/css
│           ├── RightPanel.tsx/css
│           ├── Outline.css
│           ├── SearchModal.tsx/css
│           ├── SettingsModal.tsx/css
│           ├── GraphView.tsx/css
│           ├── GitPanel.tsx/css
│           ├── PublishPanel.tsx/css
│           ├── Toast.tsx/css
│           ├── PomodoroTimer.tsx/css
│           ├── DraggableToggle.css
│           └── PluginManagerModal.tsx/css
│
├── target/                # Rust 编译产物（自动生成，gitignore）
│   ├── debug/             # cargo build/test 输出
│   ├── release/           # cargo build --release 输出
│   └── tmp/               # 临时编译文件
│
├── Cargo.toml             # Rust 工作空间配置
├── MANUAL.md              # 本手册
└── README.md              # （待补全）
```

## 各目录详细说明

### `biji-core/` — 核心库
不依赖任何 GUI 框架，可独立编译和测试。所有数据持久化、业务逻辑、加密、同步、发布等功能都在这里。

### `biji-tauri/` — Tauri 桌面壳
只负责：
- 注册 Tauri 命令（暴露给前端）
- 窗口管理
- 系统托盘
- 应用图标

不包含业务逻辑。

### `frontend/` — 前端 UI
Vite + React 18 构建，纯 CSS（无 Tailwind/SCSS）。样式系统使用 CSS 自定义属性实现主题化。

## 样式系统

### 设计令牌
所有颜色、间距、圆角、阴影都定义为 CSS 变量（`--bg-primary`、`--accent-color` 等），集中在 `App.css` 的 `:root` 和 `[data-theme='dark']` 中。

### 面板级定位
```css
[data-panel="left-sidebar"]   { /* 左侧栏 */ }
[data-panel="note-list"]      { /* 笔记列表 */ }
[data-panel="main-content"]   { /* 主区域 */ }
[data-panel="editor"]         { /* 编辑器 */ }
[data-panel="right-sidebar"]  { /* 右侧栏 */ }
```

### 自定义主题
用户可在设置中填写自定义 CSS，实时注入 `<head>`。主题只需覆盖 CSS 变量：
```css
:root {
  --bg-primary: #fafafa;
  --accent-color: #7c3aed;
}
```

完整的主题包可放在 `frontend/themes/` 目录下，参考 `biji-light.css`。

## 数据流

```
前端 (React)  →  api/index.ts  →  Tauri 命令  →  Rust 核心库  →  SQLite
                                    ↑                     ↑
                               biji-tauri/          biji-core/
```

- 前端通过 `api/index.ts` 调用后端，支持 Tauri 和 Mock 两种适配器
- Tauri 命令在 `biji-tauri/src/commands/` 中注册
- 命令调用 `biji-core` 中的业务逻辑
- 数据存储在 SQLite 数据库中（`biji.db`）

## 常用命令

```bash
# Rust 编译检查
cargo check --workspace

# 运行所有测试
cargo test -p biji-core

# 前端构建
cd frontend && pnpm run build

# 前端开发
cd frontend && pnpm run dev

# 清理编译器缓存
cargo clean
```
