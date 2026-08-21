# Biji Note — 跨平台笔记编辑器

> 支持双向链接、知识图谱、云同步、Git 版本控制、插件系统  
> Rust 核心 + 可分离前端架构

---

## 目录

- [项目概览](#项目概览)
- [架构设计](#架构设计)
- [快速开始](#快速开始)
  - [Web 浏览器模式](#1-web-浏览器模式推荐快速验证)
  - [CLI 命令行模式](#2-cli-命令行模式)
  - [桌面 App 模式](#3-桌面-app-模式完整功能)
- [CLI 命令参考](#cli-命令参考)
- [项目结构](#项目结构)
- [前后端分离适配层](#前后端分离适配层)
- [数据存储](#数据存储)
- [开发指南](#开发指南)
- [从原版迁移](#从原版迁移)
- [许可证](#许可证)

---

## 项目概览

Biji Note 是一款功能丰富的跨平台笔记编辑器，最初基于 Electron + React + TypeScript 构建。这是使用 **Rust + Tauri** 完全重构的版本，带来显著的性能提升和安全优势。

### 核心功能

| 功能 | 说明 |
|------|------|
| **双向链接** | `[[笔记标题]]` 语法创建笔记间关联，自动解析并持久化到数据库 |
| **知识图谱** | 可视化展示笔记间的关联关系，后端计算节点和边，前端 D3.js 渲染 |
| **Markdown 编辑** | 实时预览、编辑、预览三种模式，支持 YAML Frontmatter |
| **块级存储(M2)** | 笔记内容按段落/标题拆块入库，每块带 created_at/updated_at（块时间戳演变）与历史快照；编辑保存时自动拆块，检索按块命中 |
| **SQLite 存储** | 使用 SQLite + WAL 模式，高性能本地存储，支持 FTS5 全文搜索 |
| **WebDAV 同步** | 支持 Nextcloud、坚果云等 WebDAV 兼容服务 |
| **Git 版本控制** | 基于 libgit2，支持 init/commit/log/diff/restore |
| **加密服务** | AES-256-GCM 加密，自动生成密钥 |
| **插件系统** | 内置插件（番茄钟、云同步）+ 外部 UI 插件 |
| **静态站点发布** | 一键发布到 Hugo/Astro/VitePress |
| **Markdown 导入导出** | 递归目录导入/导出，保留文件夹结构 |

### 技术对比

| 维度 | 原版 (Electron) | 重构版 (Rust + Tauri) |
|------|----------------|----------------------|
| 打包体积 | ~150MB | ~10MB |
| 内存占用 | ~200MB | ~50MB |
| 启动速度 | ~3s | ~0.5s |
| 后端语言 | Node.js/TypeScript | Rust |
| 数据库驱动 | better-sqlite3 | rusqlite (Rust 原生) |
| Git 集成 | child_process 调用 CLI | libgit2 原生绑定 |
| 加密 | crypto (Node.js) | aes-gcm (Rust crate) |
| 跨平台 | Windows/macOS/Linux | Windows/macOS/Linux |

### 与主流笔记软件对比(2026-08-19 用户确认定位)

**BIJI 的定位一句话:Obsidian 的布局 + Logseq 的块级 + 本地优先的 Rust 内核 —— 「集各家所长」,身位在 Obsidian 与 Logseq 之间,并独有块时间戳。**

| | **BIJI** | **Obsidian** | **Logseq** | **Notion** |
|---|---|---|---|---|
| **本质** | 本地优先的块级笔记 | 本地优先的链接笔记 | 大纲/块级笔记 | 云端块数据库 |
| **核心模型** | 块(带时间戳) | 文档 + 双向链接 | 大纲块 | 块 + 数据库视图 |
| **数据** | 本地 SQLite | 本地 Markdown 文件 | 本地文件 | 云端 |
| **块时间戳** | ✅ 独有 | ❌ | ❌ | ❌ |
| **工作区** | Obsidian 式分栏(左库/主编辑/右 dock 模块化) | 分栏王者 | 简单 | 简单 |
| **插件生态** | 克制版能力插件(起步) | 海量 | 一般 | 丰富 |
| **成熟度** | 0.1.x 开发中 | 极成熟 | 成熟 | 成熟 |

**诚实结论**:
- 理念上 BIJI 是"升级版 Obsidian"——Obsidian 能做的它都有,还多了块级编辑 + 块时间戳(Obsidian 与 Logseq 未合体之处)
- 生态与成熟度还差得远——Obsidian 十年积累 + 上千插件;BIJI 插件才起步、桌面壳待落地
- 不是"碾压",是走一条更激进的路:Obsidian 赢生态,BIJI 赢架构(块时间戳 + Rust 性能 + 可插件化内核)

### 项目自述(2026-08-19 作者自述,定位与愿景)

> Logseq 的块级概念很不错,但是文件夹结构混乱,后续维护属于地狱级别。
>
> Obsidian 的文件管理很不错,插件很丰富。但是没有时间戳功能。我认为笔记软件时间标注功能很重要。记录你的来处与去处。
>
> 有人会说文件管理功能是个很好的优点吗?Logseq 不就是要干掉这个文件管理功能,专注于记笔记本身而不是维护笔记吗?你说的对。但是我认为那是以前——做好索引,以及做好标签管理,加上 AI 辅助,我认为是可以很好地避免这个维护困难的问题的。
>
> 若要专注于写作,后续也可以考虑加一个界面,或者写作模式,现有的界面改为维护模式。

**愿景提炼**:BIJI = 块级 + 时间戳 + 索引/标签管理 + AI 辅助(避免维护地狱),兼顾 Logseq 的专注与 Obsidian 的可维护;未来分化「写作模式」与「维护模式」双界面。

---

## 架构设计

### 三层分离架构

```
┌──────────────────────────────────────────────────────────────┐
│                       前端层 (可更换)                          │
│                                                              │
│   ┌─────────────────┐  ┌──────────────────┐  ┌──────────┐   │
│   │  React Web UI   │  │  CLI (终端)       │  │ 未来:    │   │
│   │  (Tauri WebView  │  │                  │  │ Flutter/ │   │
│   │   或纯浏览器)     │  │                  │  │ 其他 GUI │   │
│   └────────┬────────┘  └────────┬─────────┘  └─────┬────┘   │
│            │                    │                    │        │
│      ┌─────┴─────┐       直接调用              ┌────┴────┐  │
│      │ IPC 桥接   │       App::init()           │ HTTP    │  │
│      │ (Commands) │                            │ Server  │  │
│      └─────┬─────┘                             └────┬────┘  │
├────────────┼──────────────────────────────────────────┼──────┤
│            ▼                                          ▼      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   biji-core (Rust 库)                    │ │
│  │                                                         │ │
│  │  ┌────────────────┐  ┌──────────────────┐              │ │
│  │  │  models/       │  │  database/        │              │ │
│  │  │  • Note/Folder │  │  • rusqlite       │              │ │
│  │  │  • Settings    │  │  • 链接解析存储    │              │ │
│  │  │  • Plugin      │  │  • FTS5 搜索      │              │ │
│  │  │  • Graph/Sync  │  │  • 标签管理       │              │ │
│  │  └────────────────┘  └──────────────────┘              │ │
│  │                                                         │ │
│  │  ┌────────────────┐  ┌──────────────────┐              │ │
│  │  │  services/      │  │  utils/          │              │ │
│  │  │  • Sync/WebDAV  │  │  • Wikilink 解析 │              │ │
│  │  │  • Git (git2)   │  │  • Markdown 渲染 │              │ │
│  │  │  • Encryption   │  │  • 统一错误类型  │              │ │
│  │  │  • Publish      │  │                  │              │ │
│  │  │  • Import/Export│  │                  │              │ │
│  │  │  • Plugin Mgr   │  │                  │              │ │
│  │  └────────────────┘  └──────────────────┘              │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 设计原则

1. **biji-core 是纯业务逻辑库** — 不依赖 Tauri、不依赖任何 GUI 框架，可以独立测试、独立发布为 crate
2. **前端通过 BackendAdapter 接口通信** — 更换前端（Web/CLI/桌面/移动端）只需实现适配器
3. **CLI 和 GUI 共用同一套 App::init()** — CLI 不是简化版，是完整功能的终端入口

### 依赖关系

```
biji-tauri  ──depends on──►  biji-core  ◄──depends on──  biji-cli
     │                            │
     │  (Tauri IPC)               │  (直接函数调用)
     ▼                            ▼
  React UI                    CLI 终端
```

**核心库 `biji-core` 可以被任意前端复用**，只需实现 `BackendAdapter` 接口。

---

## 快速开始

### 四种运行模式

Biji Note 支持四种运行模式，前端代码完全一致，只需切换后端适配器：

| 模式 | 后端适配器 | 数据持久 | 启动命令 |
|------|-----------|----------|----------|
| 🖥️ **桌面 App** | `TauriBackend` (IPC) | ✅ SQLite | `cargo tauri dev` |
| 🌐 **纯 Web** | `HttpBackend` (REST) | ✅ SQLite | `pnpm dev` + `cargo run` (HTTP) |
| 🧪 **开发/演示** | `MockBackend` (内存) | ❌ 刷新丢失 | `pnpm dev` |
| 💻 **终端 CLI** | 直接调用 `biji-core` | ✅ SQLite | `cargo run -p biji-cli -- list` |

切换后端只需改 `frontend/src/api/index.ts` 一行代码。

### 1. 🧪 Web 浏览器模式（快速体验界面）

不需要安装 Rust，不需要编译，直接在浏览器中运行：

```bash
cd frontend
pnpm install
pnpm run dev
```

浏览器打开 **http://localhost:5173**

> 此模式使用 `MockBackend`，数据存储在浏览器内存中，刷新页面会重置。  
> 用于快速体验界面布局和功能逻辑。

### 2. 💻 CLI 命令行模式

需要安装 Rust 工具链（https://rustup.rs）：

```bash
# 编译并运行 CLI
cargo run -p biji-cli -- list
cargo run -p biji-cli -- new "Hello World"
cargo run -p biji-cli -- status
```

> CLI 和桌面 App 共享同一份数据（存储在系统数据目录），数据不会丢失。

### 3. 🖥️ 桌面 App 模式（完整功能）

需要安装 Tauri 系统依赖，然后一次启动：

```bash
# 开发模式
cargo tauri dev

# 构建安装包
cargo tauri build
```

### 4. 🌐 纯 Web 模式（未来扩展）

添加一个 `HttpBackend` + Rust HTTP Server，前端变成纯 Web 应用：

```typescript
// frontend/src/api/http-adapter.ts
export class HttpBackend implements BackendAdapter {
  async getNotes() {
    const res = await fetch('http://localhost:8080/api/notes');
    return res.json();
  }
  // ...
}
```

```rust
// biji-server/src/main.rs
use actix_web::{web, App, HttpServer};

async fn get_notes(app: web::Data<biji_core::App>) -> impl Responder {
    web::Json(app.db.get_all_notes(false).unwrap())
}
```

```bash
# 一次性启动
cargo tauri dev

# 或分步操作
cd frontend && pnpm install && cd ..
cargo tauri dev
```

需要安装 Tauri 系统依赖：
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- **macOS**: 无需额外依赖
- **Windows**: 无需额外依赖

---

## CLI 命令参考

```bash
biji new <title>              # 创建新笔记
biji list                     # 列出所有笔记
biji search <keyword>         # 搜索笔记
biji show <id>                # 查看笔记内容
biji delete <id>              # 删除笔记（移入回收站）
biji restore <id>             # 恢复已删除笔记
biji folder                   # 列出所有文件夹
biji sync                     # 触发 WebDAV 同步
biji status                   # 显示应用状态
biji import <path>            # 从 Markdown 目录导入
biji export <path>            # 导出到 Markdown 目录
biji start                    # 启动桌面 GUI（如有安装）
```

### 使用示例

```bash
# 创建笔记
$ cargo run -p biji-cli -- new "Rust 学习笔记"
Created note: Rust 学习笔记 (550e8400-e29b-41d4-a716-446655440000)

# 列出笔记
$ cargo run -p biji-cli -- list
Total: 3 notes

[2026-06-29] Rust 学习笔记
[2026-06-28] 会议记录
[2026-06-27] 每日日志

# 搜索笔记
$ cargo run -p biji-cli -- search Rust
Found 1 notes:

- Rust 学习笔记 (550e8400)

# 查看应用状态
$ cargo run -p biji-cli -- status
Biji Note Status
================
Database:  ./biji.db
Notes:     3
Folders:   1
Sync:      disabled
Theme:     System

Recent notes:
  - Rust 学习笔记
  - 会议记录
  - 每日日志

# 导入 Markdown 笔记
$ cargo run -p biji-cli -- import ~/Documents/notes
Imported 42 notes from /home/user/Documents/notes
```

---

## 项目结构

```
biji-rust/
│
├── Cargo.toml                    # Rust 工作区配置
├── package.json                  # 工作区脚本（tauri dev 等）
├── pnpm-workspace.yaml           # pnpm 构建策略配置
├── .gitignore
├── README.md                     # ← 你正在看这个
│
├── biji-core/                    # ★ 核心库 — 纯 Rust，零框架依赖
│   ├── Cargo.toml
│   ├── migrations/
│   │   ├── 001_init.sql          # 初始 schema（notes/folders/links/tags + FTS5）
│   │   └── 002_blocks.sql        # M2 块级存储：blocks + block_history 表
│   └── src/
│       ├── lib.rs                # App 结构体：所有功能的统一入口
│       ├── models/               # 数据结构，对应 TypeScript types.ts
│       │   ├── mod.rs
│       │   ├── note.rs           # Note, SyncStatus, NoteFrontmatter, NoteLink
│       │   ├── block.rs          # M2：Block, BlockHistory, BlockType, ChangeType, BlockSearchResult
│       │   ├── folder.rs         # Folder
│       │   ├── settings.rs       # AppSettings, ThemeMode, ShortcutSettings
│       │   ├── plugin.rs         # Plugin, UIPluginManifest, PluginPosition
│       │   ├── graph.rs          # GraphData, GraphNode, GraphEdge
│       │   ├── sync.rs           # SyncResult, SyncStatus, WebDAVConfig
│       │   └── search.rs         # SearchQuery, SearchMode(标题/内容双模式)
│       ├── database/             # 数据持久化层
│       │   ├── mod.rs            # Database 结构体：连接管理
│       │   ├── connection.rs     # 事务辅助函数
│       │   ├── migrations.rs     # 版本化迁移（PRAGMA user_version）+ 存量笔记自动拆块
│       │   ├── note_repo.rs      # 笔记 CRUD + 搜索 + 批量操作
│       │   ├── block_repo.rs     # M2：块 CRUD / 历史 / 排序 / 按块搜索
│       │   ├── folder_repo.rs    # 文件夹 CRUD
│       │   ├── link_repo.rs      # [[链接]] 解析 + 存储 + 反向链接
│       │   ├── tag_repo.rs       # 标签管理 + note_tags 关联
│       │   └── search.rs         # FTS5 / LIKE 降级搜索 + 双模式检索入口
│       ├── services/             # 业务服务层
│       │   ├── mod.rs
│       │   ├── block_service.rs  # M2：块 CRUD（时间戳+历史快照）+ 整篇保存拆块 diff
│       │   ├── settings.rs       # JSON 文件读写配置管理
│       │   ├── encryption.rs     # AES-256-GCM 加解密
│       │   ├── sync.rs           # 同步协调器
│       │   ├── webdav.rs         # WebDAV 客户端 (PROPFIND/PUT/GET/DELETE)
│       │   ├── git.rs            # Git 操作 (git2)
│       │   ├── publish.rs        # 静态站点发布 (Hugo/Astro/VitePress)
│       │   ├── import_export.rs  # Markdown 文件导入导出
│       │   └── plugin.rs         # 插件管理 (内置 + 外部)
│       └── utils/                # 工具函数
│           ├── mod.rs
│           ├── errors.rs         # 统一错误类型 (thiserror)
│           ├── markdown.rs       # Markdown → HTML 渲染 + 标题提取
│           ├── blocks.rs         # M2：拆块规则（段落/标题/列表/引用/代码）
│           └── wikilink.rs       # [[Wiki 链接]] 解析 + HTML 替换
│
├── biji-tauri/                   # ★ Tauri 桌面应用壳
│   ├── Cargo.toml
│   ├── build.rs                  # tauri-build
│   ├── tauri.conf.json           # 窗口配置、构建配置
│   ├── capabilities/
│   │   └── default.json          # Tauri v2 权限声明
│   └── src/
│       ├── main.rs               # 入口点 → 调用 lib::run()
│       ├── lib.rs                # Tauri Builder + AppState + 命令注册
│       └── commands/             # 薄 IPC 命令层（每个命令 ≤5 行）
│           ├── mod.rs
│           ├── notes.rs          # get_notes, get_note, save_note...
│           ├── folders.rs        # get_folders, save_folder, delete_folder
│           ├── settings.rs       # get_settings, set_settings
│           ├── sync.rs           # sync_start, sync_status
│           ├── git.rs            # git_init, git_status, git_commit, git_log
│           ├── publish.rs        # publish_site, check_generator
│           ├── plugin.rs         # get_plugins, toggle_plugin
│           └── io.rs             # import_markdown, export_markdown
│
├── biji-cli/                     # ★ CLI 命令行工具
│   ├── Cargo.toml                # 依赖 biji-core + clap
│   └── src/
│       └── main.rs               # clap 解析 + 12 个子命令
│
├── frontend/                     # ★ React 前端（可独立部署）
│   ├── package.json
│   ├── pnpm-workspace.yaml       # 允许 esbuild 构建脚本
│   ├── .npmrc
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx              # React 入口
│       ├── App.tsx               # 主应用组件（三栏布局）
│       ├── App.css               # 全局样式（亮/暗主题）
│       └── api/                  # ★ 前后端分离适配层
│           ├── backend.ts        # BackendAdapter 抽象接口 + 类型定义
│           ├── index.ts          # 自动选择适配器
│           ├── tauri-adapter.ts  # Tauri IPC 实现
│           └── mock-adapter.ts   # 浏览器内存实现（开发/演示用）
│
└── README.md
```

---

## 前后端分离适配层

### BackendAdapter 接口

`frontend/src/api/backend.ts` 定义了一个统一的后端抽象接口，包含所有前端需要调用的方法：

```typescript
export interface BackendAdapter {
  // === 笔记 ===
  getNotes(includeDeleted?: boolean): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  saveNote(note: Note): Promise<void>;
  deleteNote(id: string, permanent?: boolean): Promise<void>;
  searchNotes(query: SearchQuery): Promise<Note[]>;
  getGraphData(): Promise<GraphData>;

  // === 文件夹 ===
  getFolders(includeDeleted?: boolean): Promise<Folder[]>;
  saveFolder(folder: Folder): Promise<void>;
  deleteFolder(id: string, permanent?: boolean): Promise<void>;

  // === 设置 ===
  getSettings(): Promise<AppSettings>;
  setSettings(settings: AppSettings): Promise<void>;

  // === 同步 ===
  syncStart(config: WebDAVConfig): Promise<SyncResult>;
  syncStatus(): Promise<SyncStatus>;

  // === Git ===
  gitInit(): Promise<boolean>;
  gitStatus(): Promise<GitStatus>;
  gitCommit(message: string): Promise<string | null>;
  gitLog(count?: number): Promise<GitLogEntry[]>;

  // === 发布 ===
  publishSite(config: PublishConfig): Promise<PublishResult>;
  checkGenerator(generator: string): Promise<[boolean, string | null]>;

  // === 导入导出 ===
  importMarkdown(path: string): Promise<ImportResult>;
  exportMarkdown(path: string): Promise<ImportResult>;

  // === 插件 ===
  getPlugins(): Promise<Plugin[]>;
  togglePlugin(id: string, enabled: boolean): Promise<void>;

  // === 事件（菜单快捷键、后端通知前端） ===
  onMenuEvent(event: string, callback: () => void): () => void;
}
```

### 切换后端

在 `frontend/src/api/index.ts` 中，根据运行时环境自动选择适配器：

```typescript
export const backend: BackendAdapter = isTauri()
  ? new TauriBackend()     // 桌面 App
  : new MockBackend();      // 浏览器演示
```

### 添加新前端

只需要实现 `BackendAdapter` 接口即可。例如纯 Web 版：

```typescript
// frontend/src/api/http-adapter.ts
export class HttpBackend implements BackendAdapter {
  private base = 'http://localhost:8080/api';

  async getNotes(): Promise<Note[]> {
    const res = await fetch(`${this.base}/notes`);
    return res.json();
  }
  // ... 其余方法类似
}
```

然后在 Rust 侧加一个 HTTP Server 包装 `biji-core`：

```rust
// biji-server/src/main.rs（新 crate）
use actix_web::{web, App, HttpServer, Responder};

async fn get_notes(app: web::Data<biji_core::App>) -> impl Responder {
    web::Json(app.db.get_all_notes(false).unwrap())
}

#[actix_web::main]
async fn main() {
    let data_dir = std::path::PathBuf::from(".");
    let app = biji_core::App::init(&data_dir).unwrap();

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(app.clone()))
            .route("/api/notes", web::get().to(get_notes))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
```

---

## 数据存储

### 数据库

数据存储在系统标准数据目录下的 `biji-note/biji.db`：

| 平台 | 路径 |
|------|------|
| Linux | `~/.local/share/biji-note/biji.db` |
| macOS | `~/Library/Application Support/biji-note/biji.db` |
| Windows | `C:\Users\<用户>\AppData\Roaming\biji-note\biji.db` |

### 数据库表结构

```sql
notes           -- 笔记主表（含软删除、同步状态；内容/元数据保留，块归属 note）
blocks          -- 块表(M2)：笔记内容按段落/标题拆块，每块 {type, content, created_at, updated_at, sort_order}
block_history   -- 块历史表(M2)：每次变更 {内容快照, changed_at, change_type(create/update/delete)}
folders         -- 文件夹（树形结构，parent_id 引用）
links           -- 双向链接关系（source_id → target_title）
tags            -- 标签唯一表
note_tags       -- 笔记-标签多对多关联
```

#### M2 块级存储说明

- **真相源**:SQLite 中 `blocks` 表;导出时才生成文件夹(Obsidian 式布局,M4)
- **拆块规则**(`utils/blocks.rs`):frontmatter 剥离;空行分隔;标题/列表项单行成块;连续引用/围栏代码合并;连续行合并为段落
- **块时间戳演变**:每块 `created_at`(创建)不可变,`updated_at`(更新)每次编辑覆盖;整段替换 = 一个 update = 盖一个时间戳
- **历史快照**:`update_block`/`delete_block` 先写 `block_history`(快照 = 变更前内容);块被硬删后历史行保留(block_id 置 NULL),审计轨迹不丢
- **迁移**:`PRAGMA user_version` 版本化;002 迁移对存量笔记首次自动拆块(notes.content 保留原内容完整)
- **检索双模式**:标题模式搜 `notes.title` 返回笔记;内容模式搜 `blocks.content` 返回块级命中(命中块 + 所在笔记 + 片段)
- **编辑链路**:前端整篇编辑保存 → 后端 `sync_note_blocks` 拆块 + 位置对齐 diff(同内容跳过 / 不同 update / 多出 create / 少了 delete)→ 只盖变更块时间戳

### 设置文件

`settings.json` — 包含所有应用设置、主题、快捷键、同步凭据等。

### 插件目录

`plugins/` — 外部 UI 插件的 `manifest.json` + `main.js` 文件。

---

## 开发指南

### 前提条件

```bash
# Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js 18+
# 推荐使用 nvm: https://github.com/nvm-sh/nvm

# pnpm
npm install -g pnpm

# Tauri 系统依赖（Linux）
sudo apt install libwebkit2gtk-4.1-dev build-essential \
  curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

### 常用命令

```bash
# 运行前端开发服务器（浏览器模式）
cd frontend && pnpm run dev

# 编译所有 Rust crate
cargo build --workspace

# 运行 CLI
cargo run -p biji-cli -- list

# 运行测试
cargo test -p biji-core

# 运行桌面 App（需要前端已构建）
cargo tauri dev

# 打包桌面 App
cargo tauri build
```

### 代码规范

```bash
# Rust 代码格式化
cargo fmt

# Rust 代码检查
cargo clippy

# 运行所有测试
cargo test
```

### 添加新功能

1. 在 `biji-core/src/models/` 中定义数据结构
2. 在 `biji-core/src/database/` 中实现数据持久化
3. 在 `biji-core/src/services/` 中实现业务逻辑
4. 在 `biji-tauri/src/commands/` 中添加 Tauri 命令
5. 在前端的 `BackendAdapter` 接口中添加方法签名
6. 更新 `TauriBackend` 和 `MockBackend` 实现

---

## 从原版迁移

原版项目是 Electron + React + TypeScript + better-sqlite3。

### 数据迁移

新版直接使用与原版相同的 SQLite schema，`biji.db` 文件可以直接复用：

```bash
# 将原版数据库复制到新版数据目录
cp ~/.config/biji-note/biji.db ~/.local/share/biji-note/biji.db
```

### 迁移要点

| 原版模块 | 迁移到 | 说明 |
|----------|--------|------|
| `sqlite-database.ts` | `biji-core/src/database/` | SQL → Rust，schema 不变 |
| `settings-manager.ts` | `biji-core/src/services/settings.rs` | JSON 文件读写，逻辑一致 |
| `encryption.ts` | `biji-core/src/services/encryption.rs` | AES-256-GCM，算法不变 |
| `sync-manager.ts` | `biji-core/src/services/sync.rs` | 同步逻辑重写但功能等价 |
| `webdav-service.ts` | `biji-core/src/services/webdav.rs` | HTTP 请求，reqwest 替代 fetch |
| `git-service.ts` | `biji-core/src/services/git.rs` | git2 替代 child_process |
| `plugin-manager.ts` | `biji-core/src/services/plugin.rs` | 简化，外部插件通过文件加载 |
| `publish-service.ts` | `biji-core/src/services/publish.rs` | CLI 调用，逻辑一致 |
| `main.ts` (Electron) | `biji-tauri/src/lib.rs` | Tauri 替代 Electron API |
| `preload.ts` | 删除 | Tauri 不需要 preload |
| `src/renderer/` | `frontend/src/` | React 组件保留，替换 IPC |

---

## 许可证

MIT License

Copyright (c) 2026 Biji Note Team

本项目是原 [Biji Note (Electron)](https://github.com/gtlx/BIJI) 的 Rust + Tauri 重构版本。
