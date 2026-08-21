import {
  BackendAdapter, Note, Folder, AppSettings, SearchQuery, GraphData, SyncResult, SyncStatus,
  GitStatus, GitLogEntry, PublishConfig, PublishResult, PublishPreviewResult, Plugin, ImportResult,
  NoteBlock, BlockHistoryEntry, BlockSearchResult, BlockType, BlockActivity, BlockBacklink, TagCount,
  NoteTemplate, TrashBlock, DEFAULT_TEMPLATES,
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
    folder_id: 'mock-folder-proj',
    is_encrypted: false,
    sync_status: 'synced',
  },
];

/**
 * M3 嵌套文件夹示例(演示可折叠树 + 面包屑):
 * 工作/项目/文档 与 生活/家庭 两层嵌套;部分笔记挂到嵌套文件夹下。
 */
const MOCK_FOLDERS: Folder[] = [
  { id: 'mock-folder-work', name: '工作', parent_id: null, created_at: Date.now() - 30 * 86400000, color: null },
  { id: 'mock-folder-proj', name: '项目', parent_id: 'mock-folder-work', created_at: Date.now() - 20 * 86400000, color: null },
  { id: 'mock-folder-doc', name: '文档', parent_id: 'mock-folder-proj', created_at: Date.now() - 10 * 86400000, color: null },
  { id: 'mock-folder-life', name: '生活', parent_id: null, created_at: Date.now() - 25 * 86400000, color: null },
  { id: 'mock-folder-home', name: '家庭', parent_id: 'mock-folder-life', created_at: Date.now() - 12 * 86400000, color: null },
];

// 上面样例里其余笔记(欢迎/图谱)挂到「工作/项目/文档」
function enrichMockNoteFolders(notes: Note[]): void {
  notes.forEach(n => {
    if (n.id === 'mock-note-daily') n.folder_id = 'mock-folder-proj';
    else if (n.folder_id === null) n.folder_id = 'mock-folder-doc';
  });
}
enrichMockNoteFolders(MOCK_NOTES);

export class MockBackend implements BackendAdapter {
  private notes: Note[] = [...MOCK_NOTES];
  private folders: Folder[] = [...MOCK_FOLDERS];
  /** M2:内存块表(块数组) */
  private blocks: NoteBlock[] = [];
  /** M2:内存历史表(历史数组) */
  private histories: BlockHistoryEntry[] = [];
  /** M3.5b:内存回收站块(软删,可恢复回原笔记) */
  private trashBlocks: TrashBlock[] = [];
  /** M3.5b:内存模板表(内置 + 自定义) */
  private templates: NoteTemplate[] = DEFAULT_TEMPLATES.map((t, i) => ({ ...t, is_builtin: true, created_at: Date.now() - i }));
  /** 内存 id 序号 */
  private seq = 0;
  /** [M4] 内存 git 快照:会话内「导出并提交」产生的假提交历史(仅 Mock 展示用) */
  private mockGitLog: GitLogEntry[] = [];
  /** [M4] 内存 git 假哈希自增 */
  private mockGitSeq = 0;
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
  async gitCommit(message: string): Promise<string | null> {
    return this.mockPushCommit(message);
  }
  async gitLog(count?: number): Promise<GitLogEntry[]> {
    return this.mockGitLog.slice(0, count ?? 20);
  }

  /**
   * [M4 导出版本] Mock:把整库导出为 Obsidian md 文件夹并在文件夹 git add/commit
   * 真实逻辑在 biji-core(DB 取笔记与块 → 导出 md → libgit2 提交),Tauri 壳 M6 接入;
   * 这里仅产生一条带假 hash 的提交记录,展示 GitPanel 导出→提交流程。
   */
  async gitExportAndCommit(message: string): Promise<string | null> {
    if (!message.trim()) return null;
    return this.mockPushCommit(message);
  }

  /** [M4] 生成一条带假 hash 的提交记录并压入 Mock 历史 */
  private mockPushCommit(message: string): string {
    this.mockGitSeq += 1;
    const hash = `a1b2c3${this.mockGitSeq.toString(36).padStart(4, '0')}f${String(this.mockGitSeq).padStart(4, '0')}`;
    const entry: GitLogEntry = {
      hash,
      message,
      date: new Date().toISOString(),
    };
    this.mockGitLog.unshift(entry);
    return hash;
  }

  /**
   * [M4 发布] Mock:主路径走 target_dir(把笔记导出到该目录);否则预设生成器可用返回假目录。
   * 真实静态生成跑在终端/M6 壳,此处演练向导 UI 流程。
   */
  async publishSite(config: PublishConfig): Promise<PublishResult> {
    // 主路径:发布到用户指定的现有博客目录(不绑生成器)
    const target = config.target_dir?.trim();
    if (target) {
      return { success: true, output_path: target };
    }
    const out = config.output_path?.replace(/\/$/, '') || '/导出/站点';
    const dir = config.site_name || 'my-notes';
    return { success: true, output_path: `${out}/${dir}` };
  }

  /**
   * [发布映射预览] 展示会生成哪些文件/路径/frontmatter(Mock:用内存笔记模拟 Astro adapter 的 map)。
   * 真实桌面端走后端 CapabilityRegistry 的 PublishAdapter。
   */
  async previewSite(config: PublishConfig): Promise<PublishPreviewResult> {
    const target = config.target_dir?.trim();
    if (!target) {
      return { success: false, error: '发布目标目录为空。请填写你现有博客的 content/md 目录路径。' };
    }
    const notes = this.notes.filter(n => !n.deleted_at);
    const files = notes.map(n => {
      const title = n.title || '未命名';
      // 剥离已有 frontmatter 作为正文
      const body = n.content.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const fm = `---\ntitle: "${title}"\n${n.tags && n.tags.length ? `tags: [${n.tags.map(t => `"${t}"`).join(', ')}]\n` : ''}---\n\n`;
      return {
        rel_path: `posts/${title}.md`,
        content: fm + (body.trimStart()),
      };
    });
    return {
      success: true,
      framework: 'astro',
      files,
      safety_note: '发布仅新增/覆盖同名 md,绝不删除博客其它文件。请确认你的 Astro 项目用 glob loader 收集该目录。',
    };
  }

  /** [M4 发布] Mock:三个生成器都预设可用,返回版本号(仅供向导「检查可用性」演示) */
  async checkGenerator(generator: string): Promise<[boolean, string | null]> {
    const g = (generator || '').toLowerCase();
    if (g.includes('hugo')) return [true, 'v0.134.2'];
    if (g.includes('astro')) return [true, 'v4.16.1'];
    if (g.includes('vitepress')) return [true, 'v1.6.0'];
    return [false, null];
  }
  async importMarkdown(path: string): Promise<ImportResult> { return { success: true, count: 0 }; }
  async exportMarkdown(path: string): Promise<ImportResult> { return { success: true, count: 0 }; }
  async getPlugins(): Promise<Plugin[]> {
    // [web Mock 默认] 内置一个已启用的番茄钟插件,便于在「添加面板」里体验番茄钟分栏面板
    return [
      { id: 'pomodoro-plugin', name: '番茄钟', version: '0.1.0', description: '专注计时(可作分栏面板)', author: '内置', enabled: true, built_in: true },
    ];
  }
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

  /** 存量 mock 笔记首次访问时懒拆块(确定性 id,时间戳 = 笔记 updated_at + 每块递增偏移) */
  private ensureBlocksForNote(noteId: string): void {
    if (this.blocks.some(b => b.note_id === noteId)) return;
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;
    const base = note.updated_at || Date.now();
    const drafts = splitContentToBlocks(note.content);
    // 块创建时间从 base 往前错开(每块更早一点),供演变视图时间线重排演示
    const tsBase = base - (drafts.length - 1) * 3600_000;
    this.blocks.push(...drafts.map((d, i) => ({
      id: `mock-${noteId}-${i}`,
      note_id: noteId,
      parent_id: null,
      type: d.type,
      content: d.content,
      created_at: tsBase + i * 3600_000,
      updated_at: tsBase + i * 3600_000,
      sort_order: i,
    })));
    // 每块补一条 create 历史快照,块历史弹层有内容可看
    for (let i = 0; i < drafts.length; i++) {
      this.pushHistory(`mock-${noteId}-${i}`, drafts[i].content, 'create', tsBase + i * 3600_000);
    }
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

  async deleteBlock(id: string, permanent = false): Promise<void> {
    const block = this.blocks.find(b => b.id === id);
    if (!block) return;
    this.pushHistory(id, block.content, 'delete', Date.now());
    this.blocks = this.blocks.filter(b => b.id !== id);
    if (!permanent) {
      // M3.5b 软删:进回收站(带原笔记标题 + 删除时间)
      this.trashBlocks.push({
        id: block.id,
        note_id: block.note_id,
        parent_id: block.parent_id,
        type: block.type,
        content: block.content,
        created_at: block.created_at,
        updated_at: block.updated_at,
        sort_order: block.sort_order,
        note_title: this.notes.find(n => n.id === block.note_id)?.title || '',
        deleted_at: Date.now(),
      });
    }
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
    // 懒拆所有存量笔记的块,保证全文按块命中覆盖全部笔记
    this.notes.forEach(n => this.ensureBlocksForNote(n.id));
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

  // ==================== [M3.5a 日历热力图 / 反向链接 / 标签树] ====================

  /** 毫秒 → 本地日 "YYYY-MM-DD"(与后端 millis_to_day 口径一致) */
  private toDay(millis: number): string {
    const d = new Date(millis);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** 懒拆所有存量笔记的块(日历/反向链接需要全量块) */
  private ensureAllBlocks(): void {
    this.notes.forEach(n => !n.deleted_at && this.ensureBlocksForNote(n.id));
  }

  /** 解析块内的 [[wikilink]] 目标标题 */
  private wikilinkTargets(content: string): string[] {
    const targets: string[] = [];
    for (const m of content.matchAll(/\[\[([^\[\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      targets.push(m[1].trim());
    }
    return targets;
  }

  /** 按日统计块活跃(created/updated) */
  async getBlockActivity(dateFrom: number, dateTo: number): Promise<BlockActivity[]> {
    this.ensureAllBlocks();
    const created = new Map<string, number>();
    const updated = new Map<string, number>();
    const bump = (map: Map<string, number>, ts: number) => {
      if (ts < dateFrom || ts > dateTo) return;
      const d = this.toDay(ts);
      map.set(d, (map.get(d) || 0) + 1);
    };
    this.blocks.forEach(b => { bump(created, b.created_at); bump(updated, b.updated_at); });
    const days = new Set([...created.keys(), ...updated.keys()]);
    return [...days].sort().map(date => ({
      date,
      created: created.get(date) || 0,
      updated: updated.get(date) || 0,
    }));
  }

  /** 范围内有写入的块(创建或更新) */
  async getBlocksInRange(dateFrom: number, dateTo: number): Promise<BlockSearchResult[]> {
    this.ensureAllBlocks();
    const alive = new Set(this.notes.filter(n => !n.deleted_at).map(n => n.id));
    return this.blocks
      .filter(b => alive.has(b.note_id) &&
        ((b.created_at >= dateFrom && b.created_at <= dateTo) || (b.updated_at >= dateFrom && b.updated_at <= dateTo)))
      .map(b => ({
        block_id: b.id,
        note_id: b.note_id,
        note_title: this.notes.find(n => n.id === b.note_id)?.title || '',
        content: b.content,
        updated_at: b.updated_at,
      }))
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  /** 引用目标笔记的块(块级反向链接) */
  async getBlockBacklinks(noteId: string): Promise<BlockBacklink[]> {
    this.ensureAllBlocks();
    const target = this.notes.find(n => n.id === noteId);
    if (!target || target.deleted_at) return [];
    const backlinks: BlockBacklink[] = [];
    this.blocks.forEach(b => {
      if (b.note_id === noteId) return;
      const note = this.notes.find(n => n.id === b.note_id);
      if (!note || note.deleted_at) return;
      if (this.wikilinkTargets(b.content).includes(target.title)) {
        backlinks.push({
          block_id: b.id,
          source_note_id: note.id,
          source_note_title: note.title,
          content: b.content,
          created_at: b.created_at,
          updated_at: b.updated_at,
        });
      }
    });
    return backlinks.sort((a, b) => b.updated_at - a.updated_at);
  }

  /** 全部标签及笔记数 */
  async getTags(): Promise<TagCount[]> {
    const map = new Map<string, number>();
    this.notes.filter(n => !n.deleted_at).forEach(n => n.tags.forEach(t => {
      const k = t.toLowerCase();
      map.set(k, (map.get(k) || 0) + 1);
    }));
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /** 按标签列出笔记 */
  async getNotesByTag(tag: string): Promise<Note[]> {
    const lower = tag.toLowerCase();
    return this.notes
      .filter(n => !n.deleted_at && n.tags.some(t => t.toLowerCase() === lower))
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  // ==================== [M3.5b 回收站] ====================

  async getTrashNotes(): Promise<Note[]> {
    return this.notes
      .filter(n => n.deleted_at)
      .sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0));
  }

  async getTrashBlocks(): Promise<TrashBlock[]> {
    return [...this.trashBlocks].sort((a, b) => b.deleted_at - a.deleted_at);
  }

  async restoreNote(id: string): Promise<void> {
    const n = this.notes.find(n => n.id === id);
    if (n) n.deleted_at = null;
  }

  async restoreBlock(id: string): Promise<void> {
    const idx = this.trashBlocks.findIndex(t => t.id === id);
    if (idx < 0) return;
    const t = this.trashBlocks[idx];
    this.trashBlocks.splice(idx, 1);
    this.blocks.push({
      id: t.id, note_id: t.note_id, parent_id: t.parent_id, type: t.type,
      content: t.content, created_at: t.created_at, updated_at: t.updated_at, sort_order: t.sort_order,
    });
  }

  async permanentDeleteNote(id: string): Promise<void> {
    this.notes = this.notes.filter(n => n.id !== id);
    this.trashBlocks = this.trashBlocks.filter(t => t.note_id !== id);
  }

  async permanentDeleteBlock(id: string): Promise<void> {
    this.trashBlocks = this.trashBlocks.filter(t => t.id !== id);
  }

  async emptyTrash(): Promise<void> {
    this.notes = this.notes.filter(n => !n.deleted_at);
    this.trashBlocks = [];
  }

  // ==================== [M3.5b 笔记模板] ====================

  async getTemplates(): Promise<NoteTemplate[]> {
    return [...this.templates];
  }

  async createTemplate(name: string, content: string): Promise<NoteTemplate> {
    const tpl: NoteTemplate = {
      id: this.nextId('tpl'),
      name,
      category: 'custom',
      content,
      is_builtin: false,
      created_at: Date.now(),
    };
    this.templates.push(tpl);
    return tpl;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const tpl = this.templates.find(t => t.id === id);
    if (!tpl || tpl.is_builtin) return false;
    this.templates = this.templates.filter(t => t.id !== id);
    return true;
  }

  // ==================== [M3.5b 导出增强] ====================

  async exportNoteMarkdown(noteId: string): Promise<string> {
    const note = this.notes.find(n => n.id === noteId) || this.notes[0];
    return note.content.trimStart().startsWith('# ')
      ? note.content.trimEnd() + '\n'
      : `# ${note.title}\n\n${note.content.trimEnd()}\n`;
  }

  async exportNoteHtml(noteId: string): Promise<string> {
    const note = this.notes.find(n => n.id === noteId) || this.notes[0];
    // 轻量 md → html(标题/粗体/列表/段落),仅供 Mock 预览导出
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const htmlBody = esc(note.content)
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.*)$/gm, '<li>$1</li>')
      .split(/\n\n+/).map(p => p.includes('<h') ? p : p.includes('<li>') ? `<ul>${p}</ul>` : `<p>${p}</p>`).join('\n');
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(note.title)}</title>
<style>body{font-family:sans-serif;max-width:820px;margin:0 auto;padding:40px;line-height:1.75}h1{border-bottom:2px solid #26a69a;padding-bottom:.3em}code{background:#f0f5f4;padding:.15em .35em;border-radius:4px}blockquote{border-left:4px solid #26a69a;padding:.2em 1em;color:#567}@media print{body{padding:0}}</style>
</head><body><h1>${esc(note.title)}</h1><article>${htmlBody}</article></body></html>`;
  }
}
