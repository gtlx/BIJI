/**
 * [M11 看板] 前端 frontmatter 工具 —— 与后端 parse_frontmatter 保持一致的最小实现
 *
 * 看板状态(待办/进行中/已完成)承载于笔记 content 顶部的 YAML frontmatter
 * 的 `status:` 字段。frontmatter 是元数据、不进块,所以改动状态不会触碰块级存储核心。
 * 前端的 Editor / 看板共用这份解析语义,保证「同一份 content 谁读都是一样的 status」。
 *
 * 克制版:只实现看板需要的「读 status + 写 status」,不做通用 YAML 序列化。
 */

/** 解析 content 头部的 YAML frontmatter,返回 frontmatter 对象与剩余正文 */
export function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; content: string } {
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, content: text };
  const fmText = fmMatch[1];
  const body = fmMatch[2];
  const frontmatter: Record<string, unknown> = {};
  for (const line of fmText.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value: unknown = line.slice(idx + 1).trim();
    if (value === 'true') frontmatter[key] = true;
    else if (value === 'false') frontmatter[key] = false;
    else if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      frontmatter[key] = items.filter(Boolean);
    } else frontmatter[key] = value as string;
  }
  return { frontmatter, content: body };
}

/** 读一篇笔记当前的看板状态(无则默认「待办」) */
export function getNoteKanbanStatus(content: string): string {
  const { frontmatter } = parseFrontmatter(content);
  const status = frontmatter.status as string | undefined;
  return (status && status.trim()) ? status : '待办';
}

/**
 * 把看板状态写入 content 的 frontmatter:
 * - 已有 `status:` 键 → 就地更新值;
 * - 有 frontmatter 但无 status → 在 `---` 结束符前插入;
 * - 无 frontmatter → 在正文前新建一个仅含 status 的 frontmatter 块。
 * 返回新的 content 字符串。状态为空字符串则移除该键。
 */
export function withKanbanStatus(content: string, status: string): string {
  const statusLine = status ? `status: ${status}` : '';
  const hasFm = /^---\n[\s\S]*?\n---/.test(content);

  if (!hasFm) {
    if (!status) return content;
    return `---\n${statusLine}\n---\n\n${content}`;
  }

  // 拆出 frontmatter 头块与正文
  const fmEnd = content.indexOf('\n---');
  const header = content.slice(0, fmEnd);
  const bodyOpen = /^\n?/.exec(content.slice(fmEnd))?.[0] ?? '';
  const body = content.slice(fmEnd);

  // 在 frontmatter 内找 status 行并就地替换 / 追加
  const lines = header.split('\n');
  let replaced = false;
  const next = lines.map(line => {
    const m = line.match(/^status\s*:/);
    if (!m) return line;
    replaced = true;
    return statusLine;
  });
  if (!replaced && status) {
    // 在 `---` 结束行前插入(status 通常在末尾)
    const i = next.lastIndexOf('---');
    if (i >= 0) next.splice(i, 0, statusLine);
    else next.push(statusLine);
  } else if (replaced && !status) {
    // 移除 status 行
    return next.filter(l => !(/^status\s*:/).test(l)).join('\n') + bodyOpen + body;
  }

  return next.join('\n') + bodyOpen + body;
}

/**
 * [M10③ 属性面板] 把多个 frontmatter 字段写入 content 顶部 YAML 块(通用序列化)。
 *
 * 语义与 withKanbanStatus 一致但更通用:
 *  - 已存在的键 → 就地更新值(保持原行序);
 *  - 新键 → 在 `---` 结束前追加;
 *  - 值为 undefined / 空串 / 空数组 → 移除该键;
 *  - 无 frontmatter → 在正文前新建一个 YAML 块;全部被移除且原本无块 → 返回原内容。
 * 数组序列化为内联 `[a, "b"]` 形式(与 parseFrontmatter 的解析互为逆运算)。
 */
export function writeFrontmatter(
  content: string,
  patch: Record<string, string | string[] | boolean | undefined>,
): string {
  // 序列化单个字段值;空值返回 null(表示移除)
  const ser = (key: string, v: unknown): string | null => {
    if (v === undefined || v === null || v === '') return null;
    if (Array.isArray(v)) {
      if (v.length === 0) return null;
      const items = v.map(i => `"${String(i).replace(/"/g, '\\"')}"`).join(', ');
      return `${key}: [${items}]`;
    }
    if (typeof v === 'boolean') return `${key}: ${v}`;
    return `${key}: ${String(v)}`;
  };

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fmLines = fmMatch ? fmMatch[1].split('\n') : [];
  const body = fmMatch ? fmMatch[2] : content;

  // 已在更新范围内的键(用于去重 / 判断是「更新」还是「新增」)
  const keyRe = /^([A-Za-z0-9_-]+)\s*:/;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of fmLines) {
    const m = line.match(keyRe);
    // 非「键:值」行(注释等)直接保留
    if (!m) { out.push(line); continue; }
    const key = m[1];
    // 本次不更新的键原样保留
    if (!(key in patch)) { out.push(line); continue; }
    seen.add(key);
    const val = ser(key, patch[key]);
    if (val !== null) out.push(val);
  }
  // 新增键(原本不存在)追加到块尾
  for (const [k, v] of Object.entries(patch)) {
    if (seen.has(k)) continue;
    const val = ser(k, v);
    if (val !== null) out.push(val);
  }

  // 原本无 frontmatter 且没有需要写入的字段 → 不改动
  if (!fmMatch && out.length === 0) return content;

  const head = ['---', ...out, '---'].join('\n');
  // 规范输出:frontmatter 块后空一行再接正文
  const sep = body === '' ? '' : '\n\n';
  return head + sep + body;
}