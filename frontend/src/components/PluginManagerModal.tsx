import { useState, useEffect, useMemo } from 'react';
import { backend } from '../api';
import type { Plugin } from '../api/backend';
import {
  getFrontendPluginsForManager,
  setFrontendPluginEnabled,
} from '../plugins/registry';
import './PluginManagerModal.css';

interface PluginManagerModalProps {
  onClose: () => void;
  onPluginChange: (plugins: Plugin[]) => void;
}

/**
 * 统一展示结构:后端插件(Promise 异步)与前端插件(同步数组)合并显示。
 * 二者来源/持久化方式不同,故显示层统一转成同构结构,开关动作各自分派。
 *
 * 同能力合并:同一能力分「后端能力插件」+「前端入口插件」两层(如发布:
 * 后端 publish-plugin 提供 publish 能力 + 前端 publish 注册为入口),
 * 插件管理里合并成一行「能力+入口」,避免出现两个「发布」。看板/日历等
 * 纯前端插件无同名后端插件,各自单独一行。
 */
interface UnifiedPlugin {
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

export function PluginManagerModal({ onClose, onPluginChange }: PluginManagerModalProps) {
  const [backendPlugins, setBackendPlugins] = useState<Plugin[]>([]);
  // 前端插件开关后自增,强制重算合并列表(读取 registry 实时 enable 状态)
  const [fpRev, setFpRev] = useState(0);

  useEffect(() => {
    backend.getPlugins().then(setBackendPlugins);
  }, []);

  /** 合并列表:同能力的后端+前端合并成一行「both」,否则各自单独一行 */
  const merged = useMemo<UnifiedPlugin[]>(() => {
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
  }, [backendPlugins, fpRev]);

  /**
   * 开关动作:后端走 API + App 状态;前端走 localStorage 订阅、互不打架。
   * 合并行(source=both)同一能力两端一起切:关 = 能力停 + 入口停,开 = 两端都恢复。
   */
  const handleToggle = async (item: UnifiedPlugin, enabled: boolean) => {
    if (item.source === 'both' || item.source === 'backend') {
      if (item.backendId) {
        await backend.togglePlugin(item.backendId, enabled);
        const updated = backendPlugins.map(p => p.id === item.backendId ? { ...p, enabled } : p);
        setBackendPlugins(updated);
        onPluginChange(updated);
      }
    }
    if (item.source === 'both' || item.source === 'frontend') {
      if (item.frontendId) {
        setFrontendPluginEnabled(item.frontendId, enabled);
        setFpRev(r => r + 1);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal plugin-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">插件管理</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="plugin-list">
          {merged.length === 0 ? (
            <p className="plugin-empty">正在加载插件列表…</p>
          ) : (
            merged.map(item => (
              <div key={item.id} className="plugin-item">
                <div className="plugin-info">
                  <div className="plugin-name-row">
                    <span className="plugin-name">{item.name}</span>
                    <span className="plugin-source">
                      {item.source === 'both' ? '能力+入口' : item.source === 'backend' ? '后端' : '前端'}
                    </span>
                  </div>
                  <span className="plugin-version">v{item.version}</span>
                  <p className="plugin-description">{item.description}</p>
                </div>
                <div className="plugin-actions">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={e => handleToggle(item, e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}