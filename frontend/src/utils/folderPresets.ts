// ============================================================
// [顶层目录用途预设] 单笔记库内靠顶层文件夹分类不同用途(日记/手册/知识库/项目)
// 一个顶层目录(parent_id 为 null 的文件夹)可绑定「预设类型 + 模板 + 命名规则」,
// 在该目录下新建笔记时自动套用对应模板与标题命名 —— 本质仍是单库、知识互通,不引入多 vault。
// 纯前端:预设配置存 localStorage,不动后端模型。
// ============================================================
import type { Folder, NoteTemplate } from '../api/backend';

/** 顶层目录用途预设类型 */
export type FolderPresetType = 'diary' | 'manual' | 'knowledge' | 'project' | 'custom' | 'none';

/** 一个顶层目录绑定的预设配置 */
export interface FolderPresetConfig {
  /** 顶层目录(顶层文件夹)的 id */
  folderId: string;
  /** 预设类型:none = 不预设(走原「选模板」弹窗) */
  type: FolderPresetType;
  /** 绑定的模板 id;为空则用该类型默认模板 */
  templateId: string;
  /** 命名规则;支持 {{date}}(当天日期 YYYY-MM-DD)、{{title}}(占位标题) */
  namingPattern: string;
}

/** 预设类型中文名(设置/提示用) */
export const PRESET_LABELS: Record<FolderPresetType, string> = {
  none: '无预设',
  diary: '日记',
  manual: '手册',
  knowledge: '知识库',
  project: '项目',
  custom: '自定义',
};

/** 各预设类型默认绑定模板 id(需与 DEFAULT_TEMPLATES 中的内置模板一致) */
export const PRESET_DEFAULT_TEMPLATE_ID: Record<FolderPresetType, string> = {
  none: '',
  diary: 'diary',
  manual: 'manual',
  knowledge: 'knowledge',
  project: 'project',
  custom: '',
};

/** 各预设类型默认命名规则 */
export const PRESET_DEFAULT_NAMING: Record<FolderPresetType, string> = {
  none: '{{title}}',
  diary: '{{date}}',
  manual: '{{title}}',
  knowledge: '{{title}}',
  project: '{{title}}',
  custom: '{{title}}',
};

/** 内置预设模板内容兜底(后端模板表缺 id 时使用;与 DEFAULT_TEMPLATES 保持一致) */
export const PRESET_FALLBACK_CONTENT: Record<FolderPresetType, string> = {
  none: '',
  diary: '# {{date}}\n\n## 天气\n\n## 今日要点\n\n## 明日计划\n',
  manual: '# {{title}}\n\n## 概述\n\n## 使用\n\n## 配置\n\n## 常见问题\n',
  knowledge: '# {{title}}\n\n## 摘要\n\n## 正文\n\n## 相关笔记\n\n[[相关笔记]]\n',
  project: '# {{title}}\n\n## 目标\n\n## 当前状态:进行中\n\n## 任务\n- [ ] \n\n## 备注\n',
  custom: '',
};

/** 格式化为 YYYY-MM-DD(用于标题命名) */
export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 沿 parent_id 链向上找某目录所属的顶层目录(顶层 = 无父级)。
 * 目录为 null / 找不到返回 null;找不到父级时把自身当作顶层返回。
 */
export function findTopLevelFolder(folders: Folder[], folderId: string | null): Folder | null {
  if (!folderId) return null;
  const byId = new Map<string, Folder>();
  for (const f of folders) byId.set(f.id, f);
  let cur = byId.get(folderId);
  if (!cur) return null;
  while (cur.parent_id && byId.has(cur.parent_id)) {
    cur = byId.get(cur.parent_id)!;
  }
  return cur;
}

/** 取某顶层目录绑定的预设配置;未绑定返回 null */
export function getPresetForFolder(presets: FolderPresetConfig[], topFolderId: string | null): FolderPresetConfig | null {
  if (!topFolderId) return null;
  return presets.find(p => p.folderId === topFolderId) ?? null;
}

/** 新增/覆盖某顶层目录的预设配置 */
export function upsertPreset(presets: FolderPresetConfig[], cfg: FolderPresetConfig): FolderPresetConfig[] {
  const rest = presets.filter(p => p.folderId !== cfg.folderId);
  return [...rest, cfg];
}

/** 移除某顶层目录的预设配置(回到无预设) */
export function removePreset(presets: FolderPresetConfig[], folderId: string): FolderPresetConfig[] {
  return presets.filter(p => p.folderId !== folderId);
}

/** 渲染命名规则:{{date}} → ISO 日期,{{title}} → 空(占位,随后兜底为「无标题」) */
export function renderNamingPattern(pattern: string, isoDate: string): string {
  return (pattern || '').replace(/\{\{date\}\}/g, isoDate).replace(/\{\{title\}\}/g, '');
}

export interface ResolvedPreset {
  type: FolderPresetType;
  title: string;
  content: string;
  templateId: string;
}

/**
 * 解析一条预设配置 → 建新笔记用的「标题 + 内容 + 模板 id」。
 * - 标题 = 命名规则渲染(默认按类型);渲染后为空则兜底「无标题」。
 * - 内容 = 绑定模板(无则类型默认模板)的内容,替换 {{date}}/{{title}}。
 */
export function resolvePreset(
  preset: FolderPresetConfig | null,
  templates: NoteTemplate[],
  today: Date,
): ResolvedPreset {
  const type = preset?.type ?? 'none';
  const isoDate = formatISODate(today);
  const cnDate = today.toLocaleDateString('zh-CN');

  const naming = (preset?.namingPattern && preset.namingPattern.trim())
    ? preset.namingPattern
    : PRESET_DEFAULT_NAMING[type];
  let title = renderNamingPattern(naming, isoDate).trim();
  if (!title) title = '无标题';

  let templateId = preset?.templateId?.trim() || PRESET_DEFAULT_TEMPLATE_ID[type];
  let content = '';
  if (type !== 'none') {
    if (type === 'custom') {
      // 自定义:必须显式绑定模板,否则空白
      const found = templates.find(t => t.id === templateId);
      content = found?.content || '';
    } else {
      const found = templates.find(t => t.id === templateId);
      content = found?.content || PRESET_FALLBACK_CONTENT[type] || '';
    }
    content = content.replace(/\{\{date\}\}/g, cnDate).replace(/\{\{title\}\}/g, title);
  }

  return { type, title, content, templateId: templateId || (content ? type : 'blank') };
}