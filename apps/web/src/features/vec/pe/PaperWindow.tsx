import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, FileText, Lock, Maximize2, Minus, Plus, ShieldCheck } from 'lucide-react';
import type { PePaperDocDto } from '@kaned/shared';
import { DocxView } from '@/components/library/DocxView';
import { Watermark } from '@/components/library/Watermark';
import { Skeleton } from '@/components/ui/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/cn';
import { toApiError } from '@/lib/api';
import { FormatTag } from './ItemPicker';
import { peApi } from './peApi';
import './pe.css';

/**
 * The exam paper in its own window ("Show paper"): no download, no address of the file,
 * copying blocked when the lecturer asked for it, a faint watermark over every page.
 */
export default function PaperWindow({ host = false }: { host?: boolean }) {
  const { attemptId = '', sessionId = '' } = useParams();
  const { user } = useAuth();
  const id = host ? sessionId : attemptId;
  const q = useQuery({ queryKey: ['vec', 'pe', 'paper', host ? 'h' : 'c', id], queryFn: () => (host ? peApi.hostPaper(id) : peApi.paper(id)), staleTime: 60_000, retry: 0, refetchOnWindowFocus: false });
  const [cur, setCur] = useState(0);
  const [closed, setClosed] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) document.title = `Đề thi ${q.data.examCode} · Kaned`;
  }, [q.data]);
  // The room tells this window when the exam is over.
  useEffect(() => {
    if (host || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(`kaned-pe-${attemptId}`);
    ch.onmessage = (e) => {
      if (e.data === 'closed' || e.data === 'ended') setClosed(e.data === 'closed' ? 'Bạn đã đóng phòng thi.' : 'Đã hết giờ làm bài.');
    };
    return () => ch.close();
  }, [host, attemptId]);
  const protect = q.data?.protect;
  useEffect(() => {
    if (!protect?.noCopy) return;
    const stop = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    document.addEventListener('copy', stop);
    document.addEventListener('cut', stop);
    document.addEventListener('contextmenu', stop);
    document.addEventListener('dragstart', stop);
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('copy', stop);
      document.removeEventListener('cut', stop);
      document.removeEventListener('contextmenu', stop);
      document.removeEventListener('dragstart', stop);
      document.removeEventListener('keydown', keys);
    };
  }, [protect?.noCopy]);

  const mark = useMemo(() => (user ? `${user.name ?? ''}`.trim() : ''), [user]);

  if (closed) {
    return (
      <div className="pe-paper-page">
        <div className="pe-paper-msg"><Lock className="ic" /><h1>Đề thi đã đóng</h1><p>{closed} Bạn có thể đóng cửa sổ này.</p><button type="button" className="btn btn-primary" onClick={() => window.close()}>Đóng cửa sổ</button></div>
      </div>
    );
  }
  if (q.isLoading) return <div className="pe-paper-page"><div className="pe-paper-msg"><Skeleton style={{ height: 380, width: 'min(820px, 92vw)' }} /></div></div>;
  if (q.isError || !q.data) {
    return (
      <div className="pe-paper-page">
        <div className="pe-paper-msg"><CircleAlert className="ic" /><h1>Không mở được đề</h1><p>{toApiError(q.error).message}</p><button type="button" className="btn btn-secondary" onClick={() => window.close()}>Đóng cửa sổ</button></div>
      </div>
    );
  }
  const docs = q.data.docs;
  const doc = docs[cur];
  return (
    <div className={cn('pe-paper-page', q.data.protect.noCopy && 'pe-nocopy')}>
      <header className="pe-paper-bar">
        <div className="pe-paper-id"><FileText className="ic" /><span><b>Paper {q.data.examCode}</b><small className="clamp-1">{q.data.title}</small></span></div>
        {docs.length > 1 && (
          <nav className="pe-paper-tabs" role="tablist" aria-label="Các tệp đề">
            {docs.map((d, i) => (
              <button key={d.id} type="button" role="tab" aria-selected={i === cur} className={cn(i === cur && 'is-on')} onClick={() => setCur(i)}>
                <FormatTag format={d.format} /><span className="clamp-1">{d.name}</span>
              </button>
            ))}
          </nav>
        )}
        <span className="pe-paper-shield"><ShieldCheck className="ic ic-sm" /> {host ? 'Bản xem của giảng viên' : 'Đề thi trong phòng thi'}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}><Maximize2 className="ic ic-sm" /> Toàn màn hình</button>
      </header>
      <main className="pe-paper-stage">
        {doc && <DocStage key={doc.id} doc={doc} />}
        {q.data.protect.watermark && <Watermark label={host ? 'XEM TRƯỚC' : mark} />}
      </main>
    </div>
  );
}

function DocStage({ doc }: { doc: PePaperDocDto }) {
  const [loaded, setLoaded] = useState(false);
  const [docxFailed, setDocxFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  if (doc.image) {
    return (
      <div className="pe-paper-scroll">
        <div className="pe-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} aria-label="Thu nhỏ"><Minus className="ic ic-sm" /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.15))} aria-label="Phóng to"><Plus className="ic ic-sm" /></button>
        </div>
        <img src={doc.image} alt={doc.name} className="pe-paper-img" style={{ width: `${zoom * 100}%` }} draggable={false} />
      </div>
    );
  }
  if (doc.text != null) return <div className="pe-paper-scroll"><pre className="pe-paper-text">{doc.text}</pre></div>;
  if (!doc.src) return <div className="pe-paper-msg"><CircleAlert className="ic" /><h1>Tệp đề không còn nữa</h1><p>Báo giám thị để được hỗ trợ.</p></div>;
  if (doc.docx && !docxFailed) {
    return (
      <div className={cn('pe-paper-frame', loaded && 'is-loaded')}>
        <DocxView src={doc.docx} onReady={() => setLoaded(true)} onFail={() => setDocxFailed(true)} />
      </div>
    );
  }
  return (
    <div className={cn('pe-paper-frame', loaded && 'is-loaded')}>
      {!loaded && <div className="pe-paper-loading"><span className="spin" /> Đang mở đề…</div>}
      <iframe src={doc.src} title={doc.name} onLoad={() => setLoaded(true)} />
    </div>
  );
}
