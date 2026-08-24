// ============================================================
// [设置优化] 统一插件展示结构 —— 后端插件与前端插件合并显示
// 抽自 PluginManagerModal,供「插件管理弹窗」与「设置→插件」两处复用,
// 避免同一套合并逻辑(同能力合并 / 来源徽标)重复实现两遍。
// ============================================================
import type { Plugin } from '../api/backend';
import { getFrontendPluginsForManager } from '../plugins/registry';

/** 统一展示结构:后端插件(Promise 异步)与前端插件(同步数组)合并显示。
 *  二者来源/持久化方式不同,故显示层统一转成同构结构,开关动作各自分派。
 *
 *  同能力合并:同一能力分「后端能力插件」+「前端入口插件」两层(如发布:
 *  后端 publish-plugin 提供 publish 能力 + 前端 publish 注册为入口),
 *  插件管理里合并成一行「能力+入口」,避免出现两个「发布」。看板/日历等
 *  纯前端插件无同名后端插件,各自单独一行。 */
export interface UnifiedPlugin {
  /** 展示用稳定键(合并行 = 'backend:xxx/frontend:yyy') */
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  /** backend = 仅后端能力插件;frontend = 仅前端入口插件;both = 同能力前后端合并 */
  source: 'backend' | 'frontend' | 'both';
  /** 对应的后端插件 id(backend/both 时存在) */
  backendId?: string;
  /** 对应的前端插件 id(frontend/both 时存在) */
  frontendId?: string;
}

/** 后端插件 → 统一展示结构 */
function toUnified(p: Plugin): UnifiedPlugin {
  return {
    id: `backend:${p.id}`,
    name: p.name,
    version: p.version,
    description: p.description,
    enabled: p.enabled,
    source: 'backend',
    backendId: p.id,
  };
}

/** 前端插件 → 统一展示结构 */
function frontToUnified(p: {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}): UnifiedPlugin {
  return {
    id: `frontend:${p.id}`,
    name: p.name,
    version: p.version,
    description: p.description,
    enabled: p.enabled,
    source: 'frontend',
    frontendId: p.id,
  };
}

/** 合并全部后端 + 前端插件为统一列表(同能力合并为「both」一行) */
export function buildUnifiedPluginList(backendPlugins: Plugin[]): UnifiedPlugin[] {
  const backends = backendPlugins.map(toUnified);
  const frontends = getFrontendPluginsForManager().map(frontToUnified);

  const rows: UnifiedPlugin[] = [];
  const takenFrontend = new Set<string>();
  // 后端在前:发现同名前端入口 → 合并为「能力+入口」一行
  for (const b of backends) {
    const fr = frontends.find(f => f.name === b.name && !takenFrontend.has(f.id));
    if (fr) {
      takenFrontend.add(fr.id);
      rows.push({
        ...b,
        id: `${b.id}/${fr.id}`,
        source: 'both',
        frontendId: fr.frontendId,
        // 同能力开关合一:两端都开着才显示启用
        enabled: b.enabled && fr.enabled,
      });
    } else {
      rows.push(b);
    }
  }
  // 剩余前端插件(看板/日历等纯前端)单独一行
  for (const f of frontends) {
    if (!takenFrontend.has(f.id)) rows.push(f);
  }
  return rows;
}