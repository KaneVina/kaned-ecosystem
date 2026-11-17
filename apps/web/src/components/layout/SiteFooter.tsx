import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, ArrowUpRight, CloudUpload, Calculator } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { useUniversities } from '@/features/catalog/queries';
import { cn } from '@/lib/cn';

type Health = { state: 'checking' | 'ok' | 'slow' | 'down'; ms?: number };

/**
 * Pings /health once the footer scrolls into view, so the status line says
 * what the server is actually doing rather than a fixed "all good".
 */
function useHealth(target: React.RefObject<HTMLElement>) {
  const [health, setHealth] = useState<Health>({ state: 'checking' });
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let done = false;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || done) return;
      done = true;
      io.disconnect();
      const t = performance.now();
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch('/api/health?db=1', { cache: 'no-store', signal: ctrl.signal });
        const ms = Math.round(performance.now() - t);
        const body = (await r.json().catch(() => ({}))) as { db?: string };
        setHealth(r.ok && body.db === 'ok' ? { state: ms > 2500 ? 'slow' : 'ok', ms } : { state: 'down' });
      } catch {
        setHealth({ state: 'down' });
      } finally {
        window.clearTimeout(timer);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return health;
}

const HEALTH_TEXT: Record<Health['state'], string> = {
  checking: 'Đang kiểm tra máy chủ…',
  ok: 'Hệ thống hoạt động bình thường',
  slow: 'Máy chủ đang phản hồi chậm',
  down: 'Không kết nối được máy chủ',
};

export interface FooterLink {
  label: string;
  to?: string;
  onClick?: () => void;
}

/**
 * The closing block of every page: a nudge to contribute, the map of the
 * product, a live server status and a way back to the top.
 */
export function SiteFooter({ columns, compact = false }: { columns?: Array<{ title: string; links: FooterLink[] }>; compact?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const health = useHealth(ref);
  const { data: universities = [] } = useUniversities();
  const docs = universities.reduce((n, u) => n + (u.documentCount ?? 0), 0);
  const year = new Date().getFullYear();

  return (
    <footer className={cn('sf', compact && 'sf-compact')} ref={ref}>
      <div className="sf-grid" aria-hidden />
      <div className="container sf-in">
        {!compact && (
          <div className="sf-cta">
            <div>
              <h2>Có tài liệu hay? Chia sẻ để cả lớp cùng học.</h2>
              <p>Đề cũ, slide, ghi chép — mỗi tài liệu bạn đăng giúp một khoá sau đỡ vất vả hơn.</p>
            </div>
            <div className="sf-cta-actions">
              <Link to="/app/upload" className="btn btn-primary">
                <CloudUpload className="ic ic-sm" />
                Đăng tài liệu
              </Link>
              <Link to="/app/tools/gpa" className="btn sf-btn-ghost">
                <Calculator className="ic ic-sm" />
                Tính GPA
              </Link>
            </div>
          </div>
        )}

        <div className="sf-main">
          <div className="sf-brand">
            <Link to="/app" className="sf-logo" aria-label="Kaned — trang chủ">
              <Wordmark />
            </Link>
            <p>Hệ sinh thái học tập cho sinh viên Việt Nam: tài liệu, điểm số và lộ trình môn học trên một tài khoản.</p>
            {universities.length > 0 && (
              <p className="sf-stats">
                <b>{docs.toLocaleString('vi-VN')}</b> tài liệu · <b>{universities.length}</b> trường
              </p>
            )}
            <p className={cn('sf-health', `is-${health.state}`)} role="status">
              <span className="sf-pulse" aria-hidden />
              {HEALTH_TEXT[health.state]}
              {health.ms !== undefined && health.state !== 'down' && <span className="sf-ms">{health.ms} ms</span>}
            </p>
          </div>

          {columns && (
            <nav className="sf-cols" aria-label="Liên kết cuối trang">
              {columns.map((col) => (
                <div key={col.title}>
                  <h3>{col.title}</h3>
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.label}>
                        {l.to ? (
                          <Link to={l.to} className="sf-link">
                            {l.label}
                            <ArrowUpRight className="ic ic-xs" aria-hidden />
                          </Link>
                        ) : (
                          <button type="button" className="sf-link" onClick={l.onClick}>
                            {l.label}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>

        <div className="sf-bottom">
          <p>© {year} Kaned. Tài liệu thuộc về sinh viên đã viết ra chúng.</p>
          <p className="sf-note">Điểm và lộ trình chỉ để tham khảo — hãy đối chiếu với phòng đào tạo.</p>
          <button type="button" className="sf-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Lên đầu trang
            <ArrowUp className="ic ic-xs" />
          </button>
        </div>
      </div>
    </footer>
  );
}
