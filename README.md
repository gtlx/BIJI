# Biji Note v0.2.0

跨平台笔记编辑器，支持插件系统、云同步、离线功能。

## 功能特性

### 插件系统
- 模块化插件架构
- 标准化的插件接口
- 插件管理（安装、卸载、启用/禁用）
- 权限控制确保安全性
- 插件功能与主程序集成

### 核心功能
- 本地 JSON 文件存储（可自定义路径）
- 云同步支持（本地文件夹、Web 同步）
- 多维搜索（关键词、标签、日期）
- Markdown 富文本编辑
- 自动保存

### 编辑器
- 模式切换：富文本 / Markdown
- Markdown 预览模式：实时预览 / 笔记模式 / 预览模式
- 笔记模板：空白笔记、会议记录、每日日志、待办清单

### 用户界面
- 简洁直观的 UI 设计
- 暗黑模式支持
- 底部状态栏显示存储路径
- 响应式布局
- 跨平台一致性

### 自定义
- 快捷键自定义
- 自定义 CSS 样式
- 模板选择

### 性能优化
- 本地数据缓存
- 智能同步策略（增量同步 / 双向同步）

### 安全与隐私
- 数据加密（AES-256-GCM）
- 权限管理

## 技术栈

- **前端**：React + TypeScript + Vite
- **后端**：Electron + Node.js
- **存储**：本地 JSON 文件
- **构建**：electron-builder

## 开发

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 打包

```bash
npm run package
```

## 项目结构

```
biji/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── main.ts     # 应用入口
│   │   ├── preload.ts  # 预加载脚本
│   │   ├── database.ts # 数据库模块
│   │   ├── plugin-manager.ts   # 插件管理
│   │   ├── sync-manager.ts      # 同步管理
│   │   ├── settings-manager.ts  # 设置管理
│   │   └── encryption.ts       # 加密服务
│   ├── renderer/       # React 前端
│   │   ├── App.tsx     # 主应用组件
│   │   ├── components/ # UI 组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── NoteList.tsx
│   │   │   ├── Editor.tsx
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── PluginManagerModal.tsx
│   │   │   ├── SearchModal.tsx
│   │   │   └── StatusBar.tsx
│   │   └── styles/     # 样式文件
│   └── shared/         # 共享类型
│       └── types.ts    # TypeScript 类型定义
├── examples/
│   └── plugins/        # 插件示例
│       ├── sync/       # 同步插件
│       └── markdown-export/ # 导出插件
├── docs/               # 文档
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
