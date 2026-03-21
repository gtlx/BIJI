# Biji Note

跨平台笔记编辑器，支持插件系统、知识图谱、云同步、离线功能。

## 功能特性

### 核心功能
- **双向链接** - 使用 `[[笔记标题]]` 语法创建笔记间链接
- **知识图谱** - 可视化展示笔记间的关联关系
- **SQLite 数据库** - 高效、可靠的本地数据存储
- **Markdown 编辑** - 实时预览、编辑、预览三种模式
- **内置番茄钟** - 专注计时器，嵌入右侧边栏

### 编辑器
- Markdown 预览模式：实时预览 / 编辑模式 / 预览模式
- 笔记模板：空白笔记、会议记录、每日日志、待办清单
- 自动保存
- #tag 标签支持
- YAML Frontmatter 元数据

## 界面布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  文件  编辑  视图  插件  帮助                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────┐  ┌──────────┬──────────────────────────┐  ┌──────────────┐  │
│  │工具 │  │ 文件夹   │                          │  │ 属性  │番茄钟│  │
│  │栏  │  │ 导航    │                          │  │──────│──────│  │
│  │    │  ├──────────┤                          │  │ 大纲  │      │  │
│  │图谱│  │          │                          │  │      │      │  │
│  │    │  │ 笔记列表 │    ┌────────────────┐   │  │      │      │  │
│  │Git │  │          │    │  圆角矩形区域  │   │  └──────┘      │  │
│  │    │  │ - 笔记1 │    │  (编辑器/图谱) │   │                 │  │
│  │发布│  │ - 笔记2 │    └────────────────┘   │                 │  │
│  │    │  │ - 笔记3 │                          │                 │  │
│  │插件│  └──────────┴──────────────────────────┘                 │  │
│  └────┘                              状态栏                       │  │
│   │                                                          │     │
│   └── 可拖动折叠按钮 ◄──────────────────────────────────────► │     │
└─────────────────────────────────────────────────────────────────────┘
```

**组件说明**：
- **顶部菜单栏**：应用原生菜单，包含文件、编辑、视图、插件、帮助
- **左侧边栏**：可折叠（Ctrl+[），包含文件夹导航、笔记列表
- **左侧浮动工具栏**：垂直浮动工具栏，包含图谱、Git、发布、插件按钮，支持拖拽排序
- **中间区域**：圆角矩形设计（四周留有间距），支持自定义 CSS 样式，编辑器或知识图谱视图
- **右侧边栏**：可折叠（Ctrl+]），标签页切换（属性/番茄钟/大纲），折叠后显示可拖动按钮
- **状态栏**：底部，显示同步状态、字数统计等

### 番茄钟
- 工作模式：25分钟专注
- 短休息：5分钟
- 长休息：15分钟（每4个番茄后）
- 环形进度显示
- 今日完成统计
- 嵌入右侧边栏

### 知识图谱
- 显示所有笔记作为节点
- 笔记间的 `[[链接]]` 显示为边
- 力学设置面板：
  - 向心力（0-1）
  - 排斥力（-2000 至 -50）
  - 吸引力（0-2）
  - 连线长度（20-500）
  - 重置按钮
- 显示统计：笔记数、链接数、总字数

### 搜索功能
- 全局搜索所有笔记
- 标题和内容分开显示
- 搜索结果高亮
- 标签筛选（#标签）

## 版本控制 (Git)
- 自动初始化 Git 仓库
- 查看文件修改状态
- 提交笔记更改
- 查看提交历史
- 恢复历史版本

## 云同步

支持多种同步方式：

### WebDAV 同步

支持 Nextcloud、坚果云等 WebDAV 兼容服务。

**配置步骤**：
1. 设置 → 同步 → 启用云同步
2. 选择「WebDAV 同步」
3. 填写 WebDAV 地址、用户名、密码
4. 点击同步

**示例配置**：
- Nextcloud: `https://your-nextcloud.com/remote.php/dav/files/username/`
- 坚果云: `https://dav.jianguoyun.com/dav/`

### 本地同步

将笔记同步到本地文件夹。

## 插件系统

Biji Note 支持插件系统，分为**内置插件**和**外部插件**。

### 内置插件

通过顶部工具栏的「插件」按钮打开插件管理面板进行管理：

| 插件 | 描述 |
|------|------|
| 番茄钟 | 专注计时器，位于右侧边栏 |
| 云同步 | WebDAV/本地同步功能 |

### 外部插件

**目录结构**：
```
笔记目录/
├── notes/              # 笔记文件夹
├── plugins/            # 外部插件文件夹
│   └── your-plugin/
│       ├── manifest.json
│       └── main.js
└── biji.db            # SQLite 数据库（仅存笔记）
```

**manifest.json 格式**：
```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "插件描述",
  "author": "作者",
  "type": "ui",
  "entry": "main.js",
  "position": "right-panel"
}
```

**position 可选值**：
- `right-panel`：右侧边栏
- `toolbar`：左侧工具栏
- `sidebar`：左侧边栏
- `modal`：模态窗口
- `statusbar`：状态栏

### 开发外部插件

**1. 创建插件项目结构**：
```
my-plugin/
├── manifest.json
├── vite.config.ts
├── tsconfig.json
└── src/
    └── index.tsx
```

**2. 插件入口 (src/index.tsx)**：
```tsx
import React from 'react';

function MyPluginComponent({ compact }: { compact?: boolean }) {
  return React.createElement('div', { className: 'my-plugin' },
    React.createElement('h2', null, '我的插件'),
    React.createElement('p', null, '插件内容...')
  );
}

function registerPlugin(api: { register: (comp: any, opts?: any) => void }) {
  api.register(MyPluginComponent, {
    position: 'right-panel',
    compact: true,
  });
}

(window as any).registerPlugin = registerPlugin;
```

**注意**：使用 `React.createElement` 而非 JSX，避免编译问题。

**3. 编译并安装**：
```bash
# 编译插件
npx vite build

# 复制到插件目录
cp -r dist/* 笔记目录/plugins/my-plugin/
```

## 笔记属性 (Frontmatter)

支持 Obsidian 风格的 YAML frontmatter：

```yaml
---
title: 标题
aliases:
  - 别名1
tags:
  - 开源
  - Docker
created: 2024-01-01
updated: 2024-01-15
---
```

## 静态网站发布

支持多种静态网站生成器：
- **Hugo** - 快速、灵活的静态网站生成器
- **Astro** - 现代静态站点构建工具
- **VitePress** - Vue 驱动的静态网站生成器

## 自定义

### 界面自定义 CSS

**设置 → 外观 → 界面自定义**，可单独设置以下区域的 CSS：

| 区域 | CSS 类名 | 说明 |
|------|----------|------|
| 主内容区 | `.main-content` | 圆角矩形容器，包含编辑器和状态栏 |
| 左侧边栏 | `.sidebar` | 可折叠，包含导航和笔记列表 |
| 右侧边栏 | `.right-panel` | 标签页式设计（属性/番茄钟/大纲） |
| 编辑器 | `.editor` | Markdown 编辑器区域 |
| 笔记列表 | `.note-list` | 左侧边栏内的笔记列表 |
| 浮动工具栏 | `.toolbar` | 左侧垂直浮动工具栏 |
| 右侧折叠按钮 | `.right-sidebar-toggle` | 右侧边栏折叠后的展开按钮 |

**示例**：
```css
/* 主内容区 - 圆角矩形 */
.main-content {
  background: #f5f5f5;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  margin: 16px;
}

/* 左侧边栏 */
.sidebar {
  width: 280px;
  background: #e8e8e8;
}

/* 右侧边栏 */
.right-panel {
  background: #fafafa;
  border-left: 1px solid #ddd;
}

/* 浮动工具栏按钮 */
.toolbar-btn {
  border-radius: 8px;
}
```

### 编辑器宽度

编辑器的默认最大宽度可以通过 CSS 变量设置：

```css
:root {
  --editor-width: 900px;  /* 默认 900px */
}
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | 类型安全、现代前端框架 |
| 构建工具 | Vite 5 | 快速的开发体验和构建 |
| 桌面框架 | Electron 29 | 跨平台桌面应用 |
| 数据库 | SQLite (better-sqlite3) | 高性能、零配置 |
| 可视化 | D3.js | 力导向图谱 |
| 构建打包 | electron-builder | 应用打包分发 |

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
│   │   ├── plugin-manager.ts   # 系统插件管理
│   │   ├── sync-manager.ts     # 同步管理
│   │   ├── webdav-service.ts   # WebDAV 服务
│   │   ├── settings-manager.ts # 设置管理
│   │   ├── git-service.ts      # Git 服务
│   │   └── publish-service.ts  # 发布服务
│   ├── renderer/          # React 前端
│   │   ├── App.tsx        # 主应用组件
│   │   ├── components/    # UI 组件
│   │   │   ├── Sidebar.tsx       # 左侧边栏
│   │   │   ├── NoteList.tsx      # 笔记列表
│   │   │   ├── Editor.tsx        # Markdown 编辑器
│   │   │   ├── GraphView.tsx     # 知识图谱
│   │   │   ├── RightPanel.tsx    # 右侧边栏
│   │   │   ├── Toolbar.tsx       # 左侧浮动工具栏
│   │   │   ├── PomodoroTimer.tsx # 番茄钟
│   │   │   ├── Toast.tsx         # 通知提示
│   │   │   ├── SettingsModal.tsx  # 设置弹窗
│   │   │   ├── SearchModal.tsx    # 搜索弹窗
│   │   │   ├── GitPanel.tsx      # Git 面板
│   │   │   ├── PublishPanel.tsx   # 发布面板
│   │   │   ├── StatusBar.tsx     # 状态栏
│   │   │   └── PluginManagerModal.tsx # 插件管理
│   │   └── plugins/        # 内置插件
│   │       └── BuiltInPomodoro.tsx
│   └── shared/            # 共享类型
│       └── types.ts       # TypeScript 类型定义
├── build/                 # 构建资源
│   └── icon.png
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
| 折叠/展开左侧边栏 | Ctrl+[ |
| 折叠/展开右侧边栏 | Ctrl+] |
| 切换图谱 | Ctrl+G |
| 切换大纲 | Ctrl+O |
| 切换预览模式 | Ctrl+P |
| 切换编辑模式 | Ctrl+E |

## 数据存储

- **笔记数据库**: `~/.config/biji-note/biji.db` (SQLite)
- **设置**: `~/.config/biji-note/settings.json`
- **笔记目录**: `笔记目录/` (可配置)
- **外部插件**: `笔记目录/plugins/`

## 与主流开源笔记对比

| 特性 | Biji Note | Obsidian | Logseq | Joplin |
|------|-----------|----------|--------|--------|
| 数据存储 | SQLite | Markdown | Markdown | Markdown |
| 双向链接 | ✅ | ✅ | ✅ | ❌ |
| 图谱视图 | ✅ | ✅ | ✅ | ❌ |
| WebDAV 同步 | ✅ | ⚠️ 插件 | ⚠️ 插件 | ✅ |
| 插件系统 | ✅ 内置+外部 | ✅ 1000+ | ✅ | ✅ |
| 中文友好 | ✅ 原生 | ⚠️ 需配置 | ⚠️ 需配置 | ⚠️ 需配置 |
| 三栏布局 | ✅ | ✅ | ⚠️ | ❌ |
| 番茄钟内置 | ✅ | ⚠️ 插件 | ⚠️ 插件 | ❌ |
| 可拖拽工具栏 | ✅ | ❌ | ❌ | ❌ |

## 许可证

MIT
