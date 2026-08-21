import { useState } from 'react';
import { backend } from '../api';
import './PublishPanel.css';

interface PublishPanelProps {
  onClose: () => void;
}

/** 可选的高级项:自建站点用的生成器(仅 target_dir 为空时走) */
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
  // 主路径:发布到现有博客目录(target_dir 运行时填入,不绑框架)
  const [targetDir, setTargetDir] = useState('');
  // 高级项:自建站点 + 生成器构建(target_dir 为空时走)
  const [advanced, setAdvanced] = useState(false);
  const [gen, setGen] = useState('hugo');
  const [checks, setChecks] = useState<Record<string, GeneratorMeta>>({});
  const [outputPath, setOutputPath] = useState('/导出/站点');
  const [siteName, setSiteName] = useState('My Notes');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output_path?: string; error?: string } | null>(null);
  // [映射预览] 预览结果
  const [preview, setPreview] = useState<{ framework?: string; files?: { rel_path: string; content: string }[]; safety_note?: string; error?: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // [发布映射预览] 先看会生成哪些文件/路径/frontmatter
  const handlePreview = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      if (!targetDir.trim()) {
        setPreview({ error: '发布目标目录为空。请填写你现有博客的 content/md 目录路径。' });
        setPreviewing(false);
        return;
      }
      const p = await backend.previewSite({ target_dir: targetDir.trim() });
      setPreview(p);
    } catch (e: any) {
      setPreview({ error: String(e?.message || e) });
    } finally {
      setPreviewing(false);
    }
  };
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

  const handlePublish = async () => {
    setBusy(true);
    setResult(null);
    try {
      // 主路径:发布到用户指定目录
      if (!advanced) {
        if (!targetDir.trim()) {
          setResult({ success: false, error: '发布目标目录为空。请填写你现有博客的 content/md 目录路径。' });
          setBusy(false);
          return;
        }
        const r = await backend.publishSite({ target_dir: targetDir.trim() });
        setResult(r);
      } else {
        // 高级项:自建站点 + 生成器
        const r = await backend.publishSite({
          target_dir: undefined,
          output_path: outputPath,
          generator: gen as any,
          site_name: siteName,
        });
        setResult(r);
      }
    } catch (e: any) {
      setResult({ success: false, error: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const check = checks[gen];

  return (
    <div className="publish-panel">
      <div className="panel-header">
        <h2>发布静态站点</h2>
        <button className="panel-close" onClick={onClose}>关闭</button>
      </div>

      <p className="publish-hint">
        把笔记导出为 md 发布到你自己的博客目录 —— <strong>不绑定任何博客框架</strong>,
        导出后由你现有的框架(博客/Astro/Hugo/VitePress 等)自行构建部署。
        <em>Web/Mock 为演练流程;真实写盘依赖 Tauri 壳(需在桌面 App 或后端服务里运行)。</em>
      </p>

      {/* ===== 方式选择 ===== */}
      <div className="publish-mode-switch">
        <button
          className={`publish-mode-btn ${!advanced ? 'active' : ''}`}
          onClick={() => { setAdvanced(false); setResult(null); }}
        >
          发布到已有博客目录
        </button>
        <button
          className={`publish-mode-btn ${advanced ? 'active' : ''}`}
          onClick={() => { setAdvanced(true); setResult(null); }}
        >
          高级:自建站点 + 生成器
        </button>
      </div>

      {!advanced ? (
        /* ===== 主路径:发布到已有博客目录 ===== */
        <div className="publish-step">
          <div className="publish-step-title"><span>①</span>目标目录</div>
          <p className="publish-sub-hint">
            填你现有博客的 content/md 目录绝对路径,笔记会以 .md 导出到那里,再交给你博客自己的构建。
          </p>
          <div className="publish-form">
            <label>博客内容目录路径
              <input
                type="text"
                value={targetDir}
                onChange={e => setTargetDir(e.target.value)}
                placeholder="如 /path/to/blog/src/content/posts 或 /path/to/hugo/content"
              />
            </label>
            <button onClick={handlePreview} disabled={previewing} className="btn btn-ghost">
              {previewing ? '生成预览中…' : '映射预览'}
            </button>
            {/* 映射预览:先看到会生成哪些文件/路径/frontmatter */}
            {preview && (
              <div className="publish-preview">
                {preview.error ? (
                  <div className="publish-result fail">{preview.error}</div>
                ) : (
                  <>
                    <div className="publish-preview-head">
                      识别框架:<code>{preview.framework || '?'}</code>
                      <span className="publish-tip">将生成 {preview.files?.length ?? 0} 个文件</span>
                    </div>
                    <div className="publish-preview-files">
                      {preview.files?.map(f => (
                        <details key={f.rel_path} className="publish-preview-file">
                          <summary><code>{f.rel_path}</code></summary>
                          <pre>{f.content}</pre>
                        </details>
                      ))}
                    </div>
                    {preview.safety_note && (
                      <div className="publish-safety-note">⚠️ {preview.safety_note}</div>
                    )}
                  </>
                )}
              </div>
            )}
            <button onClick={handlePublish} disabled={busy} className="btn btn-primary">
              {busy ? '发布中…' : '发布到该目录'}
            </button>
          </div>
        </div>
      ) : (
        /* ===== 高级项:自建站点 + 生成器构建 ===== */
        <>
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

          <div className="publish-step">
            <div className="publish-step-title"><span>2</span>检查可用性</div>
            <button onClick={handleCheck} className="btn btn-ghost" disabled={busy}>
              {check?.checked ? '重新检查' : '检查可用性'} {GENERATORS.find(g => g.id === gen)?.label}
            </button>
          </div>

          <div className="publish-step">
            <div className="publish-step-title"><span>3</span>确认发布</div>
            <div className="publish-form">
              <label>站点名称
                <input type="text" value={siteName} onChange={e => setSiteName(e.target.value)} />
              </label>
              <label>输出目录
                <input type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)} />
              </label>
              <button onClick={handlePublish} disabled={busy || !check?.checked} className="btn btn-primary">
                {busy ? '发布中…' : '确认发布'}
              </button>
              {!check?.checked && <span className="publish-tip">请先「检查可用性」再发布。</span>}
            </div>
          </div>
        </>
      )}

      {result && (
        <div className={`publish-result ${result.success ? 'ok' : 'fail'}`}>
          {result.success
            ? <>发布成功！输出目录:<code>{result.output_path}</code>{advanced && '(Mock)'}</>
            : <>发布失败:<code>{result.error}</code></>}
        </div>
      )}
    </div>
  );
}
