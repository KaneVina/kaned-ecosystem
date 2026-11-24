import { useRef, useState } from 'react';
import { FileText, Maximize2, ShieldCheck } from 'lucide-react';
import { linkProviderLabel, type DocumentDetailDto, type LinkProviderId, type ProtectedEmbedDto } from '@kaned/shared';
import { ProviderIcon } from './LinkViewer';
import { cn } from '@/lib/cn';
import { Watermark } from './Watermark';
import { DocxView } from './DocxView';

/**
 * An internal document, shown through Kaned's own embed page (see the API's
 * embed.ts): no original address, no "open in new tab", no download. Links
 * run in a sandbox that cannot open pop-ups or leave the page.
 */
export function ProtectedViewer({ doc, embed }: { doc: DocumentDetailDto; embed: ProtectedEmbedDto }) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  /** Word files are drawn in the page; if that fails, the server's reading page takes over. */
  const [docxFailed, setDocxFailed] = useState(false);
  const asDocx = Boolean(embed.docx) && !docxFailed;
  const isFile = embed.provider === 'file';
  const provider = isFile ? null : (embed.provider as LinkProviderId);

  return (
    <section className="panel link-viewer is-protected" aria-label="Xem tài liệu">
      <header className="lv-bar">
        <span className={cn('lv-ic', provider && `is-${provider}`)}>
          {provider ? <ProviderIcon p={{ id: provider, label: linkProviderLabel(provider), host: '', embedUrl: null, ratio: 1 }} /> : <FileText className="ic ic-sm" />}
        </span>
        <div className="lv-where">
          <b>{embed.label}</b>
          <span className="clamp-1">{doc.title}</span>
        </div>
        <span className="spacer" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => box.current?.requestFullscreen?.()}>
          <Maximize2 className="ic ic-sm" />
          Toàn màn hình
        </button>
      </header>
      <div className={cn('lv-stage', embed.tall && 'is-tall')} ref={box}>
        <div
          className={cn('lv-frame', loaded && 'is-loaded')}
          style={isFile ? { height: 'min(86vh, 1100px)' } : { aspectRatio: String(embed.ratio) }}
        >
          <div className="lv-loading" aria-hidden>
            <span className="spin" />
            Đang mở {embed.label.toLowerCase()}…
          </div>
          {asDocx ? (
            <DocxView src={embed.docx!} onReady={() => setLoaded(true)} onFail={() => setDocxFailed(true)} />
          ) : (
            <iframe
              src={embed.src}
              title={doc.title}
              // The browser's PDF viewer refuses to run sandboxed; files get their own guards in the embed page.
              sandbox={isFile ? undefined : 'allow-scripts allow-same-origin allow-presentation'}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setLoaded(true)}
            />
          )}
          <Watermark />
        </div>
      </div>
      <p className="lv-note is-internal">
        <ShieldCheck className="ic ic-xs" />
        Tài liệu lưu hành nội bộ: chỉ xem trong Kaned{doc.access.canDownload ? '' : ', không tải về hay mở liên kết gốc'}
        {doc.access.canShare ? '' : ', không chia sẻ ra ngoài'}.
      </p>
    </section>
  );
}
