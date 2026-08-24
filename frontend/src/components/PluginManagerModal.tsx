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
 */
interface UnifiedPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  /** backend = 由后端 biji-core 管理;publish 前端入口 + kanban 看板 = frontend */
  source: 'backend' | 'frontend';
}

/** 后端插件 → 统一展示结构 */
function toUnified(p: Plugin): UnifiedPlugin {
  return {
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    enabled: p.enabled,
    source: 'backend',
  };
}

export function PluginManagerModal({ onClose, onPluginChange }: PluginManagerModalProps) {
  const [backendPlugins, setBackendPlugins] = useState<Plugin[]>([]);
  // 前端插件开关后自增,强制重算合并列表(读取 registry 实时 enable 状态)
  const [fpRev, setFpRev] = useState(0);

  useEffect(() => {
    backend.getPlugins().then(setBackendPlugins);
  }, []);

  /** 合并列表:后端插件在前,前端插件在后,一眼可见「发布」「看板」 */
  const merged = useMemo<UnifiedPlugin[]>(() => {
    const frontendItems = getFrontendPluginsForManager().map(
      (p): UnifiedPlugin => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        enabled: p.enabled,
        source: 'frontend',
      }),
    );
    return [...backendPlugins.map(toUnified), ...frontendItems];
  }, [backendPlugins, fpRev]);

  /** 开关动作:后端走 API + App 状态;前端走 localStorage 订阅,互不打架 */
  const handleToggle = async (item: UnifiedPlugin, enabled: boolean) => {
    if (item.source === 'backend') {
      await backend.togglePlugin(item.id, enabled);
      const updated = backendPlugins.map(p => p.id === item.id ? { ...p, enabled } : p);
      setBackendPlugins(updated);
      onPluginChange(updated);
    } else {
      setFrontendPluginEnabled(item.id, enabled);
      setFpRev(r => r + 1);
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
              <div key={`${item.source}:${item.id}`} className="plugin-item">
                <div className="plugin-info">
                  <div className="plugin-name-row">
                    <span className="plugin-name">{item.name}</span>
                    <span className="plugin-source">
                      {item.source === 'backend' ? '后端' : '前端'}
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