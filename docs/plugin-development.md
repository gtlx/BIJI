# Biji Note 插件开发指南

## 概述

Biji Note 采用模块化的插件系统，允许开发者通过插件扩展应用功能。

## 插件结构

每个插件必须包含以下文件：

```
my-plugin/
├── manifest.json    # 插件清单
└── index.js         # 插件入口文件
```

## manifest.json

插件清单定义了插件的基本信息和权限：

```json
{
  "id": "unique-plugin-id",
  "name": "插件名称",
  "version": "1.0.0",
  "description": "插件描述",
  "author": "作者名称",
  "entryPoint": "index.js",
  "permissions": [
    { "type": "storage", "allowed": true },
    { "type": "network", "allowed": true },
    { "type": "filesystem", "allowed": false },
    { "type": "clipboard", "allowed": true },
    { "type": "notification", "allowed": true }
  ]
}
```

### 权限说明

| 权限类型 | 说明 |
|---------|------|
| storage | 访问笔记数据 |
| network | 发起网络请求 |
| filesystem | 读写文件系统 |
| clipboard | 访问剪贴板 |
| notification | 发送系统通知 |

## 插件 API

插件通过 `init` 函数接收 API 对象：

```javascript
async function init(api) {
  // 注册命令
  api.registerCommand('my-command', (arg) => {
    console.log('Command executed:', arg);
  });

  // 监听笔记事件
  api.onNoteCreated((note) => {
    console.log('Note created:', note.id);
  });

  api.onNoteUpdated((note) => {
    console.log('Note updated:', note.id);
  });

  api.onNoteDeleted((noteId) => {
    console.log('Note deleted:', noteId);
  });
}
```

### API 方法

#### 笔记操作

```javascript
// 获取所有笔记
const notes = await api.getNotes();

// 获取单个笔记
const note = await api.getNote('note-id');

// 保存笔记
await api.saveNote({
  id: 'note-id',
  title: '标题',
  content: '内容',
  tags: ['tag1', 'tag2'],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  folderId: null,
  isEncrypted: false,
  syncStatus: 'pending'
});

// 删除笔记
await api.deleteNote('note-id');
```

#### 系统操作

```javascript
// 显示系统通知
api.showNotification('标题', '内容');

// 获取设置
const settings = await api.getSettings();

// 修改设置
await api.setSettings({ theme: 'dark' });
```

## 示例：导出插件

```javascript
const { dialog } = require('electron');
const fs = require('fs');

let api = null;

async function init(pluginApi) {
  api = pluginApi;

  api.registerCommand('export:pdf', async (noteId) => {
    const note = await api.getNote(noteId);
    const result = await dialog.showSaveDialog({
      defaultPath: `${note.title}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });

    if (!result.canceled) {
      fs.writeFileSync(result.filePath, note.content);
      api.showNotification('导出成功', '笔记已导出');
    }
  });
}

module.exports = { init };
```

## 安装插件

1. 打开插件管理界面
2. 点击"安装插件"
3. 选择插件文件夹

## 发布插件

将插件文件夹打包为 ZIP 文件，用户可以直接安装。

## 最佳实践

1. **错误处理**：使用 try-catch 处理可能失败的操作
2. **权限最小化**：只请求必要的权限
3. **资源清理**：在 `destroy` 函数中清理资源
4. **版本兼容**：考虑主应用版本的兼容性
