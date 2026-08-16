import {
  BackendAdapter, Note, Folder, AppSettings, SearchQuery, GraphData, SyncResult, SyncStatus,
  GitStatus, GitLogEntry, PublishConfig, PublishResult, Plugin, ImportResult,
  NoteBlock, BlockHistoryEntry, BlockSearchResult, BlockType,
} from './backend';

// ============================================================
// M2 拆块规则(与 biji-core utils/blocks.rs 保持一致)
// 空行分隔;标题/列表项单行成块;引用/围栏代码合并;连续行合并为段落;frontmatter 剥离
// ============================================================

/** 剥离 YAML frontmatter(元数据不进块) */
function stripFrontmatter(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : content;
}

/** 根据单块内容推断块类型 */
function detectBlockType(content: string): BlockType {
  const firstLine = content.split('\n')[0] || '';
  if (/^\s*```|^\s*~~~/.test(firstLine)) return 'code';
  if (/^\s{0,3}#{1,6}(\s|$)/.test(firstLine)) return 'heading';
  if (/^\s*[-*+]\s/.test(firstLine) || /^\s*\d+\.(\s|$)/.test(firstLine)) return 'list_item';
  if (firstLine.trimStart().startsWith('>')) return 'quote';
  return 'paragraph';
}

/** 整篇 markdown → 块序列 */
function splitContentToBlocks(content: string): { type: BlockType; content: string }[] {
  const lines = stripFrontmatter(content).split('\n');
  const drafts: { type: BlockType; content: string }[] = [];
  const isFence = (l: string) => /^\s*```|^\s*~~~/.test(l);
  const isHeading = (l: string) => /^\s{0,3}#{1,6}(\s|$)/.test(l);
  const isListItem = (l: string) => /^\s*[-*+]\s/.test(l) || /^\s*\d+\.(\s|$)/.test(l);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // 围栏代码块
    if (isFence(line)) {
      const codeLines = [line]; i++;
      while (i < lines.length && !isFence(lines[i])) { codeLines.push(lines[i]); i++; }
      if (i < lines.length) { codeLines.push(lines[i]); i++; }
      drafts.push({ type: 'code', content: codeLines.join('\n') });
      continue;
    }
    // 标题:单行成块
    if (isHeading(line)) { drafts.push({ type: 'heading', content: line }); i++; continue; }
    // 列表项:单行成块
    if (isListItem(line)) { drafts.push({ type: 'list_item', content: line }); i++; continue; }
    // 引用:连续 > 行合并
    if (line.trimStart().startsWith('>')) {
      const quoteLines = [line]; i++;
      while (i < lines.length && lines[i].trimStart().startsWith('>')) { quoteLines.push(lines[i]); i++; }
      drafts.push({ type: 'quote', content: quoteLines.join('\n') });
      continue;
    }
    // 普通段落:连续非空行合并
    const paraLines = [line]; i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim() || isHeading(l) || isListItem(l) || isFence(l) || l.trimStart().startsWith('>')) break;
      paraLines.push(l); i++;
    }
    drafts.push({ type: 'paragraph', content: paraLines.join('\n') });
  }
  return drafts;
}

// ============================================================
// Mock 适配器 — 用于开发/测试，不依赖任何后端
// ============================================================

/** 开发预览示例数据(仅 Mock 后端使用,真实后端不受影响) */
const MOCK_NOTES: Note[] = [
  {
    id: 'mock-note-welcome',
    title: '欢迎使用 Biji 笔记',
    content: `---
title: 欢迎使用 Biji 笔记
tags: [入门, 说明]
created: 2026-08-17
---

# 欢迎使用 Biji 笔记

这是一篇示例笔记,用来预览界面效果。

## 核心功能

- **双向链接**:输入 [[双向链接]] 即可连接笔记
- **知识图谱**:在侧栏点击「图谱」查看笔记关系
- **全文搜索**:按 \`Ctrl+F\` 快速定位
- **Markdown 编辑**:支持标题、列表、代码块等语法

> 提示:这些示例数据只存在于开发环境(Mock 后端),不会写入真实存储。

## 下一步

- 在左侧列表点击「新建笔记」创建你的第一篇笔记
- 尝试输入 \`#标签\` 为笔记打标
- 阅读 [[知识图谱使用指南]] 了解图谱玩法
`,
    created_at: Date.now() - 3 * 86400000,
    updated_at: Date.now() - 3600000,
    tags: ['入门', '说明'],
    folder_id: null,
    is_encrypted: false,
    sync_status: 'synced',
  },
  {
    id: 'mock-note-graph',
    title: '知识图谱使用指南',
    content: `---
title: 知识图谱使用指南
tags: [图谱, 教程]
created: 2026-08-15
---

# 知识图谱使用指南

图谱面板以节点方式展示笔记间的[[双向链接]]关系。

## 节点说明

- 每个节点代表一篇笔记,节点越大代表被引用越多
- 点击节点可直接跳转到对应笔记
- 链接来自笔记正文中的 \`[[笔记标题]]\` 语法

## 示例关系

本笔记与 [[欢迎使用 Biji 笔记]] 存在链接关系,在图谱中应可见一条连线。

## 常见问题

1. 图谱为空?——先给笔记添加 \`[[链接]]\` 再回来刷新
2. 节点过多?——后续版本将支持按文件夹/标签过滤
`,
    created_at: Date.now() - 7 * 86400000,
    updated_at: Date.now() - 2 * 3600000,
    tags: ['图谱', '教程'],
    folder_id: null,
    is_encrypted: false,
    sync_status: 'synced',
  },
  {
    id: 'mock-note-daily',
    title: '2026-08-17 工作日志',
    content: `---
title: 2026-08-17 工作日志
tags: [日志, 待办]
created: 2026-08-17
---

# 2026-08-17 工作日志

## 今日完成

- [x] 修复 M1 阶段 UI 问题(移动端切换/ESC 关闭/平板断点)
- [x] 补充 Mock 示例数据便于预览
- [ ] 编写使用文档
- [ ] 规划 M2 双向链接体验优化

## 遇到的问题

- 移动端点列表项无法进入编辑器 —— 已修复
- ESC 无法关闭弹窗 —— 已修复

## 明日计划

- 继续 M2 功能开发
- 完善知识图谱可视化
`,
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 1800000,
    tags: ['日志', '待办'],
    folder_id: null,
    is_encrypted: false,
    sync_status: 'synced',
  },
];

export class MockBackend implements BackendAdapter {
  private notes: Note[] = [...MOCK_NOTES];
  private folders: Folder[] = [];
  /** M2:内存块表(块数组) */
  private blocks: NoteBlock[] = [];
  /** M2:内存历史表(历史数组) */
  private histories: BlockHistoryEntry[] = [];
  /** 内存 id 序号 */
  private seq = 0;
  private settings: AppSettings = {
    theme: 'light',
    font_size: 14,
    font_family: 'sans-serif',
    language: 'zh-CN',
    sync_enabled: false,
    sync_provider: null,
    sync_mode: 'incremental',
    sync_path: '',
    sync_web_url: '',
    sync_web_token: '',
    sync_web_username: '',
    sync_web_password: '',
    encryption_enabled: false,
    encryption_key: '',
    auto_save: true,
    auto_save_interval: 30000,
    editor_mode: 'markdown',
    markdown_preview_mode: 'live',
    storage_path: '',
    template: 'blank',
    toolbar_position: 'left',
    custom_css: '',
    ui_custom_css: { main_content: '', left_sidebar: '', right_sidebar: '', editor: '', note_list: '' },
    zoom: 100,
    shortcuts: {
      new_note: 'Ctrl+N', new_folder: 'Ctrl+Shift+N', save: 'Ctrl+S', search: 'Ctrl+F',
      toggle_theme: 'Ctrl+Alt+T', open_settings: 'Ctrl+,', sync: 'Ctrl+Shift+S',
      toggle_left_sidebar: 'Ctrl+[', toggle_right_sidebar: 'Ctrl+]', toggle_graph: 'Ctrl+G',
      toggle_outline: 'Ctrl+O', toggle_preview_mode: 'Ctrl+P', toggle_editor_mode: 'Ctrl+E',
    },
  };

  async getNotes(includeDeleted = false): Promise<Note[]> {
    return this.notes.filter(n => includeDeleted || !n.deleted_at);
  }

  async getNote(id: string): Promise<Note | null> {
    return this.notes.find(n => n.id === id) || null;
  }

  async saveNote(note: Note): Promise<void> {
    const idx = this.notes.findIndex(n => n.id === note.id);
    if (idx >= 0) this.notes[idx] = note;
    else this.notes.push(note);
    // M2:编辑保存时后端拆块入库(整篇编辑 → 块序列 diff,只盖变更块时间戳)
    await this.syncNoteBlocks(note.id, note.content);
  }

  async deleteNote(id: string, permanent = false): Promise<void> {
    if (permanent) {
      this.notes = this.notes.filter(n => n.id !== id);
    } else {
      const note = this.notes.find(n => n.id === id);
      if (note) note.deleted_at = Date.now();
    }
  }

  async searchNotes(query: SearchQuery): Promise<Note[]> {
    let results = this.notes.filter(n => !n.deleted_at);
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      if (query.mode === 'title') {
        // 标题模式:只匹配标题
        results = results.filter(n => n.title.toLowerCase().includes(kw));
      } else if (query.mode === 'content') {
        // 内容模式:按块命中(命中块所在笔记,去重)
        const hitNoteIds = new Set(
          this.blocks.filter(b => b.content.toLowerCase().includes(kw)).map(b => b.note_id)
        );
        results = results.filter(n => hitNoteIds.has(n.id));
      } else {
        // 兼容旧行为:标题或内容
        results = results.filter(n => n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw));
      }
    }
    if (query.folder_id) results = results.filter(n => n.folder_id === query.folder_id);
    return results;
  }

  async getGraphData(): Promise<GraphData> {
    return { nodes: [], edges: [] };
  }

  async getFolders(includeDeleted = false): Promise<Folder[]> {
    return this.folders.filter(f => includeDeleted || !f.deleted_at);
  }

  async saveFolder(folder: Folder): Promise<void> {
    const idx = this.folders.findIndex(f => f.id === folder.id);
    if (idx >= 0) this.folders[idx] = folder;
    else this.folders.push(folder);
  }

  async deleteFolder(id: string, permanent = false): Promise<void> {
    if (permanent) {
      this.folders = this.folders.filter(f => f.id !== id);
    } else {
      const f = this.folders.find(f => f.id === id);
      if (f) f.deleted_at = Date.now();
    }
  }

  async getSettings(): Promise<AppSettings> { return this.settings; }
  async setSettings(settings: AppSettings): Promise<void> { this.settings = settings; }
  async syncStart(): Promise<SyncResult> { return { success: true, uploaded: 0, downloaded: 0, deleted: 0, conflicts: [] }; }
  async syncStatus(): Promise<SyncStatus> { return { is_syncing: false, last_sync: 0, pending: 0 }; }
  async gitInit(): Promise<boolean> { return true; }
  async gitStatus(): Promise<GitStatus> { return { files: [], clean: true }; }
  async gitCommit(message: string): Promise<string | null> { return null; }
  async gitLog(count?: number): Promise<GitLogEntry[]> { return []; }
  async publishSite(config: PublishConfig): Promise<PublishResult> { return { success: true }; }
  async checkGenerator(generator: string): Promise<[boolean, string | null]> { return [false, null]; }
  async importMarkdown(path: string): Promise<ImportResult> { return { success: true, count: 0 }; }
  async exportMarkdown(path: string): Promise<ImportResult> { return { success: true, count: 0 }; }
  async getPlugins(): Promise<Plugin[]> { return []; }
  async togglePlugin(id: string, enabled: boolean): Promise<void> {}
  onMenuEvent(event: string, callback: () => void): () => void { return () => {}; }

  // ==================== M2 块级存储(内存实现) ====================

  /** 生成内存 id */
  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}-${Date.now().toString(36)}`;
  }

  /** 写一条历史快照 */
  private pushHistory(blockId: string | null, snapshot: string, changeType: BlockHistoryEntry['change_type'], ts: number): void {
    this.histories.push({
      id: this.nextId('mock-hist'),
      block_id: blockId,
      content_snapshot: snapshot,
      changed_at: ts,
      change_type: changeType,
    });
  }

  /** 存量 mock 笔记首次访问时懒拆块(确定性 id,时间戳 = 笔记 updated_at) */
  private ensureBlocksForNote(noteId: string): void {
    if (this.blocks.some(b => b.note_id === noteId)) return;
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;
    const ts = note.updated_at || Date.now();
    const drafts = splitContentToBlocks(note.content);
    this.blocks.push(...drafts.map((d, i) => ({
      id: `mock-${noteId}-${i}`,
      note_id: noteId,
      parent_id: null,
      type: d.type,
      content: d.content,
      created_at: ts,
      updated_at: ts,
      sort_order: i,
    })));
  }

  async createBlock(input: { note_id: string; content: string; parent_id?: string | null }): Promise<NoteBlock> {
    const ts = Date.now();
    const block: NoteBlock = {
      id: this.nextId('mock-blk'),
      note_id: input.note_id,
      parent_id: input.parent_id ?? null,
      type: detectBlockType(input.content),
      content: input.content,
      created_at: ts,
      updated_at: ts,
      sort_order: this.blocks.filter(b => b.note_id === input.note_id).length,
    };
    this.blocks.push(block);
    this.pushHistory(block.id, block.content, 'create', ts);
    return block;
  }

  async updateBlock(id: string, content: string): Promise<NoteBlock> {
    const block = this.blocks.find(b => b.id === id);
    if (!block) throw new Error(`block not found: ${id}`);
    if (block.content === content) return { ...block }; // 内容未变:不盖时间戳、不写历史
    const ts = Date.now();
    this.pushHistory(id, block.content, 'update', ts);
    block.content = content;
    block.type = detectBlockType(content);
    block.updated_at = ts;
    return { ...block };
  }

  async deleteBlock(id: string, permanent = true): Promise<void> {
    const block = this.blocks.find(b => b.id === id);
    if (!block) return;
    this.pushHistory(id, block.content, 'delete', Date.now());
    this.blocks = this.blocks.filter(b => b.id !== id);
  }

  async reorderBlocks(noteId: string, orderedIds: string[]): Promise<void> {
    orderedIds.forEach((id, i) => {
      const b = this.blocks.find(x => x.id === id && x.note_id === noteId);
      if (b) b.sort_order = i;
    });
  }

  async getNoteBlocks(noteId: string): Promise<NoteBlock[]> {
    this.ensureBlocksForNote(noteId);
    return this.blocks
      .filter(b => b.note_id === noteId)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
  }

  async getBlockHistory(blockId: string): Promise<BlockHistoryEntry[]> {
    return this.histories
      .filter(h => h.block_id === blockId)
      .sort((a, b) => b.changed_at - a.changed_at);
  }

  async searchBlocks(keyword: string): Promise<BlockSearchResult[]> {
    const kw = keyword.toLowerCase();
    const aliveNotes = new Set(this.notes.filter(n => !n.deleted_at).map(n => n.id));
    return this.blocks
      .filter(b => b.content.toLowerCase().includes(kw) && aliveNotes.has(b.note_id))
      .map(b => ({
        block_id: b.id,
        note_id: b.note_id,
        note_title: this.notes.find(n => n.id === b.note_id)?.title || '',
        content: b.content,
        updated_at: b.updated_at,
      }))
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  /** 整篇保存 → 块序列 diff(位置对齐):同内容跳过 / 不同 update / 多出 create / 少了 delete */
  async syncNoteBlocks(noteId: string, content: string): Promise<number> {
    this.ensureBlocksForNote(noteId);
    const drafts = splitContentToBlocks(content);
    const existing = this.blocks
      .filter(b => b.note_id === noteId)
      .sort((a, b) => a.sort_order - b.sort_order);
    let changed = 0;

    for (let i = 0; i < drafts.length; i++) {
      const cur = existing[i];
      if (!cur) {
        await this.createBlock({ note_id: noteId, content: drafts[i].content });
        changed++;
      } else if (cur.content !== drafts[i].content) {
        await this.updateBlock(cur.id, drafts[i].content);
        changed++;
      }
    }
    for (let i = drafts.length; i < existing.length; i++) {
      await this.deleteBlock(existing[i].id);
      changed++;
    }
    return changed;
  }
}
