import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark, CalendarClock, Download, FileArchive, FolderHeart, Layers, Search, Star, Upload, type LucideIcon, ClipboardCheck,
} from 'lucide-react';
import type { AdminUserLibraryDto, LibraryDocDto } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { fmtBytes, fmtDateTime, fmtInt, fmtRelative } from '@/lib/format';
import { useUserLibrary } from './api';
import { EmptyBlock } from './ui';

/*
 * Everything one person keeps on Kaned: what they saved and into which
 * collections, what they uploaded, downloaded and rated, their flashcard
 * progress, exam rooms and files, and group-meeting events.
 */

type View = 'saved' | 'collections' | 'downloads' | 'uploads' | 'reviews' | 'decks' | 'exams' | 'files' | 'meets';
const VIEWS: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: 'saved', label: 'Đã lưu', icon: Bookmark },
  { id: 'collections', label: 'Bộ sưu tập', icon: FolderHeart },
  { id: 'downloads', label: 'Đã tải về', icon: Download },
  { id: 'uploads', label: 'Đã đăng', icon: Upload },
  { id: 'reviews', label: 'Đánh giá', icon: Star },
  { id: 'decks', label: 'Thẻ ôn tập', icon: Layers },
  { id: 'exams', label: 'Phòng thi', icon: ClipboardCheck },
  { id: 'files', label: 'File phòng thi', icon: FileArchive },
  { id: 'meets', label: 'Hẹn họp', icon: CalendarClock },
];

const STATUS: Record<string, { label: string; tone: string }> = {
  PUBLISHED: { label: 'Công khai', tone: 'green' },
  PENDING: { label: 'Chờ duyệt', tone: 'amber' },
  DRAFT: { label: 'Nháp', tone: 'gray' },
  HIDDEN: { label: 'Đã ẩn', tone: 'gray' },
  REJECTED: { label: 'Bị từ chối', tone: 'red' },
};
const FILE_ROLE: Record<string, string> = { PAPER: 'Đề thi', MATERIAL: 'Tài liệu kèm', SUBMISSION: 'Bài nộp' };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

function DocCell({ d, extra }: { d: LibraryDocDto; extra?: ReactNode }) {
  const st = d.status ? STATUS[d.status] : null;
  return (
    <>
      {d.missing ? (
        <span className="cell-title lib-missing">{d.title}</span>
      ) : (
        <Link to={`/admin/documents?open=${d.id}`} className="cell-title">{d.title}</Link>
      )}
      <span className="cell-sub lib-sub">
        {d.subjectCode && <b>{d.subjectCode}</b>}
        {d.format && <span>{d.format}</span>}
        {d.bytes != null && <span>{fmtBytes(d.bytes)}</span>}
        {st && d.status !== 'PUBLISHED' && <span className={cn('lib-st', `is-${st.tone}`)}>{st.label}</span>}
        {d.missing && <span className="lib-st is-red">Đã xoá</span>}
        {extra}
      </span>
    </>
  );
}

function When({ at }: { at: string | null }) {
  return at ? <time className="w-date" title={fmtDateTime(at)}>{fmtRelative(at)}</time> : <span className="lib-dim">—</span>;
}

export function UserLibraryTab({ userId }: { userId: string }) {
  const { data, isLoading } = useUserLibrary(userId);
  const [view, setView] = useState<View>('saved');
  const [q, setQ] = useState('');
  const k = fold(q.trim());
  const has = (...t: Array<string | null | undefined>) => !k || t.some((x) => x && fold(x).includes(k));

  const counts = data?.counts;
  const total = useMemo(() => (counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0), [counts]);

  if (isLoading || !data) {
    return (
      <div className="adm-panel-body">
        <div className="skel" style={{ height: 40, borderRadius: 8, marginBottom: 12 }} />
        <div className="skel" style={{ height: 220, borderRadius: 8 }} />
      </div>
    );
  }
  if (!total) {
    return <EmptyBlock icon={Bookmark} title="Chưa có dữ liệu" text="Người này chưa lưu, tải, đăng hay đánh giá tài liệu nào, chưa ôn thẻ, vào phòng thi hay hẹn họp." />;
  }

  return (
    <>
      <div className="lib-nav" role="tablist" aria-label="Loại dữ liệu">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={cn(view === v.id && 'is-on', !data.counts[v.id] && 'is-empty')} onClick={() => setView(v.id)}>
            <v.icon className="ic" />
            {v.label}
            <span className="n">{fmtInt(data.counts[v.id])}</span>
          </button>
        ))}
      </div>
      <div className="adm-toolbar">
        <label className="lib-search">
          <Search className="ic" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc theo tên, mã môn…" aria-label="Lọc" />
        </label>
      </div>
      <div className="adm-table-wrap">
        <LibView view={view} data={data} has={has} />
      </div>
    </>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <tbody>
      <tr>
        <td colSpan={cols} className="lib-empty">{text}</td>
      </tr>
    </tbody>
  );
}

function LibView({ view, data, has }: { view: View; data: AdminUserLibraryDto; has: (...t: Array<string | null | undefined>) => boolean }) {
  switch (view) {
    case 'saved': {
      const rows = data.saved.filter((d) => has(d.title, d.subjectCode, ...d.collections));
      return (
        <table className="adm-table">
          <thead><tr><th>Tài liệu đã lưu</th><th>Trong bộ sưu tập</th><th>Lưu lúc</th></tr></thead>
          {!rows.length ? <Empty cols={3} text="Không có tài liệu đã lưu." /> : (
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><DocCell d={d} /></td>
                  <td>{d.collections.length ? <span className="lib-chips">{d.collections.map((c) => <span key={c} className="lib-chip">{c}</span>)}</span> : <span className="lib-dim">—</span>}</td>
                  <td><When at={d.savedAt} /></td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
    case 'collections': {
      const cols = data.collections.filter((c) => has(c.name, ...c.docs.map((d) => d.title)));
      if (!cols.length) return <table className="adm-table"><Empty cols={1} text="Không có bộ sưu tập." /></table>;
      return (
        <div className="lib-cols">
          {cols.map((c) => (
            <section key={c.id} className="lib-col">
              <header>
                <FolderHeart className="ic" />
                <b>{c.name}</b>
                <span>{fmtInt(c.docs.length)} tài liệu · tạo {fmtRelative(c.createdAt)}</span>
              </header>
              {c.docs.length ? (
                <ul>
                  {c.docs.map((d) => (
                    <li key={d.id}>
                      <div><DocCell d={d} /></div>
                      <When at={d.addedAt} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="lib-dim">Bộ sưu tập trống.</p>
              )}
            </section>
          ))}
        </div>
      );
    }
    case 'downloads': {
      const rows = data.downloads.filter((d) => has(d.title, d.subjectCode));
      return (
        <table className="adm-table">
          <thead><tr><th>Tài liệu đã tải</th><th className="num">Số lần tải</th><th>Lần cuối</th></tr></thead>
          {!rows.length ? <Empty cols={3} text="Chưa tải tài liệu nào." /> : (
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><DocCell d={d} /></td>
                  <td className="num">{fmtInt(d.times)}</td>
                  <td><When at={d.lastAt} /></td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
    case 'uploads': {
      const rows = data.uploads.filter((d) => has(d.title, d.subjectCode));
      return (
        <table className="adm-table">
          <thead><tr><th>Tài liệu đã đăng</th><th className="num">Lượt xem</th><th className="num">Lượt tải</th><th className="num">Đánh giá</th><th>Đăng lúc</th></tr></thead>
          {!rows.length ? <Empty cols={5} text="Chưa đăng tài liệu nào." /> : (
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><DocCell d={d} /></td>
                  <td className="num">{fmtInt(d.views)}</td>
                  <td className="num">{fmtInt(d.downloads)}</td>
                  <td className="num">{d.ratingCount ? `${d.ratingAvg.toFixed(1)} ★ (${fmtInt(d.ratingCount)})` : '—'}</td>
                  <td><When at={d.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
    case 'reviews': {
      const rows = data.reviews.filter((r) => has(r.doc.title, r.doc.subjectCode, r.comment));
      return (
        <table className="adm-table">
          <thead><tr><th>Tài liệu</th><th>Đánh giá</th><th>Lúc</th></tr></thead>
          {!rows.length ? <Empty cols={3} text="Chưa đánh giá tài liệu nào." /> : (
            <tbody>
              {rows.map((r) => (
                <tr key={r.doc.id}>
                  <td><DocCell d={r.doc} /></td>
                  <td>
                    <span className="lib-stars" aria-label={`${r.score} sao`}>{'★'.repeat(r.score)}<i>{'★'.repeat(5 - r.score)}</i></span>
                    {r.comment && <span className="lib-comment">{r.comment}</span>}
                  </td>
                  <td><When at={r.at} /></td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
    case 'decks': {
      const rows = data.decks.filter((d) => has(d.title, d.subjectCode));
      return (
        <table className="adm-table">
          <thead><tr><th>Bộ thẻ</th><th style={{ width: '26%' }}>Đã làm</th><th className="num">Đúng / sai</th><th className="num">Đánh dấu</th><th className="num">Buổi học</th><th>Gần nhất</th></tr></thead>
          {!rows.length ? <Empty cols={6} text="Chưa ôn bộ thẻ nào." /> : (
            <tbody>
              {rows.map((d) => {
                const pct = d.questions ? Math.min(1, d.seen / d.questions) : 0;
                return (
                  <tr key={d.deckId}>
                    <td>
                      <Link to={`/app/flashcards/${d.deckId}`} className="cell-title">{d.title}</Link>
                      <span className="cell-sub lib-sub">{d.subjectCode && <b>{d.subjectCode}</b>}<span>{fmtInt(d.answers)} lượt trả lời</span></span>
                    </td>
                    <td>
                      <span className="bar-cell">
                        <span className="bar-track"><i style={{ width: `${pct * 100}%` }} /></span>
                        <b className="dur">{fmtInt(d.seen)}/{fmtInt(d.questions)}</b>
                      </span>
                    </td>
                    <td className="num"><span className="lib-ok">{fmtInt(d.ok)}</span> / <span className="lib-bad">{fmtInt(d.bad)}</span></td>
                    <td className="num">{fmtInt(d.marked)}</td>
                    <td className="num">{fmtInt(d.sessions)}</td>
                    <td><When at={d.updatedAt} /></td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      );
    }
    case 'exams': {
      const rows = data.exams.filter((e) => has(e.title, e.subjectCode));
      return (
        <table className="adm-table">
          <thead><tr><th>Phòng thi</th><th className="num">Lượt thi</th><th className="num">Điểm cao nhất</th><th className="num">Điểm tính</th><th>Kết quả</th><th>Gần nhất</th></tr></thead>
          {!rows.length ? <Empty cols={6} text="Chưa vào phòng thi nào." /> : (
            <tbody>
              {rows.map((e) => (
                <tr key={e.sessionId}>
                  <td>
                    <span className="cell-title">{e.title}</span>
                    <span className="cell-sub lib-sub"><b>{e.subjectCode}</b><span>{e.kind === 'PE' ? 'Thi thực hành' : 'Trắc nghiệm'}</span></span>
                  </td>
                  <td className="num">{fmtInt(e.attempts)}</td>
                  <td className="num">{e.best == null ? '—' : e.best.toFixed(1)}</td>
                  <td className="num">{e.counted == null ? '—' : e.counted.toFixed(1)}</td>
                  <td>{e.passed == null ? <span className="lib-dim">Chưa chấm</span> : <span className={cn('lib-st', e.passed ? 'is-green' : 'is-red')}>{e.passed ? 'Đạt' : 'Chưa đạt'}</span>}</td>
                  <td><When at={e.lastAt} /></td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
    case 'files': {
      const rows = data.files.filter((f) => has(f.name, f.sessionTitle));
      return (
        <table className="adm-table">
          <thead><tr><th>File</th><th>Loại</th><th>Phòng thi</th><th className="num">Dung lượng</th><th>Tải lên</th></tr></thead>
          {!rows.length ? <Empty cols={5} text="Chưa có file nào trong phòng thi." /> : (
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td><span className="cell-title">{f.name}</span><span className="cell-sub lib-sub"><span>{f.format}</span></span></td>
                  <td><span className="lib-chip">{FILE_ROLE[f.role] ?? f.role}</span></td>
                  <td>{f.sessionTitle ?? <span className="lib-dim">—</span>}</td>
                  <td className="num">{fmtBytes(f.bytes)}</td>
                  <td><When at={f.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
    case 'meets': {
      const rows = data.meets.filter((m) => has(m.title, m.slug));
      return (
        <table className="adm-table">
          <thead><tr><th>Sự kiện</th><th>Vai trò</th><th>Trạng thái</th><th className="num">Giờ rảnh đã tô</th><th>Cập nhật</th></tr></thead>
          {!rows.length ? <Empty cols={5} text="Chưa tạo hay tham gia sự kiện hẹn họp nào." /> : (
            <tbody>
              {rows.map((m) => (
                <tr key={m.slug}>
                  <td><a href={`/m/${m.slug}`} target="_blank" rel="noopener" className="cell-title">{m.title}</a><span className="cell-sub lib-sub"><span>/m/{m.slug}</span></span></td>
                  <td>{m.owner ? <span className="lib-chip is-lead">Trưởng nhóm</span> : <span className="lib-chip">Thành viên</span>}</td>
                  <td><span className={cn('lib-st', m.status === 'FINAL' ? 'is-green' : 'is-blue')}>{m.status === 'FINAL' ? 'Đã chốt' : 'Đang lấy giờ'}</span></td>
                  <td className="num">{m.savedAt ? fmtInt(m.free) + ' ô' : '—'}</td>
                  <td><When at={m.updatedAt} /></td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
  }
}
