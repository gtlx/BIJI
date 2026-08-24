// ============================================================
// [软件数据导入导出] 完整迁移/备份
// 目标:把「软件数据」(非笔记)的全部配置导成一个 JSON,并可导入恢复 ——
// 设置(主题/字号/快捷键/番茄钟时长等)、前端插件开关、顶层目录预设、
// 面板布局(paneLayout)、侧栏宽度、标签条偏好、文件树展开、看板列排序、
// 编辑器块时间戳/演变模式开关等。
// 语义:备份软件配置,换机/重置后一键还原;不含任何笔记正文(笔记导出是另一按钮)。
// 纯前端:本地 JSON 下载/读取 + localStorage 读写,不依赖后端与 Tauri 写盘。
// ============================================================
import type { AppSettings } from '../api/backend';

/** 本应用「软件配置」用到的全部 localStorage 键(App / SettingsModal / 面板 / 插件注册表等)。 */
export const SOFTWARE_CONFIG_KEYS: string[] = [
  'biji.sidebarWidth',            // [拖拽调宽] 左侧栏宽度
  'biji.rightDockWidth',          // [拖拽调宽] 右 dock 宽度
  'biji.openNoteTabs',            // [渐进多标签] 打开历史标签(ids + activeId)
  'biji.noteTabPosition',         // [渐进多标签] 标签条排列偏好(top / left)
  'biji.folderPresets',           // [顶层目录预设] 顶层目录 → 模板/命名 映射
  'biji.paneLayout.v2',           // [Pane] 工作区面板布局(主/左/右/隐藏)
  'biji.paneLayout.v1',           // [Pane] 旧版布局(迁移参考,一并备份)
  'biji.frontend-plugin.enabled', // [插件] 被显式禁用的前端插件集合
  'biji.tree.expanded',           // [文件树] 文件夹展开状态
  'biji.kanban.column-order',     // [看板] 各列卡片排序记忆
  'biji.show_block_timestamps',   // [编辑器] 块时间戳开关
  'biji.timeline_mode',           // [编辑器] 演变(时间线)模式开关
];

/** 软件数据备份文件版本号(结构变化时递增) */
export const SOFTWARE_BACKUP_VERSION = 1;

/** 软件数据备份的数据结构 */
export interface SoftwareBackup {
  /** 应用名(识别用) */
  app: string;
  /** 备份类型标识(校验导入文件是否是本应用导出) */
  type: 'biji-software-config-backup';
  /** 备份格式版本号 */
  version: number;
  /** 导出时间(ISO;供恢复时展示/去重) */
  exportedAt: string;
  /** 设置/快捷键/番茄钟等(经 onSave 落库后即时生效;web Mock 为内存库,真实壳为后端) */
  settings: AppSettings | null;
  /** 其余纯 localStorage 配置键写照(键 → 原始字符串值) */
  localStorage: Record<string, string>;
}

/** 采集当前存在的全部软件配置 localStorage 键(只读;不存在的键不写入) */
export function collectLocalConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const key of SOFTWARE_CONFIG_KEYS) {
      const v = localStorage.getItem(key);
      if (v !== null) out[key] = v;
    }
  } catch { /* 隐私模式等不可用时静默 */ }
  return out;
}

/** 组装软件数据备份对象(导出用) */
export function buildSoftwareBackup(settings: AppSettings): SoftwareBackup {
  return {
    app: 'Biji Note',
    type: 'biji-software-config-backup',
    version: SOFTWARE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...settings },
    localStorage: collectLocalConfig(),
  };
}

/** 触发浏览器下载一个 JSON 文件(web Mock 下可用;Tauri 壳同走浏览器下载) */
export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 解析导入的软件数据 JSON(非法/非本应用产物返回 null) */
export function parseSoftwareBackup(text: string): SoftwareBackup | null {
  try {
    const p = JSON.parse(text) as Partial<SoftwareBackup>;
    if (!p || p.type !== 'biji-software-config-backup') return null;
    const ls = p.localStorage;
    return {
      app: String(p.app ?? 'Biji Note'),
      type: 'biji-software-config-backup',
      version: Number(p.version) || SOFTWARE_BACKUP_VERSION,
      exportedAt: typeof p.exportedAt === 'string' ? p.exportedAt : '',
      settings: p.settings && typeof p.settings === 'object' ? p.settings : null,
      localStorage: ls && typeof ls === 'object' ? ls : {},
    };
  } catch { return null; }
}

/** 把备份里的 localStorage 键逐条写回;返回实际写回的条数(仅供提示) */
export function writeBackupLocalKeys(localStorageMap: Record<string, string>): number {
  let n = 0;
  try {
    for (const [key, value] of Object.entries(localStorageMap)) {
      localStorage.setItem(key, value);
      n += 1;
    }
  } catch { /* 隐私模式等不可用时静默 */ }
  return n;
}