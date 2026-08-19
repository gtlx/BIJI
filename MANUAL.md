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

#### 插件化能力架构(2026-08-19 定稿,克制版)

**基调**:核心定义「能力接口 trait」,插件注册时声明"我提供这个能力";业务功能(发布/同步/将来的 AI)以**能力适配器**形式接入,核心只认 trait 契约、不认具体实现。——这是**面向接口、不面向实现**。

**现状分层**:
- `services/plugin.rs`:`PluginManager` 只管**插件元数据的开关**(`get_all`/`toggle`/`is_enabled`),`Plugin` 模型预留 `entry_point`/`provides` 字段但未接线——它是"插件名册",不是执行引擎。内置插件含 **`publish-plugin`**(`provides: ["publish"]`)。
- `services/blog_adapter.rs`(发布能力核心):真正的**能力接口**。
  - `PublishAdapter` trait(`Send + Sync`):每个博客框架(astro/hugo/vitepress...)一个实现,含 `detect`(识别目标目录)/`detect_info`/`map`(把笔记 `BijiNoteMeta` 映射成目标文件计划 `PublishFilePlan`)/`safety_note`(写盘安全提示)。
  - `PublishCapability` trait:发布能力声明自身提供哪些框架适配器。
  - `CapabilityRegistry`:注册表,静态注册 `AstroAdapter`。
  - 数据模型 `BijiNoteMeta`(待发布笔记)、`PublishFilePlan`(映射结果:相对路径+完整内容含 frontmatter)、`FrameworkDetect`(识别结果)。
- **发布闭环(2026-08-19)**:`PublishService::publish(config, registry)` 的 `target_dir` 主路径**已走能力路径**——`registry.get("astro")` → `detect_info` 识别 → `get_all_notes_meta` 产笔记元数据(`BijiNoteMeta`)→ `adapter.map` 生成文件计划 → 写盘(自动建相对子目录,如 `posts/xxx.md`,带 frontmatter)。无适配器时回退平铺导出。tauri 命令 `publish_site` 锁一次取 `core.capabilities` 传入(勿二次 `.lock()` 死锁)。

**映射口径**(用户拍板):BIJI 文件夹 → 博客子目录(如 posts);标签 → frontmatter `tags`;标题/时间 → `title`/`published`/`updated`。Astro profile 以真实博客为准(`content.config.ts` glob loader + `./blog` collection)。

**彻底版接缝(重要,勿破坏)**:能力注册表用「注册函数 + 可枚举」而非写死 `match`(`CapabilityRegistry::register`)。将来升级彻底版(动态加载插件包),只往注册表加条目、或新增 `PluginCapability` 实现注册,核心调度代码不改。**克制版→彻底版是平滑演进,不是推倒**(trait 契约/适配器全复用,只需补"动态加载器"+前端注册机制)。

**安全底线**:发布能力写盘只**新增/覆盖同名 md,绝不删除博客其它文件**;走 `PublishAdapter::safety_note` 提示。

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

## M2 块级存储(2026-08-17)

- **分层**:`models/block.rs`(类型)→ `database/block_repo.rs` + `database/migrations.rs`(存储/迁移)→ `services/block_service.rs`(业务:时间戳+历史快照+拆块 diff)→ 前端 `BackendAdapter` 块方法(Mock 内存实现;Tauri 占位报错,待 M3 接入命令)
- **迁移**:`PRAGMA user_version` 版本化;002 迁移建 `blocks`/`block_history` 表,并对存量笔记首次自动拆块(frontmatter 不进块,notes.content 保留完整)
- **拆块规则**(`utils/blocks.rs`):空行分隔;标题/列表项单行成块;连续引用/围栏代码合并;连续行合并为段落块
- **块服务**:create_block(类型由内容推断)/ update_block(内容未变不盖时间戳不写历史;变更则盖 updated_at + 历史快照=变更前内容)/ delete_block(先写 delete 历史再硬删,历史保留)/ reorder / get_note_blocks / get_block_history / sync_note_blocks(整篇保存→位置对齐 diff,只盖变更块时间戳)
- **双模式搜索**:`SearchMode::Title`(notes.title→笔记)/ `SearchMode::Content`(blocks.content→块级命中:命中块+所在笔记+片段);入口 `database::search_by_mode`
- **前端**:编辑器头部时钟按钮 = 块时间戳可选开关(localStorage 记忆),开启后预览按块渲染并显示每段更新时间;SearchModal 增加 标题/内容 模式切换

## M3.5a 体验增强第一批(2026-08-17)

三项均基于**块级时间戳**定位,分层沿用 model/storage/service + 前端 BackendAdapter。

### ① 日历 + 块热力图
- 后端:`block_repo::get_block_activity(date_from, date_to)` → `[{date, created, updated}]`(毫秒范围,按本地日聚合,排除已删笔记下的块);`get_blocks_in_range` → 范围内创建/更新的块(片段+笔记标题+时间戳)
- 前端:「日历」导航视图 `CalendarView`:月历网格,某天写的块越多色越深(薄荷绿→teal 五档 `heat-0..4`),点某天显示当天写入的块清单(来源笔记+块时间戳+片段),点块跳转笔记;月切换/回到今天/空态

### ② 反向链接面板(块级)
- 后端:`link_repo::get_block_backlinks(note_id)` → 引用目标笔记的 `[块id, 来源笔记, 片段, 块时间戳]`(在笔记级反向链接基础上精确到引用块)
- 前端:编辑器工具栏「反向链接」按钮 / 右侧面板 「反向链接」标签页:列出引用块(来源笔记+片段+块时间戳),点跳来源笔记;无引用显示「暂无反向链接」

### ③ 标签树/过滤
- 后端:`tag_repo::get_all_tags` → 全部标签+计数(排除已删笔记);`get_notes_by_tag` → 按标签列笔记(大小写不敏感)
- 前端:侧栏「标签」区列出标签(计数),点击展开该标签下笔记并过滤 NoteList(扁平列出+清除按钮),点过滤列表跳笔记

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

## 依赖与 lockfile 规范

### Rust

- 所有 workspace member 的依赖版本必须在 crates.io 真实存在。
- 不得引入未经验证的 crate（特别是加密、系统通知、网络相关）。

### Node / 前端

- `frontend/` 目录下必须生成且仅保持一份 lockfile（`yarn.lock`、`pnpm-lock.yaml`、`package-lock.json` 三选一）。
- 当前 `frontend/` 缺少 lockfile，必须补充生成。
- 新增依赖后必须重新生成 lockfile，并提交到 git。
- 禁止手动编辑 lockfile。

### 依赖审计检查点

- 添加新依赖前，必须在 crates.io / npm registry 验证其真实存在。
- 对于版本号，要按语义化版本前缀验证（如 `"0.32"` 需确认 `0.32.x` 系列中至少有一个版本存在）。
- 编译通过不等于没有 bug，编译后仍需抽查运行时系统 API 调用。
