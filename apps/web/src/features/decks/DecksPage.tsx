import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Search } from 'lucide-react';
import { foldVi, STAFF_ROLES, type DeckSummaryDto } from '@kaned/shared';
import { PageHead } from '@/components/ui/Panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useAuth } from '@/providers/AuthProvider';
import { fmtInt, timeAgo } from '@/lib/format';
import { useDecks } from './api';
import './decks.css';

export function DecksPage() {
  const { user } = useAuth();
  const { data = [], isLoading, isError, refetch } = useDecks();
  const [q, setQ] = useState('');
  const [uni, setUni] = useState('');
  const staff = user && STAFF_ROLES.includes(user.role);

  const universities = useMemo(() => {
    const map = new Map<string, DeckSummaryDto['subject']['university']>();
    for (const d of data) map.set(d.subject.university.id, d.subject.university);
    return [...map.values()];
  }, [data]);
  const list = useMemo(() => {
    const terms = foldVi(q.trim()).split(/\s+/).filter(Boolean);
    return data.filter((d) => {
      if (uni && d.subject.university.id !== uni) return false;
      const hay = foldVi(`${d.title} ${d.subject.code} ${d.subject.nameVi} ${d.description ?? ''}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [data, q, uni]);
  const studying = q ? [] : list.filter((d) => d.progress && d.progress.seen > 0).sort((a, b) => b.progress!.updatedAt.localeCompare(a.progress!.updatedAt));
  const others = list.filter((d) => !studying.includes(d));

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Thẻ ghi nhớ' }]}
        title="Thẻ ghi nhớ"
        description="Bộ đề ôn thi theo từng môn: luyện trắc nghiệm biết ngay đúng sai, lật thẻ, thi thử có tính giờ và mẹo nhớ. Tiến độ được lưu vào tài khoản của bạn."
        actions={
          staff ? (
            <Link className="btn btn-secondary btn-sm" to="/admin/decks">
              Quản lý bộ đề
            </Link>
          ) : undefined
        }
      />
      <div className="container dk-body">
        {isLoading ? (
          <div className="dk-deck-grid">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} style={{ height: 230, borderRadius: 14 }} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data.length ? (
          <EmptyState
            title="Chưa có bộ đề nào"
            description={staff ? 'Nhập bộ đề đầu tiên ở trang quản trị bằng file .md theo định dạng của Kaned.' : 'Bộ đề ôn thi sẽ xuất hiện ở đây khi được thêm vào.'}
            action={
              staff ? (
                <Link className="btn btn-primary" to="/admin/decks">
                  Nhập bộ đề
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="dk-filters dk-list-tools">
              <div className="dk-search is-sm">
                <Search className="ic" />
                <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã môn hoặc tên bộ đề" aria-label="Tìm bộ đề" />
              </div>
              {universities.length > 1 && (
                <select className="select" value={uni} onChange={(e) => setUni(e.target.value)} aria-label="Trường">
                  <option value="">Mọi trường</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {studying.length > 0 && (
              <section className="dk-section">
                <h2 className="t-h3 dk-list-h">Đang học</h2>
                <div className="dk-deck-grid">
                  {studying.map((d) => (
                    <DeckCard key={d.id} d={d} />
                  ))}
                </div>
              </section>
            )}

            {(others.length > 0 || !studying.length) && (
            <section className="dk-section">
              <h2 className="t-h3 dk-list-h">
                {q ? `${fmtInt(list.length)} bộ đề khớp “${q.trim()}”` : studying.length ? 'Bộ đề khác' : 'Tất cả bộ đề'}
              </h2>
              {others.length ? (
                <div className="dk-deck-grid">
                  {others.map((d) => (
                    <DeckCard key={d.id} d={d} />
                  ))}
                </div>
              ) : (
                <p className="dk-hint">Không có bộ đề nào khớp. Thử mã môn, ví dụ MLN122.</p>
              )}
            </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function DeckCard({ d }: { d: DeckSummaryDto }) {
  const p = d.progress;
  const okp = p && d.questionCount ? (p.ok / d.questionCount) * 100 : 0;
  const badp = p && d.questionCount ? (p.bad / d.questionCount) * 100 : 0;
  return (
    <Link to={`/app/flashcards/${d.id}`} className="dk-deck" style={{ ['--uni' as string]: d.subject.university.color }}>
      <div className="dk-deck-top">
        <span className="dk-code">{d.subject.code}</span>
        <span className="dk-uni">{d.subject.university.code}</span>
        {d.status === 'DRAFT' && <span className="badge badge-amber">Bản nháp</span>}
      </div>
      <h3>{d.title}</h3>
      <p className="dk-deck-subj">{d.subject.nameVi}</p>
      <div className="dk-deck-facts">
        <span>
          <Layers className="ic ic-xs" />
          {fmtInt(d.questionCount)} câu
        </span>
        {d.tipCount > 0 && <span>{fmtInt(d.tipCount)} mẹo</span>}
        {d.chapterCount > 0 && <span>{fmtInt(d.chapterCount)} chương</span>}
      </div>
      <div className="dk-deck-prog">
        <div className="dk-bar">
          <i className="is-ok" style={{ width: `${okp}%` }} />
          <i className="is-bad" style={{ width: `${badp}%` }} />
        </div>
        <div className="dk-deck-foot">
          <span>{p && p.seen ? `${Math.round(okp)}% đã thuộc${p.bad ? ` · ${fmtInt(p.bad)} cần ôn` : ''}` : 'Chưa học'}</span>
          <b>{p && p.seen ? 'Học tiếp' : 'Bắt đầu'}</b>
        </div>
        {p && p.seen > 0 && <small className="dk-deck-when">Học lần cuối {timeAgo(p.updatedAt)}</small>}
      </div>
    </Link>
  );
}
