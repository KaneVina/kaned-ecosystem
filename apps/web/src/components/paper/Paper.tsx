import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Lock, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { detectLinkProvider, type FileFormat, type DocumentSummaryDto } from '@kaned/shared';
import { FileBadge } from '@/components/ui/FileBadge';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { renderPage, thumbKind, type PaperDoc } from './render';
import { subjectTone } from './profiles';

/**
 * What a link looks like on paper: a slide deck draws as slides, a sheet as a
 * spreadsheet, anything else as a document page.
 */
export function visualFormat(doc: Pick<DocumentSummaryDto, 'format' | 'type' | 'linkUrl'>): FileFormat {
  if (doc.format !== 'LINK') return doc.format;
  const provider = doc.linkUrl ? detectLinkProvider(doc.linkUrl).id : 'web';
  if (provider === 'google-sheets') return 'XLSX';
  if (['google-slides', 'canva', 'figma', 'youtube'].includes(provider) || doc.type === 'SLIDES') return 'PPTX';
  return 'PDF';
}

/** The fields the page renderer needs, taken from an API document. */
export function toPaperDoc(doc: DocumentSummaryDto): PaperDoc {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    format: visualFormat(doc),
    semester: doc.semester,
    schoolYear: doc.schoolYear,
    pages: doc.pages,
    createdAt: doc.createdAt,
    subject: { code: doc.subject.code, nameVi: doc.subject.nameVi },
    university: { code: doc.university.code, name: doc.university.name, nameVi: doc.university.nameVi },
    uploaderName: doc.uploader.name,
  };
}

/** One drawn page. The HTML is generated from our own templates with user strings escaped. */
export const DocPage = memo(function DocPage({ doc, index }: { doc: PaperDoc; index: number }) {
  const html = useMemo(() => renderPage(doc, index), [doc, index]);
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
});

/**
 * The card thumbnail: a subject tab, the first page, and a format badge.
 * A real Cloudinary preview replaces the drawn page when there is one.
 */
export function DocThumb({ doc }: { doc: DocumentSummaryDto }) {
  const tone = subjectTone(doc.subject.code);
  const paper = useMemo(() => toPaperDoc(doc), [doc]);
  return (
    <div
      className={cn('thumb', `thumb--${thumbKind(visualFormat(doc))}`)}
      style={{ ['--tc' as string]: tone.c, ['--tt' as string]: tone.t }}
    >
      <span className="thumb-tab">{doc.subject.code}</span>
      <div className="thumb-page">
        {doc.thumbnailUrl ? (
          <img src={doc.thumbnailUrl} alt="" loading="lazy" className="thumb-img" />
        ) : (
          <DocPage doc={paper} index={0} />
        )}
      </div>
      <span className="thumb-ft">
        <FileBadge format={doc.format} bytes={doc.fileBytes} linkUrl={doc.linkUrl} />
      </span>
    </div>
  );
}

/** How many pages the preview shows before asking for a download. */
export function previewCount(doc: Pick<PaperDoc, 'pages' | 'format'>) {
  const total = doc.pages ?? 3;
  return Math.max(1, Math.min(total, doc.format === 'PPTX' ? 5 : 4));
}

/**
 * The document viewer: page counter, prev/next, zoom, optional thumbnail rail,
 * and a locked page at the end of the preview that offers the download.
 */
export function Viewer({
  doc,
  thumbs = true,
  onExpand,
  onDownload,
  downloading,
}: {
  doc: DocumentSummaryDto;
  thumbs?: boolean;
  onExpand?: () => void;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const paper = useMemo(() => toPaperDoc(doc), [doc]);
  const total = doc.pages ?? 3;
  const shown = previewCount(paper);
  const slides = visualFormat(doc) === 'PPTX';
  const [current, setCurrent] = useState(0);
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);

  // Track the page in view as the reader scrolls.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const pages = root.querySelectorAll<HTMLElement>('.viewer-pages > .pg');
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setCurrent(Number((best.target as HTMLElement).dataset.pg ?? 1) - 1);
      },
      { root, threshold: [0.35, 0.6, 0.9] },
    );
    pages.forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [doc.id, zoom]);

  const goTo = (i: number) => {
    const target = scroller.current?.querySelectorAll<HTMLElement>('.viewer-pages > .pg')[i];
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={cn('viewer', !thumbs && 'viewer-compact', slides && 'is-slides')}>
      <div className="viewer-bar">
        <span className="vb-pages">
          {slides ? 'Slide' : 'Trang'} <b className="vb-cur">{current + 1}</b> / {total}
        </span>
        <div className="vb-nav">
          <button type="button" className="icon-btn" aria-label="Trang trước" onClick={() => goTo(Math.max(0, current - 1))}>
            <ChevronUp className="ic ic-sm" />
          </button>
          <button type="button" className="icon-btn" aria-label="Trang sau" onClick={() => goTo(Math.min(shown - 1, current + 1))}>
            <ChevronDown className="ic ic-sm" />
          </button>
        </div>
        <span className="spacer" />
        <div className="vb-zoom">
          <button type="button" className="icon-btn" aria-label="Thu nhỏ" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}>
            <ZoomOut className="ic ic-sm" />
          </button>
          <span className="vb-zv" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className="icon-btn" aria-label="Phóng to" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}>
            <ZoomIn className="ic ic-sm" />
          </button>
        </div>
        {thumbs && onExpand && (
          <button type="button" className="icon-btn" aria-label="Xem toàn màn hình" data-tip="Toàn màn hình" onClick={onExpand}>
            <Maximize2 className="ic ic-sm" />
          </button>
        )}
      </div>

      <div className="viewer-body">
        {thumbs && (
          <div className="viewer-thumbs" role="tablist" aria-label="Các trang">
            {Array.from({ length: shown }, (_, i) => (
              <button key={i} type="button" className={cn('vt', i === current && 'on')} onClick={() => goTo(i)} aria-label={`Tới trang ${i + 1}`}>
                <span className="vt-page">
                  <DocPage doc={paper} index={i} />
                </span>
                <span className="vt-n">{i + 1}</span>
              </button>
            ))}
            {total > shown && (
              <div className="vt vt-lock">
                <Lock className="ic ic-sm" />
                <span>+{total - shown}</span>
              </div>
            )}
          </div>
        )}

        <div className="viewer-scroll" tabIndex={0} aria-label="Xem trước tài liệu" ref={scroller}>
          <div className="viewer-pages" style={{ ['--z' as string]: zoom }}>
            {Array.from({ length: shown }, (_, i) => (
              <DocPage key={i} doc={paper} index={i} />
            ))}
            {total > shown && (
              <div className="vp-lock">
                <DocPage doc={paper} index={shown} />
                <div className="vp-lock-over">
                  <span className="vp-lock-ic">
                    <Lock className="ic" />
                  </span>
                  <b>Hết phần xem trước</b>
                  <p>
                    Tải file {doc.format} để đọc đủ {total} {slides ? 'slide' : 'trang'}.
                  </p>
                  {onDownload && (
                    <button type="button" className={cn('btn btn-primary', downloading && 'is-loading')} onClick={onDownload}>
                      <Download className="ic ic-sm" />
                      Tải xuống {fmtBytes(doc.fileBytes)}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
