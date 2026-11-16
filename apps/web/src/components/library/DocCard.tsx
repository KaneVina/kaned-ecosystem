import { Link } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Building2, CalendarDays, Download, Eye } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, type DocumentSummaryDto } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { FileBadge } from '@/components/ui/FileBadge';
import { RatingInline } from '@/components/ui/Stars';
import { DocThumb } from '@/components/paper/Paper';
import { subjectTone } from '@/components/paper/profiles';
import { fmtCompact, fmtInt, semesterVi, shortName, timeAgo, timeShort } from '@/lib/format';
import { cn } from '@/lib/cn';

interface CardProps {
  doc: DocumentSummaryDto;
  onToggleBookmark?: (id: string) => void;
  onPreview?: (doc: DocumentSummaryDto) => void;
  onDownload?: (doc: DocumentSummaryDto) => void;
  /** A short "why you're seeing this" line, e.g. on the dashboard. */
  reason?: string;
}

function BookmarkButton({ doc, onToggle }: { doc: DocumentSummaryDto; onToggle: (id: string) => void }) {
  const on = Boolean(doc.isBookmarked);
  return (
    <button
      type="button"
      className={cn('icon-btn bm-btn', on && 'is-on')}
      aria-pressed={on}
      aria-label={on ? 'Bỏ lưu tài liệu' : 'Lưu tài liệu'}
      data-tip={on ? 'Đã lưu' : 'Lưu'}
      onClick={() => onToggle(doc.id)}
    >
      {on ? <BookmarkCheck className="ic" /> : <Bookmark className="ic" />}
    </button>
  );
}

export function DocCard({ doc, onToggleBookmark, onPreview, reason }: CardProps) {
  const tone = subjectTone(doc.subject.code);
  return (
    <article className="doc-card">
      <div className="doc-media">
        <DocThumb doc={doc} />
        <div className="doc-tools">
          {onToggleBookmark && <BookmarkButton doc={doc} onToggle={onToggleBookmark} />}
          {onPreview && (
            <button type="button" className="icon-btn pv-btn" aria-label="Xem nhanh" data-tip="Xem nhanh" onClick={() => onPreview(doc)}>
              <Eye className="ic" />
            </button>
          )}
        </div>
      </div>
      <div className="doc-body">
        {reason && <span className="doc-reason">{reason}</span>}
        <div className="doc-kicker">
          <span className="kdot" style={{ ['--tc' as string]: tone.c }} />
          <span className="clamp-1">{doc.subject.nameVi}</span>
          <span className="spacer" />
          <RatingInline value={doc.ratingAvg} count={doc.ratingCount} />
        </div>
        <h3 className="doc-title clamp-2">
          <Link to={`/app/library/${doc.id}`} className="stretched">
            {doc.title}
          </Link>
        </h3>
        <p className="doc-meta">
          <span className="clamp-1">
            {doc.university.code} <i>/</i> {DOCUMENT_TYPE_LABELS[doc.type].vi}
          </span>
        </p>
        <p className="doc-meta2">
          Năm {doc.year}, {semesterVi(doc.semester)}
        </p>
        <div className="doc-foot">
          <Avatar name={doc.uploader.name} src={doc.uploader.avatarUrl} size="xs" />
          <span className="doc-up clamp-1">{shortName(doc.uploader.name)}</span>
          <span className="doc-date">{timeShort(doc.createdAt)}</span>
          <span className="spacer" />
          <span className="stat-inline" title={`${fmtInt(doc.downloads)} lượt tải`}>
            <Download className="ic" />
            {fmtCompact(doc.downloads)}
          </span>
          <span className="stat-inline" title={`${fmtInt(doc.views)} lượt xem`}>
            <Eye className="ic" />
            {fmtCompact(doc.views)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function DocRow({ doc, onToggleBookmark, onPreview, onDownload }: CardProps) {
  const tone = subjectTone(doc.subject.code);
  return (
    <article className="doc-row">
      <div className="row-thumb">
        <DocThumb doc={doc} />
      </div>
      <div className="row-main">
        <div className="doc-kicker">
          <span className="kdot" style={{ ['--tc' as string]: tone.c }} />
          {doc.subject.nameVi}
          <span className="row-sep" />
          {DOCUMENT_TYPE_LABELS[doc.type].vi}
        </div>
        <h3 className="row-title">
          <Link to={`/app/library/${doc.id}`} className="stretched">
            {doc.title}
          </Link>
        </h3>
        <div className="row-meta">
          <span>
            <Building2 className="ic ic-xs" />
            {doc.university.name}
          </span>
          <span>
            <CalendarDays className="ic ic-xs" />
            Năm {doc.year}, {semesterVi(doc.semester)}
          </span>
          <span>
            <FileBadge format={doc.format} bytes={doc.fileBytes} linkUrl={doc.linkUrl} />
          </span>
          <span className="row-user">
            <Avatar name={doc.uploader.name} src={doc.uploader.avatarUrl} size="xs" />
            {doc.uploader.name}
            <i>{timeAgo(doc.createdAt)}</i>
          </span>
        </div>
      </div>
      <div className="row-stats">
        <RatingInline value={doc.ratingAvg} count={doc.ratingCount} />
        <span className="t-xs">{doc.ratingCount} đánh giá</span>
        <span className="stat-inline">
          <Download className="ic" />
          {fmtCompact(doc.downloads)}
        </span>
        <span className="stat-inline">
          <Eye className="ic" />
          {fmtCompact(doc.views)}
        </span>
      </div>
      <div className="row-actions">
        {onPreview && (
          <button type="button" className="icon-btn" aria-label="Xem nhanh" data-tip="Xem nhanh" onClick={() => onPreview(doc)}>
            <Eye className="ic" />
          </button>
        )}
        {onToggleBookmark && <BookmarkButton doc={doc} onToggle={onToggleBookmark} />}
        {onDownload && (
          <button type="button" className="icon-btn" aria-label="Tải xuống" data-tip="Tải xuống" onClick={() => onDownload(doc)}>
            <Download className="ic" />
          </button>
        )}
      </div>
    </article>
  );
}

export function DocCardSkeleton() {
  return (
    <div className="doc-card is-skel" aria-hidden>
      <div className="skel skel-thumb" />
      <div className="doc-body">
        <div className="skel" style={{ height: 11, width: '55%' }} />
        <div className="skel" style={{ height: 15, width: '92%', marginTop: 12 }} />
        <div className="skel" style={{ height: 15, width: '70%', marginTop: 6 }} />
        <div className="skel" style={{ height: 11, width: '45%', marginTop: 14 }} />
        <div className="skel" style={{ height: 22, width: '100%', marginTop: 18 }} />
      </div>
    </div>
  );
}

export function DocRowSkeleton() {
  return (
    <div className="doc-row is-skel" aria-hidden>
      <div className="row-thumb skel" />
      <div className="row-main">
        <div className="skel" style={{ height: 12, width: '30%' }} />
        <div className="skel" style={{ height: 16, width: '80%', marginTop: 10 }} />
        <div className="skel" style={{ height: 12, width: '60%', marginTop: 12 }} />
      </div>
    </div>
  );
}
