export function timeAgo(unixSec: number, lang: 'zh' | 'en' = 'zh'): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - unixSec));
  if (s < 60) return lang === 'zh' ? `${s} 秒前` : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return lang === 'zh' ? `${m} 分钟前` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'zh' ? `${h} 小时前` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return lang === 'zh' ? `${d} 天前` : `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return lang === 'zh' ? `${mo} 个月前` : `${mo}mo ago`;
  return lang === 'zh' ? `${Math.floor(mo / 12)} 年前` : `${Math.floor(mo / 12)}y ago`;
}

export function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Render a small, safe subset of Markdown (digest output) to HTML. */
export function miniMarkdown(md: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  const inline = (t: string) =>
    esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,4}\s/.test(line)) {
      if (inList) (out.push('</ul>'), (inList = false));
      const level = line.match(/^#+/)![0].length;
      out.push(`<h${level + 1}>${inline(line.replace(/^#+\s*/, ''))}</h${level + 1}>`);
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) (out.push('<ul>'), (inList = true));
      out.push(`<li>${inline(line.replace(/^[-*]\s*/, ''))}</li>`);
    } else if (line === '') {
      if (inList) (out.push('</ul>'), (inList = false));
    } else {
      if (inList) (out.push('</ul>'), (inList = false));
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
