import { useMemo, useState } from 'react';
import { ExternalLink, Globe, Link2, Palette, PlaySquare } from 'lucide-react';
import { detectLinkProvider, type DocumentDetailDto, type DocumentSummaryDto, type LinkProvider } from '@kaned/shared';
import { DocPage, toPaperDoc } from '@/components/paper/Paper';
import { useLinkPreview } from '@/features/library/queries';
import { cn } from '@/lib/cn';
import { DriveFolder } from '@/components/library/DriveFolder';

/** "Video YouTube", "Danh sách phát YouTube", "Thiết kế Canva"… */
export function providerTitle(p: LinkProvider) {
  if (p.id === 'youtube') return p.kind === 'playlist' ? 'Danh sách phát YouTube' : p.kind === 'short' ? 'YouTube Shorts' : 'Video YouTube';
  if (p.id === 'canva') return 'Thiết kế Canva';
  if (p.kind === 'folder') return 'Thư mục Google Drive';
  return p.label;
}

export function ProviderIcon({ p }: { p: LinkProvider }) {
  if (p.id === 'youtube') return <PlaySquare className="ic ic-sm" />;
  if (p.id === 'canva') return <Palette className="ic ic-sm" />;
  return <Globe className="ic ic-sm" />;
}

/** What to tell a viewer when the frame stays empty. */
function sharingNote(p: LinkProvider) {
  if (p.id === 'youtube') return 'Video không phát? Chủ video có thể đã để riêng tư hoặc tắt “Cho phép nhúng”.';
  if (p.id === 'canva') return 'Không thấy thiết kế? Chủ tài liệu cần bật chia sẻ công khai trong Canva (Chia sẻ → Nhúng).';
  return 'Không xem được? Chủ tài liệu cần bật chia sẻ “Bất kỳ ai có đường liên kết”.';
}

/** The provider's own player or viewer in a frame of the right shape. */
export function EmbedFrame({ provider, title, compact }: { provider: LinkProvider; title: string; compact?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn('lv-stage', provider.kind === 'short' && 'is-tall', compact && 'is-compact')}>
      <div className={cn('lv-frame', loaded && 'is-loaded')} style={{ aspectRatio: String(provider.ratio) }}>
        <div className="lv-loading" aria-hidden>
          <span className="spin" />
          Đang mở {providerTitle(provider)}…
        </div>
        <iframe
          key={provider.embedUrl}
          src={provider.embedUrl!}
          title={title}
          loading="lazy"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}

/**
 * A document that is a link. Hosts that allow it (Google Slides, Docs,
 * Drive, YouTube, Canva, Figma) are shown inline; anything else gets a card
 * that opens the page in a new tab. Canva short links are followed first.
 */
export function LinkViewer({ doc, url, onOpen }: { doc: DocumentDetailDto | DocumentSummaryDto; url: string; onOpen: () => void }) {
  const base = useMemo(() => detectLinkProvider(url), [url]);
  const resolved = useLinkPreview(base.needsResolve ? url : null);
  const provider = resolved.data?.provider.embedUrl ? resolved.data.provider : base;
  const paper = useMemo(() => toPaperDoc(doc), [doc]);
  const waiting = base.needsResolve && resolved.isLoading;

  return (
    <section className="panel link-viewer" aria-label="Xem tài liệu">
      <header className="lv-bar">
        <span className={cn('lv-ic', `is-${provider.id}`)}>
          <ProviderIcon p={provider} />
        </span>
        <div className="lv-where">
          <b>{providerTitle(provider)}</b>
          <span className="clamp-1">{provider.host}</span>
        </div>
        <span className="spacer" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpen}>
          <ExternalLink className="ic ic-sm" />
          Mở trong tab mới
        </button>
      </header>

      {waiting ? (
        <div className="lv-frame" style={{ aspectRatio: '16 / 9' }}>
          <div className="lv-loading">
            <span className="spin" />
            Đang mở thiết kế Canva…
          </div>
        </div>
      ) : provider.folderId ? (
        <DriveFolder folderId={provider.folderId} rootName={doc.title} fallbackEmbed={provider.embedUrl!} />
      ) : provider.embedUrl ? (
        <EmbedFrame provider={provider} title={doc.title} />
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
        {sharingNote(provider)}{' '}
        <a href={url} target="_blank" rel="noopener noreferrer" className="link-inline" onClick={(e) => (e.preventDefault(), onOpen())}>
          Mở trực tiếp
        </a>
      </p>
    </section>
  );
}
