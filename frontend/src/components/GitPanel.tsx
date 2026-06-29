import { useState, useEffect } from 'react';
import { backend } from '../api';
import './GitPanel.css';

interface GitPanelProps {
  onClose: () => void;
}

export function GitPanel({ onClose }: GitPanelProps) {
  const [status, setStatus] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [commitMsg, setCommitMsg] = useState('');

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

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    const hash = await backend.gitCommit(commitMsg);
    if (hash) {
      setCommitMsg('');
      const s = await backend.gitStatus();
      setStatus(s);
      const l = await backend.gitLog(10);
      setLog(l);
    }
  };

  return (
    <div className="git-panel">
      <div className="panel-header">
        <h2>Git 版本控制</h2>
        <button className="panel-close" onClick={onClose}>×</button>
      </div>

      <div className="git-section">
        <h3>状态</h3>
        {status && (
          <p>{status.clean ? '工作区干净' : `${status.files.length} 个文件已修改`}</p>
        )}
        {status?.files?.map((f: string, i: number) => (
          <div key={i} className="git-file">{f}</div>
        ))}
      </div>

      <div className="git-section">
        <h3>提交</h3>
        <div className="git-commit-row">
          <input type="text" value={commitMsg} onChange={e => setCommitMsg(e.target.value)} placeholder="提交信息..." />
          <button onClick={handleCommit} className="btn btn-primary">提交</button>
        </div>
      </div>

      <div className="git-section">
        <h3>历史</h3>
        {log.map((entry, i) => (
          <div key={i} className="git-log-entry">
            <span className="git-hash">{entry.hash?.slice(0, 7)}</span>
            <span className="git-msg">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
