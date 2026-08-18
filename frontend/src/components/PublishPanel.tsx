import { useState } from 'react';
import { backend } from '../api';
import './PublishPanel.css';

interface PublishPanelProps {
  onClose: () => void;
}

interface GeneratorMeta {
  id: string;
  label: string;
  version?: string | null;
  available: boolean;
  checked: boolean;
}

const GENERATORS: { id: string; label: string; desc: string }[] = [
  { id: 'hugo', label: 'Hugo', desc: 'Go 语言,单二进制,快' },
  { id: 'astro', label: 'Astro', desc: 'Node,组件化,现代' },
  { id: 'vitepress', label: 'VitePress', desc: 'Vue,文档站首选' },
];

/** 内联 SVG 图标(禁 emoji,对齐 bill/商枢) */
function GenIcon({ id }: { id: string }) {
  const common = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  if (id === 'hugo') {
    return <svg {...common}><path d="M4 20V4h16v16" /><rect x="8" y="9" width="8" height="7" rx="1" /></svg>;
  }
  if (id === 'astro') {
    return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5 19 19M19 5l-2.5 2.5M7.5 16.5 5 19" /></svg>;
  }
  return <svg {...common}><path d="M12 3 2 21h20Z" /><path d="M12 9v6" /></svg>;
}

export function PublishPanel({ onClose }: PublishPanelProps) {
  const [gen, setGen] = useState('hugo');
  const [checks, setChecks] = useState<Record<string, GeneratorMeta>>({});
  const [outputPath, setOutputPath] = useState('/导出/站点');
  const [siteName, setSiteName] = useState('My Notes');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output_path?: string; error?: string } | null>(null);

  /** [M4] 检查可用性:Web/Mock 走假实现(预设可用),真实后端 check_generator 查 PATH */
  const handleCheck = async () => {
    const meta: GeneratorMeta = { ...GENERATORS.find(g => g.id === gen)!, available: false, checked: false };
    try {
      const [available, version] = await backend.checkGenerator(gen);
      meta.available = available;
      meta.version = version;
    } catch {
      meta.available = false;
    }
    meta.checked = true;
    setChecks(prev => ({ ...prev, [gen]: meta }));
  };

  /** [M4] 确认发布:Mock 返回假输出目录;真实静态生成跑在终端/M6 壳 */
  const handlePublish = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await backend.publishSite({
        output_path: outputPath,
        generator: gen as any,
        site_name: siteName,
      });
      setResult(r);
    } catch (e: any) {
      setResult({ success: false, error: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const check = checks[gen];
  const canPublish = check?.available === true;

  return (
    <div className="publish-panel">
      <div className="panel-header">
        <h2>发布静态站点</h2>
        <button className="panel-close" onClick={onClose}>关闭</button>
      </div>

      <p className="publish-hint">
        把库(已导出 md 文件夹)交给生成器构建成静态站点。向导流程:选生成器 → 检查可用性 → 确认发布。
        <em>Web/Mock 为演练流程;真实构建需生成器安装于运行环境(M6/Tauri 壳)。</em>
      </p>

      {/* 步骤 1:选生成器 */}
      <div className="publish-step">
        <div className="publish-step-title"><span>1</span>选择生成器</div>
        <div className="gen-cards">
          {GENERATORS.map(g => (
            <button
              key={g.id}
              className={`gen-card ${gen === g.id ? 'active' : ''}`}
              onClick={() => { setGen(g.id); setResult(null); setChecks(prev => ({ ...prev, [g.id]: { ...prev[g.id], available: false, checked: false } })); }}
            >
              <GenIcon id={g.id} />
              <span className="gen-name">{g.label}</span>
              <span className="gen-desc">{g.desc}</span>
            </button>
          ))}
        </div>
        {check?.checked && (
          <div className={`gen-check ${check.available ? 'ok' : 'fail'}`}>
            <span className="dot" />
            {check.available
              ? `与 ${check.label} 正常通信(${check.version || '版本未知'}) — Mock 预设可用`
              : `${check.label} 未检测到 — Mock 预设可用,忽略此提示`}
          </div>
        )}
      </div>

      {/* 步骤 2:检查可用性 */}
      <div className="publish-step">
        <div className="publish-step-title"><span>2</span>检查可用性</div>
        <button onClick={handleCheck} className="btn btn-ghost" disabled={busy}>
          {check?.checked ? '重新检查' : '检查可用性'} {GENERATORS.find(g => g.id === gen)?.label}
        </button>
      </div>

      {/* 步骤 3:确认发布 */}
      <div className="publish-step">
        <div className="publish-step-title"><span>3</span>确认发布</div>
        <div className="publish-form">
          <label>站点名称
            <input type="text" value={siteName} onChange={e => setSiteName(e.target.value)} />
          </label>
          <label>输出目录
            <input type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)} />
          </label>
          <button onClick={handlePublish} disabled={busy || !canPublish} className="btn btn-primary">
            {busy ? '发布中…' : '确认发布'}
          </button>
          {!check?.checked && <span className="publish-tip">请先「检查可用性」再发布。</span>}
        </div>
      </div>

      {result && (
        <div className={`publish-result ${result.success ? 'ok' : 'fail'}`}>
          {result.success
            ? <>发布成功！输出目录:<code>{result.output_path}</code>(Mock)</>
            : <>发布失败:<code>{result.error}</code></>}
        </div>
      )}
    </div>
  );
}
