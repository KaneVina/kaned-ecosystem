import { useMemo, useState } from 'react';
import { ExternalLink, Globe, Link2 } from 'lucide-react';
import { detectLinkProvider, type DocumentDetailDto } from '@kaned/shared';
import { DocPage, toPaperDoc } from '@/components/paper/Paper';
import { cn } from '@/lib/cn';

/**
 * A document that is a link. Hosts that allow it (Google Slides, Docs,
 * Drive, YouTube, Canva, Figma) are shown inline; anything else gets a card
 * that opens the page in a new tab.
 */
export function LinkViewer({ doc, onOpen }: { doc: DocumentDetailDto; onOpen: () => void }) {
  const provider = useMemo(() => detectLinkProvider(doc.fileUrl), [doc.fileUrl]);
  const paper = useMemo(() => toPaperDoc(doc), [doc]);
  const [loaded, setLoaded] = useState(false);

  return (
    <section className="panel link-viewer" aria-label="Xem tài liệu">
      <header className="lv-bar">
        <span className="lv-ic">
          <Globe className="ic ic-sm" />
        </span>
        <div className="lv-where">
          <b>{provider.label}</b>
          <span className="clamp-1">{provider.host}</span>
        </div>
        <span className="spacer" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpen}>
          <ExternalLink className="ic ic-sm" />
          Mở trong tab mới
        </button>
      </header>

      {provider.embedUrl ? (
        <div className={cn('lv-frame', loaded && 'is-loaded')} style={{ aspectRatio: String(provider.ratio) }}>
          <div className="lv-loading" aria-hidden>
            <span className="spin" />
            Đang mở {provider.label}…
          </div>
          <iframe
            src={provider.embedUrl}
            title={doc.title}
            loading="lazy"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <div className="lv-card">
          <div className="lv-paper" aria-hidden>
            <DocPage doc={paper} index={0} />
          </div>
          <div className="lv-copy">
            <span className="lv-chip">
              <Link2 className="ic ic-xs" />
              Tài liệu dạng liên kết
            </span>
            <h3 className="t-h3">Tài liệu này nằm trên {provider.label === 'Trang web' ? provider.host : provider.label}</h3>
            <p>
              {provider.label} không cho phép hiển thị bên trong trang khác, nên Kaned mở nó ở tab mới. Nếu trang yêu cầu đăng nhập, hãy dùng
              tài khoản trường của bạn.
            </p>
            <button type="button" className="btn btn-primary" onClick={onOpen}>
              <ExternalLink className="ic ic-sm" />
              Mở {provider.label === 'Trang web' ? 'liên kết' : provider.label}
            </button>
          </div>
        </div>
      )}
      <p className="lv-note">
        Không xem được? Chủ tài liệu cần bật chia sẻ “Bất kỳ ai có đường liên kết”.{' '}
        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="link-inline" onClick={(e) => (e.preventDefault(), onOpen())}>
          Mở trực tiếp
        </a>
      </p>
    </section>
  );
}
