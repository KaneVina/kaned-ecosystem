import { CircleAlert, CircleCheck, CircleHelp, RotateCw } from 'lucide-react';
import type { LinkPreviewDto, LinkProvider } from '@kaned/shared';
import { EmbedFrame, ProviderIcon, providerTitle } from './LinkViewer';
import { cn } from '@/lib/cn';

/**
 * Upload form: what a pasted YouTube or Canva link will look like on Kaned,
 * and what to change when other people would not be able to see it.
 */
export function LinkCheck({
  provider,
  preview,
  loading,
  onRetry,
}: {
  provider: LinkProvider;
  preview: LinkPreviewDto | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const p = preview?.provider.embedUrl ? preview.provider : provider;
  const status = loading ? 'loading' : (preview?.status ?? 'unknown');
  const pill = {
    loading: ['is-wait', <span key="s" className="spin" />, 'Đang kiểm tra…'],
    ok: ['is-ok', <CircleCheck key="i" className="ic ic-xs" />, 'Xem được ngay trên Kaned'],
    private: ['is-warn', <CircleAlert key="i" className="ic ic-xs" />, 'Chưa chia sẻ công khai'],
    missing: ['is-bad', <CircleAlert key="i" className="ic ic-xs" />, 'Không tìm thấy'],
    unknown: ['is-muted', <CircleHelp key="i" className="ic ic-xs" />, 'Chưa kiểm tra được'],
  }[status] as [string, JSX.Element, string];
  const canShow = Boolean(p.embedUrl) && (status === 'ok' || status === 'unknown');

  return (
    <div className="lk-check">
      <div className="lk-head">
        <span className={cn('lv-ic', `is-${p.id}`)}>
          <ProviderIcon p={p} />
        </span>
        <div className="lk-what">
          <b>{providerTitle(p)}</b>
          {preview?.title ? (
            <span className="clamp-1">
              {preview.title}
              {preview.author ? ` · ${preview.author}` : ''}
            </span>
          ) : (
            <span className="clamp-1">{p.host}</span>
          )}
        </div>
        <span className={cn('lk-pill', pill[0])}>
          {pill[1]}
          {pill[2]}
        </span>
      </div>

      {canShow && <EmbedFrame provider={p} title={preview?.title ?? providerTitle(p)} compact />}

      {status === 'private' && (
        <div className="lk-fix">
          {p.id === 'youtube' ? (
            <p>
              Video đang <b>riêng tư</b> hoặc đã <b>tắt cho phép nhúng</b>, nên người khác không xem được trên Kaned. Trong YouTube Studio, mở
              video: đặt chế độ hiển thị là <b>Công khai</b> hoặc <b>Không công khai</b>, và ở mục Hiển thị thêm, bật <b>Cho phép nhúng</b>.
            </p>
          ) : (
            <p>
              Thiết kế chưa được công khai nên chưa hiện được. Trong Canva, bấm <b>Chia sẻ</b> → <b>Xem tất cả</b> → <b>Nhúng</b> →{' '}
              <b>Nhúng</b> (thiết kế sẽ được công khai), rồi bấm kiểm tra lại.
            </p>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            <RotateCw className="ic ic-sm" />
            Kiểm tra lại
          </button>
        </div>
      )}
      {status === 'missing' && (
        <div className="lk-fix">
          <p>Không tìm thấy {p.id === 'youtube' ? 'video' : 'thiết kế'} này. Kiểm tra lại liên kết, có thể bạn chép thiếu.</p>
        </div>
      )}
      {status === 'unknown' && !p.embedUrl && provider.needsResolve && (
        <div className="lk-fix">
          <p>
            Chưa mở được liên kết rút gọn canva.link. Hãy mở nó trong trình duyệt và dán liên kết đầy đủ dạng
            <code> canva.com/design/…</code>.
          </p>
        </div>
      )}
      {status === 'unknown' && p.embedUrl && (
        <p className="lk-note">Chưa kiểm tra được quyền xem. Nếu khung phía trên trống, hãy bật chia sẻ công khai cho {p.id === 'youtube' ? 'video' : 'thiết kế'}.</p>
      )}
    </div>
  );
}
