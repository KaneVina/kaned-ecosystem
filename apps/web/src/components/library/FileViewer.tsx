import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { Download, ExternalLink, FileText } from 'lucide-react';
import type { DocumentDetailDto } from '@kaned/shared';
import { cn } from '@/lib/cn';

const OFFICE = new Set(['DOCX', 'DOC', 'PPTX', 'PPT', 'XLSX', 'XLS']);

/** Where the real file can be shown inline, or null when it cannot (local dev uploads, unknown formats). */
export function fileEmbedUrl(doc: Pick<DocumentDetailDto, 'fileUrl' | 'format'>): string | null {
  const url = doc.fileUrl;
  if (!/^https:\/\//.test(url) || /\/\/(localhost|127\.0\.0\.1)/.test(url)) return null;
  if (doc.format === 'PDF') return `${url}#view=FitH`;
  if (doc.format === 'HTML' || doc.format === 'MD' || doc.format === 'DRAWIO') return url;
  // Microsoft's free viewer renders Word, PowerPoint and Excel files from a public URL.
  if (OFFICE.has(doc.format)) return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  return null;
}

/**
 * draw.io's own viewer draws a diagram handed to it in the address hash
 * (raw-deflated, base64, URL-encoded), read-only, with zoom and layers.
 */
async function drawioViewerUrl(xml: string): Promise<string> {
  const bytes = new TextEncoder().encode(encodeURIComponent(xml));
  const packed = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  let bin = '';
  new Uint8Array(packed).forEach((b) => (bin += String.fromCharCode(b)));
  return `https://viewer.diagrams.net/?lightbox=1&nav=1&layers=1&border=10&toolbar=zoom%20layers#R${encodeURIComponent(btoa(bin))}`;
}

function useDrawio(doc: DocumentDetailDto) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (doc.format !== 'DRAWIO') return;
    let alive = true;
    fetch(doc.fileUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(drawioViewerUrl)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [doc.fileUrl, doc.format]);
  return { url, failed };
}

/** The uploaded file itself, inside the page. */
const PAGE_CSS = `body{font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a202b;max-width:820px;margin:0 auto;padding:28px 22px}img{max-width:100%}pre{background:#f3f5f8;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,Consolas,monospace;font-size:.92em}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}h1,h2,h3{line-height:1.25}a{color:#2448d8}`;

/**
 * HTML and Markdown are fetched and shown in a sandboxed frame: scripts in an
 * uploaded page never run, and it cannot touch Kaned.
 */
function useTextDocument(doc: DocumentDetailDto) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (doc.format !== 'HTML' && doc.format !== 'MD') return;
    let alive = true;
    fetch(doc.fileUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(async (text) => {
        const body = doc.format === 'MD' ? await marked.parse(text) : text;
        const page = doc.format === 'MD' ? `<!doctype html><meta charset="utf-8"><base target="_blank"><style>${PAGE_CSS}</style>${body}` : body;
        if (alive) setHtml(page);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [doc.fileUrl, doc.format]);
  return { html, failed };
}

export function FileViewer({ doc, embedUrl, onDownload }: { doc: DocumentDetailDto; embedUrl: string; onDownload: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const isText = doc.format === 'HTML' || doc.format === 'MD';
  const text = useTextDocument(doc);
  const drawio = useDrawio(doc);
  const isDrawio = doc.format === 'DRAWIO';
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
        <a className="btn btn-ghost btn-sm" href={isDrawio ? (drawio.url ?? undefined) : embedUrl.replace('/embed.aspx', '/view.aspx')} target="_blank" rel="noopener noreferrer">
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
        {isDrawio ? (
          drawio.failed ? (
            <div className="lv-loading" style={{ opacity: 1 }}>
              Không mở được sơ đồ. Bấm Tải về để mở bằng draw.io.
            </div>
          ) : (
            drawio.url && (
              <iframe src={drawio.url} sandbox="allow-scripts allow-same-origin allow-popups" title={doc.title} onLoad={() => setLoaded(true)} />
            )
          )
        ) : isText ? (
          text.failed ? (
            <div className="lv-loading" style={{ opacity: 1 }}>
              Không mở được tệp. Bấm Tải về để xem.
            </div>
          ) : (
            text.html !== null && <iframe srcDoc={text.html} sandbox="allow-popups" title={doc.title} onLoad={() => setLoaded(true)} />
          )
        ) : (
          <iframe src={embedUrl} title={doc.title} onLoad={() => setLoaded(true)} />
        )}
      </div>
    </section>
  );
}
