import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Copy, Download, GraduationCap, Info, Layers, Lightbulb, Mail, Sparkles, Square, Star, Timer } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, type DocumentType, type FileFormat } from '@kaned/shared';
import { FileIcon } from '@/components/ui/FileBadge';
import { subjectTone } from '@/components/paper/profiles';
import { cn } from '@/lib/cn';
import type { Block } from './brain';
import { Md, wordCount } from './Md';

const fmtN = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k` : String(n));

/** One reply, block by block. `fresh` replies type their text out and stagger their cards in. */
export function Blocks({ blocks, fresh, onGo, onStop, onCopyCode }: { blocks: Block[]; fresh: boolean; onGo: () => void; onStop?: () => void; onCopyCode?: (t: string) => void }) {
  const textWords = blocks.reduce((n, b) => n + (b.k === 'text' ? wordCount(b.md) : 0), 0);
  const [shown, setShown] = useState(fresh ? 0 : Infinity);
  useEffect(() => {
    if (!fresh || shown === Infinity) return;
    if (shown >= textWords) {
      setShown(Infinity);
      return;
    }
    // Fast enough to never make anyone wait: the whole text lands within about a second.
    const step = Math.max(1, Math.ceil(textWords / 45));
    const t = setTimeout(() => setShown((s) => s + step), 16);
    return () => clearTimeout(t);
  }, [fresh, shown, textWords]);

  let budget = shown;
  const typing = shown !== Infinity;
  let cardIndex = 0;
  return (
    <div className="kai-blocks">
      {blocks.map((b, i) => {
        if (b.k === 'text') {
          const lim = budget;
          budget = Math.max(0, budget - wordCount(b.md));
          if (lim <= 0) return null;
          return <Md key={i} text={b.md} limit={lim === Infinity ? undefined : lim} onLink={onGo} />;
        }
        // Cards wait until the text above them has been typed.
        if (typing && budget <= 0 && blocks.slice(0, i).some((x) => x.k === 'text')) return null;
        const style = { '--d': `${cardIndex++ * 60}ms` } as React.CSSProperties;
        switch (b.k) {
          case 'understood':
            return (
              <div key={i} className="kai-understood kai-in" style={style} aria-label="Kai hiểu là">
                <Sparkles className="ic ic-xs" />
                {b.items.map((x) => <span key={x}>{x}</span>)}
              </div>
            );
          case 'steps':
            return (
              <ol key={i} className="kai-steps kai-in" style={style}>
                {b.items.map((s, j) => <li key={j}><span>{j + 1}</span><p>{s}</p></li>)}
              </ol>
            );
          case 'actions':
            return (
              <div key={i} className="kai-actions kai-in" style={style}>
                {b.items.map((a) => (
                  <Link key={a.to + a.label} to={a.to} className="kai-act" onClick={onGo}>
                    {a.label} <ArrowUpRight className="ic ic-xs" />
                  </Link>
                ))}
              </div>
            );
          case 'docs':
            return (
              <div key={i} className="kai-cards kai-in" style={style}>
                {b.items.map((d) => (
                  <Link key={d.id} to={`/app/library/${d.id}`} className="kai-doc" onClick={onGo}>
                    <FileIcon format={d.format as FileFormat} size="sm" />
                    <span className="kai-doc-main">
                      <b className="clamp-2">{d.title}</b>
                      <span className="kai-meta">
                        <i className="kai-code" style={{ '--c': subjectTone(d.subjectCode).c, '--t': subjectTone(d.subjectCode).t } as React.CSSProperties}>{d.subjectCode}</i>
                        <span>{DOCUMENT_TYPE_LABELS[d.type as DocumentType]?.vi ?? d.type}</span>
                        {d.downloads > 0 && <span><Download className="ic ic-xs" />{fmtN(d.downloads)}</span>}
                        {d.ratingCount > 0 && <span><Star className="ic ic-xs" />{d.ratingAvg.toFixed(1)}</span>}
                        {d.year && <span>{d.year}</span>}
                      </span>
                    </span>
                  </Link>
                ))}
                {b.more && (
                  <Link to={b.more.to} className="kai-more" onClick={onGo}>
                    {b.more.label} <ArrowUpRight className="ic ic-xs" />
                  </Link>
                )}
              </div>
            );
          case 'decks':
            return (
              <div key={i} className="kai-cards kai-in" style={style}>
                {b.items.map((d) => (
                  <div key={d.id} className="kai-deck">
                    <span className="kai-deck-ic"><Layers className="ic" /></span>
                    <span className="kai-doc-main">
                      <Link to={`/app/flashcards/${d.id}`} onClick={onGo} className="stretched"><b className="clamp-2">{d.title}</b></Link>
                      <span className="kai-meta">
                        <i className="kai-code" style={{ '--c': subjectTone(d.subjectCode).c, '--t': subjectTone(d.subjectCode).t } as React.CSSProperties}>{d.subjectCode}</i>
                        <span>{d.questionCount} câu</span>
                        {d.tipCount > 0 && <span><Lightbulb className="ic ic-xs" />{d.tipCount} mẹo</span>}
                      </span>
                    </span>
                    <span className="kai-deck-go">
                      <Link to={`/app/flashcards/${d.id}/practice`} onClick={onGo}>Luyện</Link>
                      <Link to={`/app/flashcards/${d.id}/exam`} onClick={onGo}><Timer className="ic ic-xs" />Thi thử</Link>
                    </span>
                  </div>
                ))}
              </div>
            );
          case 'subjects':
            return (
              <div key={i} className="kai-cards kai-in" style={style}>
                {b.items.map((s) => (
                  <Link key={s.id} to={`/app/subjects/${s.code}`} className="kai-subj" onClick={onGo}>
                    <i className="kai-code is-lg" style={{ '--c': subjectTone(s.code).c, '--t': subjectTone(s.code).t } as React.CSSProperties}>{s.code}</i>
                    <span className="kai-doc-main">
                      <b className="clamp-1">{s.nameVi || s.name}</b>
                      <span className="kai-meta">
                        {s.credits != null && <span><GraduationCap className="ic ic-xs" />{s.credits} tín chỉ</span>}
                        <span><BookOpen className="ic ic-xs" />{s.docCount} tài liệu</span>
                        {s.deckId && <span><Layers className="ic ic-xs" />có flashcard</span>}
                      </span>
                    </span>
                    <ArrowUpRight className="ic ic-sm kai-go" />
                  </Link>
                ))}
              </div>
            );
          case 'lecturers':
            return (
              <div key={i} className="kai-cards kai-in" style={style}>
                {b.items.map((l) => (
                  <div key={l.id} className="kai-lect">
                    <span className="kai-avatar">{l.fullName.split(' ').slice(-1)[0]!.slice(0, 2).toUpperCase()}</span>
                    <span className="kai-doc-main">
                      <Link to={`/app/lecturers/${l.id}`} onClick={onGo} className="stretched"><b className="clamp-1">{l.fullName}</b></Link>
                      <span className="kai-meta">
                        {l.code && <span>{l.code}</span>}
                        {l.department && <span className="clamp-1">{l.department}</span>}
                      </span>
                    </span>
                    {l.email && <a className="kai-mail" href={`mailto:${l.email}`} title={l.email} aria-label={`Gửi email ${l.email}`}><Mail className="ic ic-sm" /></a>}
                  </div>
                ))}
              </div>
            );
          case 'grade':
            return (
              <div key={i} className={cn('kai-grade kai-in', b.pass ? (b.weak ? 'is-weak' : 'is-pass') : 'is-fail')} style={style}>
                <span className="kai-grade-letter">{b.letter}</span>
                <span className="kai-grade-main">
                  <b>{b.score10.toLocaleString('vi-VN')} điểm → {b.letter} · {b.gpa4.toLocaleString('vi-VN', { minimumFractionDigits: 1 })} hệ 4</b>
                  <small>{b.label}. {b.pass ? (b.weak ? 'Qua môn, nhưng dưới 5,0 nhiều khoa sẽ yêu cầu học cải thiện trước môn sau.' : 'Qua môn.') : 'Chưa qua môn (cần từ 4,0).'}</small>
                </span>
              </div>
            );
          case 'note':
            return (
              <div key={i} className="kai-note kai-in" style={style}>
                <Info className="ic ic-sm" />
                <Md text={b.md} onLink={onGo} />
              </div>
            );
          case 'llm':
            return (
              <div key={i} className={cn('kai-llm', !b.done && 'is-live')}>
                <span className="kai-llm-tag"><Sparkles className="ic ic-xs" /> AI sâu · chạy trên máy bạn</span>
                {b.text ? <Md text={b.text} onLink={onGo} /> : !b.error && <p className="kai-llm-wait">Đang suy nghĩ…</p>}
                {!b.done && <i className="kai-caret" aria-hidden />}
                {b.error && <p className="kai-err">{b.error}</p>}
                {!b.done && onStop && (
                  <button type="button" className="kai-stop" onClick={onStop}><Square className="ic ic-xs" /> Dừng</button>
                )}
                {b.done && b.text && onCopyCode && /```/.test(b.text) && (
                  <button type="button" className="kai-stop" onClick={() => onCopyCode(b.text)}><Copy className="ic ic-xs" /> Chép câu trả lời</button>
                )}
              </div>
            );
          default:
            return null;
        }
      })}
      {typing && <i className="kai-caret" aria-hidden />}
    </div>
  );
}
