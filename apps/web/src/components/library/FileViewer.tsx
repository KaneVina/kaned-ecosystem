import { useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import type { DocumentDetailDto } from '@kaned/shared';
import { cn } from '@/lib/cn';

const OFFICE = new Set(['DOCX', 'DOC', 'PPTX', 'PPT', 'XLSX', 'XLS']);

/** Where the real file can be shown inline, or null when it cannot (local dev uploads, unknown formats). */
export function fileEmbedUrl(doc: Pick<DocumentDetailDto, 'fileUrl' | 'format'>): string | null {
  const url = doc.fileUrl;
  if (!/^https:\/\//.test(url) || /\/\/(localhost|127\.0\.0\.1)/.test(url)) return null;
  if (doc.format === 'PDF') return `${url}#view=FitH`;
  // Microsoft's free viewer renders Word, PowerPoint and Excel files from a public URL.
  if (OFFICE.has(doc.format)) return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  return null;
}

/** The uploaded file itself, inside the page. */
export function FileViewer({ doc, embedUrl, onDownload }: { doc: DocumentDetailDto; embedUrl: string; onDownload: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <section className="panel link-viewer" aria-label="Xem tài liệu">
      <header className="lv-bar">
        <span className="lv-ic">
          <FileText className="ic ic-sm" />
        </span>
        <div className="lv-where">
          <b>{doc.format}</b>
          <span className="clamp-1">{doc.title}</span>
        </div>
        <span className="spacer" />
        <a className="btn btn-ghost btn-sm" href={embedUrl.replace('/embed.aspx', '/view.aspx')} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="ic ic-sm" />
          Toàn màn hình
        </a>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDownload}>
          <Download className="ic ic-sm" />
          Tải về
        </button>
      </header>
      <div className={cn('lv-frame', loaded && 'is-loaded')} style={{ height: 'min(86vh, 1100px)' }}>
        <div className="lv-loading" aria-hidden>
          <span className="spin" />
          Đang mở tài liệu…
        </div>
        <iframe src={embedUrl} title={doc.title} onLoad={() => setLoaded(true)} />
      </div>
    </section>
  );
}
