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