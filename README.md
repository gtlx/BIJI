# Biji Note

跨平台笔记编辑器，支持插件系统、知识图谱、云同步、离线功能。

## 功能特性

### 核心功能
- **双向链接** - 使用 `[[笔记标题]]` 语法创建笔记间链接
- **知识图谱** - 可视化展示笔记间的关联关系
- **SQLite 数据库** - 高效、可靠的本地数据存储
- **Markdown 编辑** - 实时预览、编辑、预览三种模式

### 插件系统
- 模块化插件架构
- 标准化的插件接口
- 插件管理（安装、卸载、启用/禁用）
- 权限控制确保安全性
- 插件功能与主程序集成

### 编辑器
- 模式切换：富文本 / Markdown
- Markdown 预览模式：实时预览 / 笔记模式 / 预览模式
- 笔记模板：空白笔记，会议记录、每日日志、待办清单
- 自动保存

### 用户界面
- 简洁直观的 UI 设计
- 暗黑模式支持
- 功能区（知识图谱、插件快捷入口）
- 面包屑导航
- 响应式布局

### 自定义
- 快捷键自定义
- 自定义 CSS 样式
- 模板选择

### 安全与隐私
- 数据加密（AES-256-GCM）
- 本地优先存储

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | 类型安全、现代前端框架 |
| 构建工具 | Vite 5 | 快速的开发体验和构建 |
| 桌面框架 | Electron 29 | 跨平台桌面应用 |
| 数据库 | SQLite (better-sqlite3) | 高性能、零配置 |
| 可视化 | D3.js | 力导向图谱 |
| 构建打包 | electron-builder | 应用打包分发 |

## 与主流开源笔记对比

| 特性 | Biji Note | Obsidian | Logseq | Joplin |
|------|-----------|----------|--------|--------|
| 数据存储 | SQLite | Markdown | Markdown | Markdown |
| 双向链接 | ✅ | ✅ | ✅ | ❌ |
| 图谱视图 | ✅ | ✅ | ✅ | ❌ |
| 插件系统 | ✅ | ✅ 1000+ | ✅ | ✅ |
| 数据库 | SQLite | 文件 | 文件 | 文件 |
| 移动端 | ❌ | ✅ | ✅ | ✅ |
| 中文友好 | ✅ 原生 | ⚠️ 需配置 | ⚠️ 需配置 | ⚠️ 需配置 |

### 优势

1. **中文原生支持** - 开箱即用的中文界面
2. **SQLite 高效** - 查询性能优于文件存储
3. **轻量级** - 代码量小，易于理解和二次开发
4. **插件系统** - 可扩展性强

### 劣势

1. **功能较少** - 缺少大纲编辑、块引用等高级功能
2. **无移动端** - 只有桌面版
3. **插件生态薄弱** - 无插件市场
4. **同步功能不完善** - Google/OneDrive 未实现

### 改进方向

1. **短期** - 完善同步功能，支持 WebDAV
2. **中期** - 实现大纲/块引用，参考 Logseq
3. **长期** - 开发移动端，建立插件生态

## 开发

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 生产模式

```bash
npm run build
./node_modules/.bin/vite preview --port 5173 &
./node_modules/.bin/electron .
```

### 打包

```bash
npm run package
```

## 项目结构

```
biji/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.ts        # 应用入口
│   │   ├── preload.ts     # 预加载脚本
│   │   ├── sqlite-database.ts  # SQLite 数据库
│   │   ├── plugin-manager.ts   # 插件管理
│   │   ├── sync-manager.ts     # 同步管理
│   │   ├── settings-manager.ts # 设置管理
│   │   └── encryption.ts      # 加密服务
│   ├── renderer/          # React 前端
│   │   ├── App.tsx        # 主应用组件
│   │   ├── components/    # UI 组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── NoteList.tsx
│   │   │   ├── Editor.tsx
│   │   │   ├── GraphView.tsx  # 知识图谱
│   │   │   ├── Toolbar.tsx    # 功能区
│   │   │   ├── Toast.tsx     # 通知提示
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── SearchModal.tsx
│   │   │   └── StatusBar.tsx
│   │   └── styles/        # 样式文件
│   └── shared/            # 共享类型
│       └── types.ts       # TypeScript 类型定义
├── examples/
│   └── plugins/           # 插件示例
│       ├── sync/          # 同步插件
│       └── markdown-export/ # 导出插件
├── docs/                  # 文档
└── package.json
```

## 快捷键

| 功能 | 默认快捷键 |
|------|-----------|
| 新建笔记 | Ctrl+N |
| 新建文件夹 | Ctrl+Shift+N |
| 保存 | Ctrl+S |
| 搜索 | Ctrl+F |
| 切换主题 | Ctrl+Alt+T |
| 打开设置 | Ctrl+, |
| 同步 | Ctrl+Shift+S |

## 许可证

MIT
