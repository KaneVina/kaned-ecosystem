import { Link } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Download, Eye } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, type DocumentSummaryDto } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { FileBadge, FileIcon } from '@/components/ui/FileBadge';
import { RatingInline } from '@/components/ui/Stars';
import { fmtCompact, formatColor, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Props {
  document: DocumentSummaryDto;
  onToggleBookmark?: (id: string) => void;
  className?: string;
}

/**
 * The card is the unit the whole library is built from. It must read at a
 * glance: what the file is, which course it belongs to, who shared it.
 */
export function DocumentCard({ document, onToggleBookmark, className }: Props) {
  const color = formatColor(document.format);
  const saved = document.isBookmarked;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md border border-line bg-paper shadow-xs',
        'transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-line-2 hover:shadow-md',
        className,
      )}
    >
      <div className="relative aspect-16/11 overflow-hidden" style={{ background: `${color}0f` }}>
        {document.thumbnailUrl ? (
          <img
            src={document.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <FileIcon format={document.format} className="h-16 w-[54px] drop-shadow-sm transition-transform duration-500 group-hover:-translate-y-1" />
          </div>
        )}

        <span
          className="absolute top-0 left-4 rounded-b-[5px] px-2 py-1 text-[10.5px] font-bold text-white shadow-sm"
          style={{ background: color }}
        >
          {document.subject.code}
        </span>

        <span className="absolute bottom-2.5 left-2.5">
          <FileBadge format={document.format} bytes={document.fileBytes} className="bg-paper/95 shadow-xs" />
        </span>

        {onToggleBookmark && (
          <button
            type="button"
            onClick={() => onToggleBookmark(document.id)}
            aria-pressed={saved}
            aria-label={saved ? 'Bỏ lưu tài liệu' : 'Lưu tài liệu'}
            className={cn(
              'absolute top-2.5 right-2.5 z-10 grid size-8 place-items-center rounded-lg backdrop-blur transition-colors',
              saved ? 'bg-brand text-white' : 'bg-paper/95 text-ink-2 hover:text-brand',
            )}
          >
            {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
          <span className="size-[7px] shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden />
          <span className="truncate">{document.subject.name}</span>
          <span className="ml-auto shrink-0">
            <RatingInline value={document.ratingAvg} count={document.ratingCount} />
          </span>
        </div>

        <h3 className="mt-2 line-clamp-2 text-[15px] leading-snug font-semibold">
          <Link
            to={`/app/library/${document.id}`}
            className="after:absolute after:inset-0 group-hover:text-brand-700 focus-visible:outline-none"
          >
            {document.title}
          </Link>
        </h3>

        <p className="mt-2 truncate text-[13px] text-ink-2">
          {document.university.code} <span className="text-ink-4">/</span> {DOCUMENT_TYPE_LABELS[document.type].vi}
        </p>
        <p className="mb-3.5 text-[13px] text-ink-3">
          Năm {document.year} · {document.semester === 'SUMMER' ? 'Học kỳ hè' : `Học kỳ ${document.semester === 'S1' ? 1 : 2}`}
        </p>

        <div className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-[12.5px] text-ink-2">
          <Avatar name={document.uploader.name} src={document.uploader.avatarUrl} size="xs" />
          <span className="min-w-0 flex-1 truncate font-medium">{document.uploader.name}</span>
          <span className="tabular flex shrink-0 items-center gap-1 text-ink-3" title={`${document.downloads} lượt tải`}>
            <Download className="size-3.5" aria-hidden />
            {fmtCompact(document.downloads)}
          </span>
          <span className="tabular flex shrink-0 items-center gap-1 text-ink-3" title={`${document.views} lượt xem`}>
            <Eye className="size-3.5" aria-hidden />
            {fmtCompact(document.views)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function DocumentRow({ document, onToggleBookmark }: Props) {
  const color = formatColor(document.format);
  const saved = document.isBookmarked;

  return (
    <article className="group relative flex items-center gap-4 rounded-md border border-line bg-paper p-3 shadow-xs transition-[box-shadow,border-color] hover:border-line-2 hover:shadow-sm">
      <div
        className="grid size-16 shrink-0 place-items-center rounded-lg sm:size-20"
        style={{ background: `${color}14` }}
      >
        <FileIcon format={document.format} className="h-11 w-9" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <span className="font-semibold" style={{ color }}>
            {document.subject.code}
          </span>
          <span className="size-1 rounded-full bg-ink-4" aria-hidden />
          <span className="truncate">{DOCUMENT_TYPE_LABELS[document.type].vi}</span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-[15px] leading-snug font-semibold">
          <Link to={`/app/library/${document.id}`} className="after:absolute after:inset-0 group-hover:text-brand-700">
            {document.title}
          </Link>
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
          <span className="truncate">{document.university.name}</span>
          <span className="flex items-center gap-1.5">
            <Avatar name={document.uploader.name} src={document.uploader.avatarUrl} size="xs" />
            {document.uploader.name}
          </span>
          <span>{timeAgo(document.createdAt)}</span>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-5 text-[12.5px] text-ink-3 sm:flex">
        <RatingInline value={document.ratingAvg} count={document.ratingCount} />
        <span className="tabular flex items-center gap-1">
          <Download className="size-3.5" aria-hidden />
          {fmtCompact(document.downloads)}
        </span>
      </div>

      {onToggleBookmark && (
        <button
          type="button"
          onClick={() => onToggleBookmark(document.id)}
          aria-pressed={saved}
          aria-label={saved ? 'Bỏ lưu tài liệu' : 'Lưu tài liệu'}
          className={cn(
            'relative z-10 grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
            saved ? 'bg-brand-50 text-brand' : 'text-ink-3 hover:bg-sunk hover:text-ink',
          )}
        >
          {saved ? <BookmarkCheck className="size-[18px]" /> : <Bookmark className="size-[18px]" />}
        </button>
      )}
    </article>
  );
}

export function DocumentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-paper">
      <div className="skeleton aspect-16/11 rounded-none" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-3 w-2/5" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton mt-4 h-3 w-1/2" />
      </div>
    </div>
  );
}
