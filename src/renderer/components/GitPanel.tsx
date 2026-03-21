import { useState, useEffect } from 'react';
import './GitPanel.css';

interface GitPanelProps {
  onClose: () => void;
}

interface Commit {
  hash: string;
  message: string;
  date: string;
}

export function GitPanel({ onClose }: GitPanelProps) {
  const [status, setStatus] = useState<{ files: string[]; clean: boolean }>({ files: [], clean: true });
  const [log, setLog] = useState<Commit[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'status' | 'history'>('status');
  const [isCommitting, setIsCommitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [statusResult, logResult] = await Promise.all([
        window.electronAPI.gitStatus(),
        window.electronAPI.gitLog(20),
      ]);
      setStatus(statusResult);
      setLog(logResult);
    } catch (error) {
      console.error('Failed to load git data:', error);
    }
    setIsLoading(false);
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      await window.electronAPI.gitAddAll();
      const result = await window.electronAPI.gitCommit(commitMessage);
      if (result.success) {
        setCommitMessage('');
        await loadData();
      }
    } catch (error) {
      console.error('Failed to commit:', error);
    }
    setIsCommitting(false);
  }

  if (isLoading) {
    return (
      <div className="git-panel">
        <div className="git-header">
          <h3>版本控制</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="git-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-header">
        <h3>版本控制</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="git-tabs">
        <button
          className={`git-tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          状态
        </button>
        <button
          className={`git-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          历史
        </button>
      </div>

      <div className="git-content">
        {activeTab === 'status' && (
          <div className="git-status">
            {!status.clean ? (
              <>
                <div className="status-info">
                  <span className="status-badge modified">有修改</span>
                  <span>{status.files.length} 个文件</span>
                </div>
                <div className="file-list">
                  {status.files.map((file, i) => (
                    <div key={i} className="file-item">{file}</div>
                  ))}
                </div>
                <div className="commit-form">
                  <textarea
                    placeholder="提交信息..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    rows={3}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleCommit}
                    disabled={isCommitting || !commitMessage.trim()}
                  >
                    {isCommitting ? '提交中...' : '提交'}
                  </button>
                </div>
              </>
            ) : (
              <div className="no-changes">
                <p>没有待提交的更改</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="git-history">
            {log.length > 0 ? (
              <div className="commit-list">
                {log.map((commit, i) => (
                  <div key={i} className="commit-item">
                    <div className="commit-hash">{commit.hash.slice(0, 7)}</div>
                    <div className="commit-info">
                      <div className="commit-message">{commit.message}</div>
                      <div className="commit-date">
                        {new Date(commit.date).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-commits">
                <p>暂无提交记录</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="git-footer">
        <button className="btn btn-secondary" onClick={loadData}>
          刷新
        </button>
      </div>
    </div>
  );
}
