# Biji Note

跨平台笔记编辑器，支持插件系统、云同步、离线功能。

## 功能特性

### 插件系统
- 模块化插件架构
- 标准化的插件接口
- 插件管理（安装、卸载、启用/禁用）
- 权限控制确保安全性

### 核心功能
- 本地 SQLite 数据库存储
- 云同步支持（Google Drive、OneDrive）
- 多维搜索（关键词、标签、日期）
- Markdown 富文本编辑
- 自动保存

### 用户界面
- 简洁直观的 UI 设计
- 暗黑模式支持
- 响应式布局
- 跨平台一致性

### 性能优化
- 本地数据缓存
- 智能同步策略
- 增量更新

### 安全与隐私
- 数据加密（AES-256-GCM）
- 权限管理

## 技术栈

- **前端**：React + TypeScript + Vite
- **后端**：Electron + Node.js
- **数据库**：SQLite (better-sqlite3)
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
│   │   └── styles/     # 样式文件
│   └── shared/         # 共享类型
│       └── types.ts    # TypeScript 类型定义
├── examples/
│   └── plugins/        # 插件示例
├── docs/               # 文档
└── package.json
```

## 许可证

MIT
