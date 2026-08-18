import { useState, useEffect } from 'react';
import { backend } from '../api';
import './GitPanel.css';

interface GitPanelProps {
  onClose: () => void;
  /** [M4] 从 Git 面板跳转到发布向导(activeNav -> publish) */
  onOpenPublish?: () => void;
}

export function GitPanel({ onClose, onOpenPublish }: GitPanelProps) {
  const [status, setStatus] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [exportMsg, setExportMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        await backend.gitInit();
        const s = await backend.gitStatus();
        setStatus(s);
        const l = await backend.gitLog(10);
        setLog(l);
      } catch (e) {
        console.error('Git error:', e);
      }
    };
    load();
  }, []);

  /** [M4] 导出并提交:库 → Obsidian md 文件夹 → git add+commit(mock 生成假 hash,真实逻辑在 biji-core) */
  const handleExportCommit = async () => {
    if (!exportMsg.trim() || busy) return;
    setBusy(true);
    try {
      const hash = await backend.gitExportAndCommit(exportMsg.trim());
      if (hash) {
        setExportMsg('');
        const [s, l] = await Promise.all([backend.gitStatus(), backend.gitLog(10)]);
        setStatus(s);
        setLog(l);
      }
    } finally {
      setBusy(false);
    }
  };

  /** 手动提交一条(独立于导出,v0 已接入 invoke/git_commit) */
  const handleCommit = async () => {
    if (!exportMsg.trim() || busy) return;
    setBusy(true);
    try {
      const hash = await backend.gitCommit(exportMsg.trim());
      if (hash) {
        setExportMsg('');
        const [s, l] = await Promise.all([backend.gitStatus(), backend.gitLog(10)]);
        setStatus(s);
        setLog(l);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="git-panel">
      <div className="panel-header">
        <h2>Git 版本控制</h2>
        <button className="panel-close" onClick={onClose}>关闭</button>
      </div>

      <div className="git-section">
        <h3>导出状态</h3>
        {status && (
          <p className="git-status-line">
            {status.clean ? '工作区干净 ✓' : `${status.files.length} 个文件已修改`}
          </p>
        )}
        {status?.files?.map((f: string, i: number) => (
          <div key={i} className="git-file">{f}</div>
        ))}
        <p className="git-note">
          库以 Obsidian 兼容 md 文件夹导出(每块带时间戳注释),git 管理其版本快照;块历史仍在数据库。
          <em>Web/Mock 模式为假数据,真实 git 由 Tauri 壳(M6)执行。</em>
        </p>
      </div>

      <div className="git-section">
        <h3>导出并提交</h3>
        <div className="git-commit-row">
          <input
            type="text"
            value={exportMsg}
            onChange={e => setExportMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleExportCommit(); }}
            placeholder="提交信息,如: 库快照 2026-08-18"
          />
          <button onClick={handleExportCommit} disabled={busy} className="btn btn-primary">
            导出并提交
          </button>
        </div>
        {onOpenPublish && (
          <div className="git-publish-entry">
            <span>导出后可发布为静态站点</span>
            <button onClick={onOpenPublish} className="btn btn-ghost">前往发布向导 →</button>
          </div>
        )}
      </div>

      <div className="git-section">
        <h3>版本历史</h3>
        {log.length === 0 && <p className="git-empty">暂无提交记录,试试「导出并提交」。</p>}
        {log.map((entry, i) => (
          <div key={i} className="git-log-entry">
            <span className="git-hash">{entry.hash?.slice(0, 7)}</span>
            <span className="git-msg">{entry.message}</span>
            <span className="git-date">{entry.date ? new Date(entry.date).toLocaleString() : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
