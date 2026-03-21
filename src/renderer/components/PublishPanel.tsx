import { useState } from 'react';
import './PublishPanel.css';

interface PublishPanelProps {
  onClose: () => void;
}

const GENERATORS = [
  { id: 'hugo', name: 'Hugo', description: '快速、灵活的静态网站生成器' },
  { id: 'astro', name: 'Astro', description: '现代静态站点构建工具' },
  { id: 'vitepress', name: 'VitePress', description: 'Vue 驱动的静态网站生成器' },
];

export function PublishPanel({ onClose }: PublishPanelProps) {
  const [generator, setGenerator] = useState('hugo');
  const [siteName, setSiteName] = useState('我的笔记');
  const [baseUrl, setBaseUrl] = useState('/');
  const [outputPath, setOutputPath] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [generatorStatus, setGeneratorStatus] = useState<Record<string, { available: boolean; version?: string }>>({});

  useState(() => {
    checkGenerators();
  });

  async function checkGenerators() {
    const status: Record<string, { available: boolean; version?: string }> = {};
    for (const gen of GENERATORS) {
      try {
        const result = await window.electronAPI.publishCheck(gen.id);
        status[gen.id] = result;
      } catch {
        status[gen.id] = { available: false };
      }
    }
    setGeneratorStatus(status);
  }

  async function handleSelectPath() {
    const path = await window.electronAPI.selectPath();
    if (path) {
      setOutputPath(path);
    }
  }

  async function handlePublish() {
    if (!outputPath) {
      setResult({ success: false, message: '请选择输出路径' });
      return;
    }

    setIsPublishing(true);
    setResult(null);

    try {
      const publishResult = await window.electronAPI.publishSite({
        outputPath,
        generator,
        siteName,
        baseUrl,
      });

      if (publishResult.success) {
        setResult({ success: true, message: `发布成功！输出目录: ${publishResult.outputPath}` });
      } else {
        setResult({ success: false, message: publishResult.error || '发布失败' });
      }
    } catch (error) {
      setResult({ success: false, message: String(error) });
    }

    setIsPublishing(false);
  }

  return (
    <div className="publish-panel">
      <div className="publish-header">
        <h3>发布网站</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="publish-content">
        <div className="publish-section">
          <h4>选择生成器</h4>
          <div className="generator-list">
            {GENERATORS.map(gen => (
              <label
                key={gen.id}
                className={`generator-item ${generator === gen.id ? 'selected' : ''} ${!generatorStatus[gen.id]?.available ? 'unavailable' : ''}`}
              >
                <input
                  type="radio"
                  name="generator"
                  value={gen.id}
                  checked={generator === gen.id}
                  onChange={(e) => setGenerator(e.target.value)}
                  disabled={!generatorStatus[gen.id]?.available}
                />
                <div className="generator-info">
                  <div className="generator-name">
                    {gen.name}
                    {!generatorStatus[gen.id]?.available && (
                      <span className="not-installed">未安装</span>
                    )}
                    {generatorStatus[gen.id]?.available && generatorStatus[gen.id]?.version && (
                      <span className="version">{generatorStatus[gen.id].version}</span>
                    )}
                  </div>
                  <div className="generator-desc">{gen.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="publish-section">
          <h4>网站设置</h4>
          <div className="form-group">
            <label>站点名称</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="我的笔记"
            />
          </div>
          <div className="form-group">
            <label>基础路径</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="/"
            />
          </div>
        </div>

        <div className="publish-section">
          <h4>输出设置</h4>
          <div className="form-group">
            <label>输出路径</label>
            <div className="path-input">
              <input
                type="text"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                placeholder="选择输出目录..."
                readOnly
              />
              <button className="btn btn-secondary" onClick={handleSelectPath}>
                选择
              </button>
            </div>
          </div>
        </div>

        {result && (
          <div className={`publish-result ${result.success ? 'success' : 'error'}`}>
            {result.message}
          </div>
        )}
      </div>

      <div className="publish-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="btn btn-primary"
          onClick={handlePublish}
          disabled={isPublishing || !outputPath || !generatorStatus[generator]?.available}
        >
          {isPublishing ? '发布中...' : '发布'}
        </button>
      </div>
    </div>
  );
}
