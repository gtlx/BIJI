import { useState } from 'react';
import { backend } from '../api';
import './PublishPanel.css';

interface PublishPanelProps {
  onClose: () => void;
}

/**
 * [渐进多标签无关]
 * 发布静态站点向导。UI/流程打磨(仍走 mock-adapter 的 previewSite/publishSite,不真写盘)。
 * 主路径:三步向导 —— 选目标 → 预览映射 → 发布(步骤感 + target 校验 + 文件树/frontmatter 高亮 + 友好反馈)。
 * 高级项:自建站点(选生成器 → 检查可用性 → 确认发布),交互增强。
 */

/** 可选的高级项:自建站点用的生成器 */
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

/** 主路径三步:选目标 / 预览映射 / 发布 */
type MainStep = 'target' | 'preview' | 'publish';

/** 内联 SVG 图标(禁 emoji) */
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

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.4 4.1A2 2 0 0 0 7.7 3.3H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2Z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/** frontmatter 高亮的文件内容:YAML 头高亮,正文普通 */
function HighlightedContent({ content }: { content: string }) {
  const m = content.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  if (m) {
    return (
      <pre className="pp-file-content">
        <span className="pp-fm">{m[1]}</span>{m[2]}
      </pre>
    );
  }
  return <pre className="pp-file-content">{content}</pre>;
}

/** 树节点:目录(children)或文件(file) */
interface PsNode {
  name: string;
  children?: PsNode[];
  file?: { rel_path: string; content: string };
}

/** 把 {rel_path, content}[] 聚合成目录树 */
function buildTree(files: { rel_path: string; content: string }[]): PsNode[] {
  const root: PsNode[] = [];
  for (const f of files) {
    const segments = f.rel_path.split('/').filter(Boolean);
    let level = root;
    segments.forEach((seg, i) => {
      const last = i === segments.length - 1;
      if (last) {
        level.push({ name: seg, file: f });
      } else {
        let dir = level.find(n => !n.file && n.name === seg);
        if (!dir) { dir = { name: seg, children: [] }; level.push(dir); }
        level = dir.children!;
      }
    });
  }
  return root;
}

/** 递归渲染目录树(文件可展开看内容) */
function renderTreeNode(node: PsNode, depth: number, key: string): React.ReactNode {
  if (node.file) {
    return (
      <details key={key} className="pp-preview-file" open={depth === 0}>
        <summary className="pp-file-node" style={{ paddingLeft: 8 + depth * 14 }}>
          <span className="pp-file-icon"><FileIcon /></span>
          <span className="pp-file-name">{node.name}</span>
        </summary>
        <HighlightedContent content={node.file.content} />
      </details>
    );
  }
  return (
    <div key={`${key}-dir`}>
      <div className="pp-dir-node" style={{ paddingLeft: 8 + depth * 14 }}>
        <span className="pp-dir-icon"><FolderIcon /></span>
        <span className="pp-dir-name">{node.name}/</span>
      </div>
      {/* 递归渲染子目录/文件,让文件树完整展开(目录下一层层缩进) */}
      {node.children!.map((c, j) => renderTreeNode(c, depth + 1, `${key}-${j}`))}
    </div>
  );
}

export function PublishPanel({ onClose }: PublishPanelProps) {
  // 方式:主路径(发布到已有博客目录)/ 高级项(自建站点 + 生成器)
  const [advanced, setAdvanced] = useState(false);
  const [targetDir, setTargetDir] = useState('');
  // target 校验(提交时显示;空 → 必填错误,非绝对路径 → 格式提示)
  const [targetError, setTargetError] = useState<string | null>(null);
  // 主路径三步
  const [step, setStep] = useState<MainStep>('target');
  // 高级项
  const [gen, setGen] = useState('hugo');
  const [checks, setChecks] = useState<Record<string, GeneratorMeta>>({});
  const [outputPath, setOutputPath] = useState('/导出/站点');
  const [siteName, setSiteName] = useState('My Notes');
  // 映射预览 / 发布结果
  const [preview, setPreview] = useState<{ framework?: string; files?: { rel_path: string; content: string }[]; safety_note?: string; error?: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output_path?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /** 校验 target_dir:必填;建议绝对路径(带示例/格式提示) */
  const validateTarget = (val: string): string | null => {
    const t = val.trim();
    if (!t) return '发布目标目录不能为空。';
    if (!t.startsWith('/') && !t.startsWith('.')) return '建议填写绝对路径(以 / 开头)或相对路径(以 ./ 开头)。';
    return null;
  };

  /** 切到预览映射步:校验目标 + 触发 previewSite */
  const goPreview = async () => {
    const err = validateTarget(targetDir);
    setTargetError(err);
    if (err) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const p = await backend.previewSite({ target_dir: targetDir.trim() });
      setPreview(p);
      setStep('preview');
    } catch (e: any) {
      setPreview({ error: String(e?.message || e) });
      setStep('preview');
    } finally {
      setPreviewing(false);
    }
  };

  /** 主路径发布:走 publishSite(Mock),成功/失败进「发布」步展示结果卡 */
  const handlePublish = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await backend.publishSite({ target_dir: targetDir.trim() });
      setResult(r);
    } catch (e: any) {
      setResult({ success: false, error: String(e?.message || e) });
    } finally {
      setBusy(false);
      setStep('publish');
    }
  };

  // ---- 高级项 ----
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
  const handleAdvancedPublish = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await backend.publishSite({
        target_dir: undefined,
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
  const tree = preview?.files ? buildTree(preview.files) : [];
  const fileCount = preview?.files?.length ?? 0;

  const switchMode = (adv: boolean) => {
    setAdvanced(adv);
    setResult(null);
    setPreview(null);
    setStep('target');
  };

  /** 顶部步骤条(主路径):目标 → 预览 → 发布 */
  const renderStepBar = () => {
    const order: MainStep[] = ['target', 'preview', 'publish'];
    const labels: Record<MainStep, string> = { target: '选目标', preview: '预览映射', publish: '发布' };
    const cur = order.indexOf(step);
    return (
      <div className="pp-stepbar">
        {order.map((s, i) => (
          <div key={s} className={`pp-step ${i === cur ? 'active' : i < cur ? 'done' : ''}`}>
            <span className="pp-step-num">{i < cur ? <CheckIcon /> : i + 1}</span>
            <span className="pp-step-label">{labels[s]}</span>
            {i < order.length - 1 && <span className="pp-step-line" />}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="publish-panel">
      <div className="panel-header">
        <h2>发布静态站点</h2>
        <button className="panel-close" onClick={onClose}>关闭</button>
      </div>

      <p className="publish-hint">
        把笔记导出为 md 发布到你自己的博客目录 —— <strong>不绑定任何博客框架</strong>。
        <em>Web/Mock 演练流程,数据走 mock-adapter;真实写盘依赖 Tauri 壳(桌面 App / 后端服务)。</em>
      </p>

      {/* ===== 方式选择 ===== */}
      <div className="publish-mode-switch">
        <button className={`publish-mode-btn ${!advanced ? 'active' : ''}`} onClick={() => switchMode(false)}>
          发布到已有博客目录
        </button>
        <button className={`publish-mode-btn ${advanced ? 'active' : ''}`} onClick={() => switchMode(true)}>
          高级:自建站点 + 生成器
        </button>
      </div>

      {!advanced ? (
        /* ===== 主路径:三步向导 ===== */
        <>
          {renderStepBar()}

          {/* 步骤① 选目标 */}
          {step === 'target' && (
            <div className="publish-step">
              <div className="publish-step-title"><span>1</span>目标目录</div>
              <p className="publish-sub-hint">
                填你现有博客的 content/md 目录绝对路径,笔记会以 .md 导出到那里,再交给你博客自己构建。
              </p>
              <div className="publish-form">
                <label>博客内容目录路径
                  <input
                    type="text"
                    value={targetDir}
                    onChange={e => { setTargetDir(e.target.value); if (targetError) setTargetError(null); }}
                    placeholder="如 /path/to/blog/content/posts"
                    className={targetError ? 'input-invalid' : ''}
                    aria-invalid={!!targetError}
                  />
                </label>
                {/* 校验 / 示例提示 */}
                <p className={`pp-field-hint ${targetError ? 'error' : ''}`}>
                  {targetError
                    ? targetError
                    : '示例:/path/to/blog/content/posts 或 ./content(建议绝对路径)'}
                </p>
                <button onClick={goPreview} disabled={previewing} className="btn btn-primary">
                  {previewing ? '生成预览中…' : '下一步 : 预览映射'}
                </button>
              </div>
            </div>
          )}

          {/* 步骤② 预览映射:文件树 + frontmatter 高亮 + 醒目安全提示 */}
          {step === 'preview' && (
            <div className="publish-step">
              <div className="publish-step-title"><span>2</span>发布映射预览</div>
              {preview?.error ? (
                <div className="publish-result fail">{preview.error}</div>
              ) : (
                <>
                  <div className="pp-preview-head">
                    <span className="pp-framework">识别框架:<code>{preview?.framework || '?'}</code></span>
                    <span className="publish-tip">将生成 {fileCount} 个 .md 文件</span>
                  </div>
                  {/* 文件树视图 */}
                  <div className="pp-preview-tree">
                    {tree.map((node, i) => renderTreeNode(node, 0, `node-${i}`))}
                  </div>
                  {/* 醒目安全提示 */}
                  {preview?.safety_note && (
                    <div className="pp-safety-note">
                      <span className="pp-warn-icon"><WarnIcon /></span>
                      <span>{preview.safety_note}</span>
                    </div>
                  )}
                </>
              )}
              <div className="pp-nav-row">
                <button onClick={() => setStep('target')} className="btn btn-ghost">上一步 : 修改目标</button>
                <button onClick={handlePublish} disabled={busy} className="btn btn-primary">
                  {busy ? '发布中…' : `发布 ${fileCount} 个文件`}
                </button>
              </div>
            </div>
          )}

          {/* 步骤③ 发布结果:成功/失败反馈友好 */}
          {step === 'publish' && (
            <div className="publish-step">
              <div className="publish-step-title"><span>3</span>发布结果</div>
              {result ? (
                result.success ? (
                  <div className="pp-result-card ok">
                    <div className="pp-result-title"><span className="pp-result-icon ok"><CheckIcon /></span>发布成功</div>
                    <p className="pp-result-line">已将 <strong>{fileCount}</strong> 个 .md 文件发布到目标目录。</p>
                    <p className="pp-result-path">输出目录:<code>{result.output_path}</code></p>
                    <p className="pp-result-hint">这是 Mock 演练结果。真实写盘在 Tauri 壳中执行,会按此映射写入博客目录。</p>
                  </div>
                ) : (
                  <div className="pp-result-card fail">
                    <div className="pp-result-title"><span className="pp-result-icon fail"><WarnIcon /></span>发布失败</div>
                    <p className="pp-result-line">{result.error || '发生未知错误。'}</p>
                    <p className="pp-result-hint">请确认目标目录可写、路径正确,再重试。</p>
                  </div>
                )
              ) : (
                <p className="calendar-empty">正在发布…</p>
              )}
              <div className="pp-nav-row">
                <button onClick={() => setStep('preview')} className="btn btn-ghost">重新预览</button>
                {result?.success && (
                  <button onClick={handlePublish} disabled={busy} className="btn btn-primary">再次发布</button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ===== 高级项:自建站点 + 生成器 ===== */
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
              <button onClick={handleAdvancedPublish} disabled={busy || !check?.checked} className="btn btn-primary">
                {busy ? '发布中…' : '确认发布'}
              </button>
              {!check?.checked && <span className="publish-tip">请先「检查可用性」再发布。</span>}
            </div>
          </div>
        </>
      )}

      {/* 高级项结果卡(统一反馈) */}
      {advanced && result && (
        result.success ? (
          <div className="pp-result-card ok" style={{ margin: '12px 16px' }}>
            <div className="pp-result-title"><span className="pp-result-icon ok"><CheckIcon /></span>发布成功</div>
            <p className="pp-result-path">输出目录:<code>{result.output_path}</code></p>
            <p className="pp-result-hint">Mock 演练结果;真实写盘交由 Tauri 壳执行。</p>
          </div>
        ) : (
          <div className="pp-result-card fail" style={{ margin: '12px 16px' }}>
            <div className="pp-result-title"><span className="pp-result-icon fail"><WarnIcon /></span>发布失败</div>
            <p className="pp-result-line">{result.error || '发生未知错误。'}</p>
          </div>
        )
      )}
    </div>
  );
}