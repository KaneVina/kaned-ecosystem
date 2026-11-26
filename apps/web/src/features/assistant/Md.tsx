import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * A small, safe Markdown subset for Kai's answers: paragraphs, "-" and "1." lists,
 * **bold**, `code`, ``` code blocks ```, [links](/app/…) and bare https links.
 * `limit` shows only the first N words (the typing effect); the rest appears as it grows.
 */

type Inline = { t: 'text' | 'b' | 'code' | 'link'; v: string; href?: string };
type Line = { kind: 'p' | 'ul' | 'ol' | 'pre'; items: string[] };

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;

function inlines(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE_RE)) {
    if (m.index! > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    const x = m[0];
    if (x.startsWith('**')) out.push({ t: 'b', v: x.slice(2, -2) });
    else if (x.startsWith('`')) out.push({ t: 'code', v: x.slice(1, -1) });
    else if (x.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(x)!;
      out.push({ t: 'link', v: mm[1]!, href: mm[2]! });
    } else out.push({ t: 'link', v: x, href: x });
    last = m.index! + x.length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

function blocks(md: string): Line[] {
  const out: Line[] = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (/^```/.test(l.trim())) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) body.push(lines[i++]!);
      i++;
      out.push({ kind: 'pre', items: [body.join('\n')] });
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*•]\s+/, ''));
      out.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+[.)]\s+/, ''));
      out.push({ kind: 'ol', items });
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!) && !/^```/.test(lines[i]!.trim())) para.push(lines[i++]!.replace(/^#{1,4}\s+/, ''));
    out.push({ kind: 'p', items: [para.join('\n')] });
  }
  return out;
}

export const wordCount = (md: string) => md.split(/\s+/).filter(Boolean).length;

export function Md({ text, limit, onLink }: { text: string; limit?: number; onLink?: () => void }) {
  let budget = limit ?? Infinity;
  const cut = (s: string) => {
    if (budget === Infinity) return s;
    if (budget <= 0) return '';
    const words = s.split(/(\s+)/);
    let out = '';
    for (const w of words) {
      if (!w.trim()) {
        out += w;
        continue;
      }
      if (budget <= 0) break;
      out += w;
      budget--;
    }
    return out;
  };
  const renderInline = (s: string, key: string): ReactNode[] =>
    inlines(s).map((p, i) => {
      const v = cut(p.v);
      if (!v) return null;
      const k = `${key}-${i}`;
      if (p.t === 'b') return <strong key={k}>{v}</strong>;
      if (p.t === 'code') return <code key={k}>{v}</code>;
      if (p.t === 'link') {
        if (p.href!.startsWith('/')) return <Link key={k} to={p.href!} onClick={onLink}>{v}</Link>;
        return <a key={k} href={p.href} target="_blank" rel="noopener noreferrer">{v}</a>;
      }
      return <Fragment key={k}>{v.split('\n').map((x, j) => (j ? [<br key={j} />, x] : x))}</Fragment>;
    });

  return (
    <div className="kai-md">
      {blocks(text).map((b, i) => {
        if (budget <= 0) return null;
        if (b.kind === 'pre') {
          const v = cut(b.items[0]!);
          return v ? <pre key={i}><code>{v}</code></pre> : null;
        }
        if (b.kind === 'p') return <p key={i}>{renderInline(b.items[0]!, `p${i}`)}</p>;
        const Tag = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <Tag key={i}>
            {b.items.map((it, j) => {
              if (budget <= 0) return null;
              return <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>;
            })}
          </Tag>
        );
      })}
    </div>
  );
}
