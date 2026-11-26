import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, QrCode, Share2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { meetLink } from './api';

/** The event's public link: copy, share, open, and a QR code to put on a projector. */
export function ShareLink({ slug, title, compact = false, qr = true }: { slug: string; title: string; compact?: boolean; qr?: boolean }) {
  const link = meetLink(slug);
  const [copied, setCopied] = useState(false);
  const [svg, setSvg] = useState('');
  const [showQr, setShowQr] = useState(!compact && qr);

  useEffect(() => {
    if (!showQr) return;
    let live = true;
    void import('qrcode').then((q) =>
      q.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0F1E5C', light: '#FFFFFF' } }).then((s) => live && setSvg(s)),
    );
    return () => {
      live = false;
    };
  }, [link, showQr]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const i = document.createElement('input');
      i.value = link;
      document.body.appendChild(i);
      i.select();
      document.execCommand('copy');
      i.remove();
    }
    setCopied(true);
    navigator.vibrate?.(10);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = () => void navigator.share?.({ title, text: `Điền giờ rảnh cho "${title}"`, url: link }).catch(() => undefined);

  return (
    <div className={cn('mt-share', compact && 'is-compact')}>
      <div className="mt-link">
        <span className="mt-link-url" title={link}>
          <i>{location.host}/m/</i>
          <b>{slug}</b>
        </span>
        <button type="button" className={cn('btn btn-primary btn-sm', copied && 'is-done')} onClick={copy} aria-live="polite">
          {copied ? <Check className="ic ic-sm" /> : <Copy className="ic ic-sm" />}
          {copied ? 'Đã chép' : 'Chép link'}
        </button>
      </div>
      <div className="mt-share-row">
        {'share' in navigator && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={share}>
            <Share2 className="ic ic-sm" /> Chia sẻ
          </button>
        )}
        <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noopener">
          <ExternalLink className="ic ic-sm" /> Mở trang
        </a>
        {qr && compact && (
          <button type="button" className={cn('btn btn-ghost btn-sm', showQr && 'is-on')} onClick={() => setShowQr((v) => !v)} aria-pressed={showQr}>
            <QrCode className="ic ic-sm" /> Mã QR
          </button>
        )}
      </div>
      {showQr && (
        <figure className="mt-qr">
          {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="mt-qr-wait" />}
          <figcaption>Quét để mở trên điện thoại</figcaption>
        </figure>
      )}
    </div>
  );
}
