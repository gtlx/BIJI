import { useState, useEffect, useMemo } from 'react';
import { backend } from '../api';
import type { Plugin } from '../api/backend';
import {
  setFrontendPluginEnabled,
} from '../plugins/registry';
import type { UnifiedPlugin } from '../utils/unifiedPlugins';
import { buildUnifiedPluginList } from '../utils/unifiedPlugins';
import './PluginManagerModal.css';

interface PluginManagerModalProps {
  onClose: () => void;
  onPluginChange: (plugins: Plugin[]) => void;
}

export function PluginManagerModal({ onClose, onPluginChange }: PluginManagerModalProps) {
  const [backendPlugins, setBackendPlugins] = useState<Plugin[]>([]);
  // 前端插件开关后自增,强制重算合并列表(读取 registry 实时 enable 状态)
  const [fpRev, setFpRev] = useState(0);

  useEffect(() => {
    backend.getPlugins().then(setBackendPlugins);
  }, []);

  /** 合并列表:同能力的后端+前端合并成一行「both」,否则各自单独一行(逻辑复用 utils/unifiedPlugins) */
  const merged = useMemo<UnifiedPlugin[]>(() => {
    return buildUnifiedPluginList(backendPlugins);
    // fpRev 变化 → 重新读取前端插件实时 enable 状态
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