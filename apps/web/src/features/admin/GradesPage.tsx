import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, GraduationCap, SearchX, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import type { AdminGradesQuery } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useGradesOverview, useUniversitiesAdmin } from './api';
import { AdminHead, EmptyBlock, EmptyRow, Pager, SearchBox, TableSkeleton, useDebounced } from './ui';
import { useAdminCrumbs } from './AdminShell';

const STANDINGS: Array<[AdminGradesQuery['standing'], string]> = [
  ['all', 'Tất cả'],
  ['failing', 'Có môn trượt'],
  ['warning', 'GPA dưới 2.0'],
  ['good', 'GPA từ 3.2'],
];

/** GPA in colour: strong, fine, or worth a look. */
export const gpaTone = (gpa: number, graded: number) => (!graded ? 'muted' : gpa >= 3.2 ? 'good' : gpa >= 2 ? 'ok' : 'low');

/**
 * Every student's grades at a glance. Admins only — the API refuses
 * moderators too, this page is not just hidden from them.
 */
export function GradesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const [universityId, setUniversityId] = useState('');
  const [standing, setStanding] = useState<AdminGradesQuery['standing']>('all');
  const [sort, setSort] = useState<AdminGradesQuery['sort']>('updated');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGradesOverview({ q: query || undefined, universityId: universityId || undefined, standing, sort, page, pageSize: 25 });
  const { data: universities = [] } = useUniversitiesAdmin();
  useAdminCrumbs([{ label: 'Điểm sinh viên' }]);
  useEffect(() => setPage(1), [query, universityId, standing, sort]);
  const items = data?.items ?? [];
  const s = data?.stats;

  return (
    <>
      <AdminHead
        title="Điểm sinh viên"
        count={data?.total}
        description="Điểm và GPA sinh viên tự nhập. Chỉ quản trị viên xem được trang này — kiểm duyệt viên không có quyền."
      />

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-top">
            Sinh viên có điểm
            <Users className="ic" />
          </span>
          <b>{s ? fmtInt(s.students) : '–'}</b>
          <small>{s ? `${fmtInt(s.gradedSubjects)} lượt điểm môn` : ' '}</small>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-top">
            GPA trung bình
            <TrendingUp className="ic" />
          </span>
          <b>{s ? s.avgGpa4.toFixed(2) : '–'}</b>
          <small>Hệ 4, trên mọi sinh viên có điểm</small>
        </div>
        <button type="button" className={cn('adm-stat', s && s.failing > 0 && 'is-attention')} onClick={() => setStanding('failing')} style={{ textAlign: 'left' }}>
          <span className="adm-stat-top">
            Có môn trượt
            <AlertTriangle className="ic" />
          </span>
          <b>{s ? fmtInt(s.failing) : '–'}</b>
          <small>Bấm để lọc những sinh viên này</small>
        </button>
        <div className="adm-stat">
          <span className="adm-stat-top">
            Quyền xem
            <ShieldCheck className="ic" />
          </span>
          <b style={{ fontSize: 18, marginTop: 10 }}>Chỉ quản trị viên</b>
          <small>Kiểm duyệt viên không mở được điểm</small>
        </div>
      </div>

      <section className="adm-panel">
        <div className="adm-tabs" role="tablist" aria-label="Tình trạng học tập">
          {STANDINGS.map(([k, label]) => (
            <button key={k} type="button" role="tab" className="adm-tab" aria-selected={standing === k} onClick={() => setStanding(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm theo tên, email hoặc mã ngành…" />
          <select className="select" value={universityId} onChange={(e) => setUniversityId(e.target.value)} aria-label="Trường">
            <option value="">Mọi trường</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as AdminGradesQuery['sort'])} aria-label="Sắp xếp">
            <option value="updated">Mới cập nhật</option>
            <option value="gpa_desc">GPA cao → thấp</option>
            <option value="gpa_asc">GPA thấp → cao</option>
            <option value="name">Tên A → Z</option>
          </select>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table is-clickable">
            <thead>
              <tr>
                <th>Sinh viên</th>
                <th>Trường · ngành</th>
                <th className="num">GPA</th>
                <th>Tín chỉ đạt</th>
                <th className="num">Môn trượt</th>
                <th className="num">Đang học</th>
                <th>Cập nhật</th>
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : !items.length ? (
              <EmptyRow cols={7}>
                <EmptyBlock icon={standing === 'all' && !query ? GraduationCap : SearchX} title={standing === 'all' && !query ? 'Chưa có sinh viên nào nhập điểm' : 'Không có sinh viên khớp'} text={standing === 'all' && !query ? 'Điểm hiện ở đây khi sinh viên lưu điểm trong trang Môn học hoặc Tính GPA.' : 'Thử bỏ bộ lọc hoặc tìm bằng từ khác.'} />
              </EmptyRow>
            ) : (
              <tbody>
                {items.map((r) => {
                  const ratio = r.totalCredits ? Math.min(100, Math.round((r.earnedCredits / r.totalCredits) * 100)) : 0;
                  return (
                    <tr key={r.user.id} onClick={() => navigate(`/admin/users/${r.user.id}?tab=grades`)}>
                      <td>
                        <div className="cell">
                          <Avatar name={r.user.name} src={r.user.avatarUrl} size="sm" />
                          <div>
                            <span className="cell-title">{r.user.name}</span>
                            <span className="cell-sub">{r.user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 13.5 }}>
                        {r.university ? (
                          <>
                            {r.university.code}
                            {r.major && <span className="muted"> · {r.major.code}</span>}
                            {r.year && <span className="muted"> · năm {r.year}</span>}
                          </>
                        ) : (
                          <span className="muted">Chưa chọn trường</span>
                        )}
                      </td>
                      <td className="num">
                        <span className={cn('gpa-pill', `is-${gpaTone(r.gpa4, r.gradedCount)}`)} title={r.classification}>
                          {r.gradedCount ? r.gpa4.toFixed(2) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="cred-cell">
                          <span className="cred-bar">
                            <i style={{ width: `${ratio}%` }} />
                          </span>
                          {r.earnedCredits}/{r.totalCredits}
                        </span>
                      </td>
                      <td className="num">{r.failedCount ? <b className="fail-n">{r.failedCount}</b> : <span className="muted">0</span>}</td>
                      <td className="num">{r.inProgressCount || <span className="muted">0</span>}</td>
                      <td className="w-date">{fmtDate(r.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        {data && data.total > 0 && <Pager page={page} totalPages={data.totalPages} total={data.total} unit="sinh viên" onPage={setPage} />}
      </section>
    </>
  );
}
