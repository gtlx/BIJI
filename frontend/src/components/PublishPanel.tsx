import { useState } from 'react';
import { backend } from '../api';
import './PublishPanel.css';

interface PublishPanelProps {
  onClose: () => void;
}

export function PublishPanel({ onClose }: PublishPanelProps) {
  const [generator, setGenerator] = useState('hugo');
  const [outputPath, setOutputPath] = useState('');

  const handlePublish = async () => {
    if (!outputPath) return;
    const result = await backend.publishSite({
      output_path: outputPath,
      generator: generator as any,
      site_name: 'My Notes',
    });
    if (result.success) {
      alert(`发布成功！输出目录: ${result.output_path}`);
    } else {
      alert(`发布失败: ${result.error}`);
    }
  };

  return (
    <div className="publish-panel">
      <div className="panel-header">
        <h2>发布站点</h2>
        <button className="panel-close" onClick={onClose}>×</button>
      </div>
      <div className="publish-form">
        <label>生成器
          <select value={generator} onChange={e => setGenerator(e.target.value)}>
            <option value="hugo">Hugo</option>
            <option value="astro">Astro</option>
            <option value="vitepress">VitePress</option>
          </select>
        </label>
        <label>输出路径
          <input type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)} placeholder="/path/to/output" />
        </label>
        <button onClick={handlePublish} className="btn btn-primary">发布</button>
      </div>
    </div>
  );
}
