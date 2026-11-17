import { Fragment, useState } from 'react';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { evaluateAssessment, evaluatePassCriteria, type AdminUserGradeDto } from '@kaned/shared';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { useUserGrades } from './api';
import { gpaTone } from './GradesPage';
import { EmptyBlock, EmptyRow, TableSkeleton } from './ui';

const OUTCOME: Record<AdminUserGradeDto['outcome'], { label: string; tone: string }> = {
  passed: { label: 'Qua', tone: 'green' },
  failed: { label: 'Trượt', tone: 'red' },
  in_progress: { label: 'Đang học', tone: 'amber' },
  conditions: { label: 'Chưa đủ điều kiện', tone: 'amber' },
};

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/** Component scores and pass conditions behind one subject's grade. */
function GradeBreakdown({ g, passMark }: { g: AdminUserGradeDto; passMark: number }) {
  const scheme = evaluateAssessment(g.assessmentScheme, g.criteria, passMark);
  const crit = evaluatePassCriteria(g.passCriteria, g.score10, g.criteria, g.assessmentScheme, passMark);
  return (
    <div className="ug-break">
      {g.assessmentScheme.length > 0 && (
        <div>
          <h4>Cơ cấu điểm</h4>
          <ul>
            {scheme.lines.map((l) => (
              <li key={l.item.id} className={`is-${l.state}`}>
                <span>
                  {l.item.name} <i>{l.item.weight}%</i>
                </span>
                <span className="ug-parts">{l.scores.map((x) => (x === null ? '—' : fmt(x))).join(' · ')}</span>
                <b>{l.avg === null ? '—' : fmt(l.avg)}</b>
              </li>
            ))}
          </ul>
          <p>
            Tính từ các cột: <b>{scheme.total !== null ? fmt(scheme.total) : `${fmt(scheme.partial)} (mới ${scheme.weightEntered}%)`}</b>
          </p>
        </div>
      )}
      {g.passCriteria.length > 0 && (
        <div>
          <h4>Điều kiện qua môn</h4>
          <ul>
            {crit.checks.map((c) => (
              <li key={c.criterion.id} className={`is-${c.state}`}>
                <span>{c.text}</span>
                <span className="ug-parts">{c.detail ?? ''}</span>
                <b>{c.state === 'ok' ? 'Đạt' : c.state === 'bad' ? 'Không đạt' : c.state === 'retake' ? 'Chờ thi lại' : 'Chưa nhập'}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function UserGradesTab({ userId }: { userId: string }) {
  const { data, isLoading } = useUserGrades(userId);
  const [open, setOpen] = useState<string | null>(null);
  const s = data?.summary;
  const byTerm = new Map<number, AdminUserGradeDto[]>();
  for (const g of data?.grades ?? []) {
    const t = g.termNo ?? 0;
    if (!byTerm.has(t)) byTerm.set(t, []);
    byTerm.get(t)!.push(g);
  }
  const terms = [...byTerm.entries()].sort(([a], [b]) => (a || 99) - (b || 99));
  const termSummary = new Map((s?.byTerm ?? []).map((t) => [t.termNo, t]));

  return (
    <>
      {s && data!.grades.length > 0 && (
        <div className="ug-sum">
          <div>
            <span>GPA hệ 4</span>
            <b className={cn('gpa-pill', `is-${gpaTone(s.gpa4, s.gradedCount)}`)}>{s.gpa4.toFixed(2)}</b>
            <small>{s.classification.vi}</small>
          </div>
          <div>
            <span>GPA hệ 10</span>
            <b>{s.gpa10.toFixed(2)}</b>
            <small>Điểm qua môn {fmt(data!.passMark)}</small>
          </div>
          <div>
            <span>Tín chỉ đạt</span>
            <b>
              {s.earnedCredits}
              <small>/{s.totalCredits}</small>
            </b>
            <small>{data!.major ? data!.major.nameVi : 'Chưa chọn ngành'}</small>
          </div>
          <div>
            <span>Môn trượt</span>
            <b className={s.failedCount ? 'fail-n' : undefined}>{s.failedCount}</b>
            <small>{s.gradedCount} môn có điểm</small>
          </div>
        </div>
      )}
      <div className="adm-table-wrap">
        <table className="adm-table is-clickable">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th>Môn</th>
              <th className="num">TC</th>
              <th className="num">Điểm</th>
              <th className="num">Chữ</th>
              <th className="num">Hệ 4</th>
              <th>Kết quả</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton cols={8} rows={6} />
          ) : !data?.grades.length ? (
            <EmptyRow cols={8}>
              <EmptyBlock icon={GraduationCap} title="Chưa nhập điểm môn nào" text="Điểm hiện ở đây khi người này lưu điểm trong trang Môn học hoặc Tính GPA." />
            </EmptyRow>
          ) : (
            <tbody>
              {terms.map(([term, list]) => {
                const ts = termSummary.get(term);
                return (
                  <Fragment key={term}>
                    <tr className="ug-term">
                      <td colSpan={8}>
                        <b>{term ? `Kỳ ${term}` : 'Chưa xếp kỳ'}</b>
                        {ts && (
                          <span>
                            GPA kỳ {ts.gpa4.toFixed(2)} · {ts.earnedCredits}/{ts.credits} TC đạt
                          </span>
                        )}
                      </td>
                    </tr>
                    {list.map((g) => {
                      const has = g.assessmentScheme.length > 0 || g.passCriteria.length > 0;
                      const expanded = open === g.subject.id;
                      const o = OUTCOME[g.outcome];
                      return (
                        <Fragment key={g.subject.id}>
                          <tr className={cn(expanded && 'is-selected', !has && 'no-expand')} onClick={() => has && setOpen(expanded ? null : g.subject.id)} aria-expanded={has ? expanded : undefined}>
                            <td>{has && <ChevronRight className={cn('ic chev', expanded && 'is-open')} />}</td>
                            <td>
                              <span className="cell-title">
                                <b className="ug-code">{g.subject.code}</b> {g.subject.nameVi}
                              </span>
                            </td>
                            <td className="num">{g.subject.credits}</td>
                            <td className="num">
                              <b>{g.inProgress || g.score10 === null ? '—' : fmt(g.score10)}</b>
                            </td>
                            <td className="num">{g.letter ?? '—'}</td>
                            <td className="num">{g.gpa4 !== null ? g.gpa4.toFixed(1) : '—'}</td>
                            <td>
                              <span className={cn('ug-out', `t-${o.tone}`)}>{o.label}</span>
                            </td>
                            <td className="w-date">{fmtDate(g.updatedAt)}</td>
                          </tr>
                          {expanded && (
                            <tr className="tl-row">
                              <td colSpan={8}>
                                <GradeBreakdown g={g} passMark={data.passMark} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
    </>
  );
}
