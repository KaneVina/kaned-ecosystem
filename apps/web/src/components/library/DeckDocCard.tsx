import { Link } from 'react-router-dom';
import { CircleCheckBig, Layers, Lightbulb, Timer } from 'lucide-react';
import type { DeckSummaryDto } from '@kaned/shared';
import { subjectTone } from '@/components/paper/profiles';
import { fmtInt, timeShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { srsOn, summaryCounts } from '@/features/decks/model';

const pct = (d: DeckSummaryDto) => (d.progress && d.questionCount ? Math.round((summaryCounts(d.progress, srsOn()).ok / d.questionCount) * 100) : 0);

/** The cover: a small fanned stack of cards with the subject code and question count. */
function DeckThumb({ d }: { d: DeckSummaryDto }) {
  return (
    <div className="dd-thumb" style={{ ['--uni' as string]: d.subject.university.color }}>
      <span className="dd-sheet dd-s3" />
      <span className="dd-sheet dd-s2" />
      <span className="dd-sheet dd-s1">
        <span className="dd-code">{d.subject.code}</span>
        <b>{fmtInt(d.questionCount)}</b>
        <small>câu hỏi</small>
        <span className="dd-opts">
          <i />
          <i className="is-ok" />
          <i />
        </span>
      </span>
    </div>
  );
}

/** A flashcard deck shown among library documents, in the same card shape. */
export function DeckDocCard({ d }: { d: DeckSummaryDto }) {
  const tone = subjectTone(d.subject.code);
  const p = pct(d);
  const started = Boolean(d.progress?.seen);
  return (
    <article className="doc-card dd-card">
      <div className="doc-media">
        <DeckThumb d={d} />
        <span className="dd-badge">
          <Layers className="ic ic-xs" />
          Thẻ ghi nhớ
        </span>
      </div>
      <div className="doc-body">
        <div className="doc-kicker">
          <span className="kdot" style={{ ['--tc' as string]: tone.c }} />
          <span className="clamp-1">{d.subject.nameVi}</span>
        </div>
        <h3 className="doc-title clamp-2">
          <Link to={`/app/flashcards/${d.id}`} className="stretched">
            {d.title}
          </Link>
        </h3>
        <p className="doc-meta">
          <span className="clamp-1">
            {d.subject.university.code} <i>/</i> Thẻ ghi nhớ
          </span>
        </p>
        <p className="doc-meta2">
          {fmtInt(d.questionCount)} câu{d.chapterCount ? ` · ${fmtInt(d.chapterCount)} chương` : ''}
          {d.tipCount ? ` · ${fmtInt(d.tipCount)} mẹo` : ''}
        </p>
        <div className="doc-foot dd-foot">
          {started ? (
            <>
              <span className="dd-bar" aria-hidden>
                <i style={{ width: `${p}%` }} />
              </span>
              <span className="dd-pct">{p}% đã thuộc</span>
            </>
          ) : (
            <span className="dd-modes">
              <CircleCheckBig className="ic" />
              <Layers className="ic" />
              <Timer className="ic" />
              Luyện tập, lật thẻ, thi thử
            </span>
          )}
          <span className="spacer" />
          <span className="doc-date">{timeShort(d.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}

export function DeckDocRow({ d }: { d: DeckSummaryDto }) {
  const tone = subjectTone(d.subject.code);
  const p = pct(d);
  const started = Boolean(d.progress?.seen);
  return (
    <article className="doc-row dd-row">
      <div className="row-thumb">
        <DeckThumb d={d} />
      </div>
      <div className="row-main">
        <div className="doc-kicker">
          <span className="kdot" style={{ ['--tc' as string]: tone.c }} />
          <span className="clamp-1">{d.subject.nameVi}</span>
          <span className="row-sep" />
          <span className="row-type dd-type">
            <Layers className="ic ic-xs" />
            Thẻ ghi nhớ
          </span>
        </div>
        <h3 className="row-title">
          <Link to={`/app/flashcards/${d.id}`} className="stretched">
            {d.title}
          </Link>
        </h3>
        <div className="row-meta">
          <span>
            <Layers className="ic ic-xs" />
            {fmtInt(d.questionCount)} câu{d.chapterCount ? ` · ${fmtInt(d.chapterCount)} chương` : ''}
          </span>
          {d.tipCount > 0 && (
            <span>
              <Lightbulb className="ic ic-xs" />
              {fmtInt(d.tipCount)} mẹo nhớ
            </span>
          )}
          <span>{d.subject.university.code}</span>
        </div>
      </div>
      <div className="row-stats">
        <span className={cn('dd-pct', !started && 'is-new')}>{started ? `${p}% đã thuộc` : 'Chưa học'}</span>
        <span className="t-xs">Cập nhật {timeShort(d.updatedAt)}</span>
      </div>
      <div className="row-actions">
        <Link className="btn btn-soft btn-sm dd-go" to={`/app/flashcards/${d.id}`}>
          {started ? 'Học tiếp' : 'Ôn ngay'}
        </Link>
      </div>
    </article>
  );
}
