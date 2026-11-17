import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Info, RotateCcw, Save, Target } from 'lucide-react';
import { computeGpa, criteriaBlockPass, gradeBandFor, GRADE_SCALE, requiredAverage, type GradeEntryInput } from '@kaned/shared';
import { CountUp } from '@/components/ui/CountUp';
import { PageHead } from '@/components/ui/Panel';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { useCurriculum } from '@/features/catalog/queries';
import { isInvalidScore, parseScore, useGradeDraft } from '@/features/grades/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const tone = (gpa4: number) => (gpa4 >= 3.5 ? 'g-hi' : gpa4 >= 2 ? 'g-mid' : 'g-lo');

export function GpaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const grades = useGradeDraft();
  const { data: curriculum, isLoading } = useCurriculum(user?.majorId ?? undefined);
  const [onlyGraded, setOnlyGraded] = useState(false);
  const [target, setTarget] = useState('3.2');
  const [planned, setPlanned] = useState('15');

  const subjects = curriculum?.subjects ?? [];
  const passMark = curriculum?.major.passMark ?? 5;

  const entries = useMemo<GradeEntryInput[]>(
    () =>
      subjects
        .map((s) => {
          const e = grades.draft[s.id];
          const score = e && !e.inProgress ? parseScore(e.score) : null;
          return { subjectId: s.id, subjectCode: s.code, subjectName: s.nameVi, credits: s.credits, score10: score, termNo: s.termNo, criteriaMet: !criteriaBlockPass(s.passCriteria, score, e?.criteria, s.assessmentScheme) };
        })
        .filter((e) => e.score10 !== null),
    [subjects, grades.draft],
  );
  const summary = useMemo(() => computeGpa(entries, passMark), [entries, passMark]);

  const t = Number(target.replace(',', '.'));
  const p = Number(planned);
  const need = Number.isFinite(t) && p > 0 ? requiredAverage(summary, p, t) : null;

  const terms = useMemo(() => {
    const map = new Map<number, typeof subjects>();
    for (const s of subjects) {
      const k = s.termNo ?? 0;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => (a || 99) - (b || 99));
  }, [subjects]);

  const termGpa = new Map(summary.byTerm.map((x) => [x.termNo, x]));
  const maxLetters = Math.max(1, ...Object.values(summary.letterCounts));

  const save = async () => {
    try {
      await grades.commit((id) => subjects.find((s) => s.id === id)?.termNo ?? null);
      toast.success('Đã lưu điểm', 'Trang Môn học và Tổng quan đã cập nhật.');
    } catch (e) {
      toast.error('Không lưu được', toApiError(e).message);
    }
  };

  const exportCsv = () => {
    const head = 'Kỳ,Mã môn,Tên môn,Tín chỉ,Điểm hệ 10,Điểm chữ,Điểm hệ 4\n';
    const rows = entries
      .map((e) => {
        const b = gradeBandFor(e.score10!);
        return [e.termNo ?? '', e.subjectCode, `"${e.subjectName}"`, e.credits, e.score10, b.letter, b.gpa4].join(',');
      })
      .join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + head + rows], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kaned-bang-diem.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user?.majorId) {
    return (
      <>
        <PageHead crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Tính GPA' }]} title="Tính GPA" />
        <div className="container">
          <EmptyState
            title="Chọn ngành trong hồ sơ trước"
            description="Bảng điểm dựng theo chương trình học của ngành bạn, nên cần biết bạn học ngành nào."
            action={
              <Link to="/app/profile" className="btn btn-primary">
                Cập nhật hồ sơ
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Công cụ' }, { label: 'Tính GPA' }]}
        title="Tính GPA"
        description="Nhập điểm hệ 10 cho từng môn. Kaned quy đổi sang điểm chữ và hệ 4, tính GPA theo tín chỉ, và cho biết kỳ tới cần bao nhiêu để chạm mục tiêu."
        actions={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!entries.length}>
              <Download className="ic ic-sm" />
              Xuất CSV
            </button>
            <button type="button" className={cn('btn btn-primary btn-sm', grades.saving && 'is-loading')} onClick={save} disabled={!grades.changed}>
              <Save className="ic ic-sm" />
              Lưu điểm
            </button>
          </>
        }
      >
        <div className="gpa-hero">
          <div className="gpa-main">
            <span className="sw-stat-l">GPA tích luỹ</span>
            <div className="gpa-figure">
              <b>{summary.gradedCount ? <CountUp value={summary.gpa4} decimals={2} /> : '—'}</b>
              <span>/ 4.0</span>
            </div>
            <p>
              {summary.gradedCount ? (
                <>
                  Xếp loại <span className="badge badge-violet">{summary.classification.vi}</span> · điểm TB hệ 10{' '}
                  <b><CountUp value={summary.gpa10} decimals={2} /></b>
                </>
              ) : (
                'Nhập điểm bên dưới để bắt đầu.'
              )}
            </p>
          </div>
          <div className="gpa-mini">
            <div>
              <span className="sw-stat-l">Tín chỉ đã qua</span>
              <b>{summary.earnedCredits}</b>
              <span className="sw-stat-s">trên {summary.totalCredits} tín chỉ có điểm</span>
            </div>
            <div>
              <span className="sw-stat-l">Môn đã có điểm</span>
              <b>{summary.gradedCount}</b>
              <span className="sw-stat-s">
                {summary.failedCount ? `${summary.failedCount} môn chưa qua` : 'chưa trượt môn nào'}
              </span>
            </div>
            <div className="gpa-letters" aria-label="Phân bố điểm chữ">
              <span className="sw-stat-l">Phân bố điểm chữ</span>
              <div className="gpa-bars">
                {GRADE_SCALE.map((g) => {
                  const n = summary.letterCounts[g.letter] ?? 0;
                  return (
                    <span key={g.letter} title={`${g.letter}: ${n} môn`}>
                      <i style={{ height: `${Math.max(4, (n / maxLetters) * 100)}%` }} className={n ? tone(g.gpa4) : undefined} />
                      <em>{g.letter}</em>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </PageHead>

      <div className="container gpa-layout">
        <section className="panel gpa-table" aria-label="Bảng điểm">
          <div className="panel-head">
            <div>
              <h2 className="t-h4">Bảng điểm theo chương trình</h2>
              <p className="t-small">{curriculum?.major.nameVi} · điểm đạt {passMark.toFixed(1)}</p>
            </div>
            <label className="check">
              <input type="checkbox" checked={onlyGraded} onChange={(e) => setOnlyGraded(e.target.checked)} />
              <span className="box">
                <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="check-l">Chỉ môn đã có điểm</span>
            </label>
          </div>

          {isLoading || !grades.ready ? (
            <div style={{ padding: 22 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} style={{ height: 36, marginTop: i ? 8 : 0 }} />
              ))}
            </div>
          ) : (
            terms.map(([term, list]) => {
              const rows = onlyGraded ? list.filter((s) => parseScore(grades.draft[s.id]?.score ?? '') !== null) : list;
              if (!rows.length) return null;
              const tg = termGpa.get(term);
              return (
                <div key={term} className="gpa-term">
                  <div className="gpa-term-head">
                    <h3>{term ? `Kỳ ${term}` : 'Tự chọn'}</h3>
                    {tg ? (
                      <span>
                        GPA kỳ <b className={tone(tg.gpa4)}>{tg.gpa4.toFixed(2)}</b> · {tg.credits} TC
                      </span>
                    ) : (
                      <span>chưa có điểm</span>
                    )}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Môn</th>
                        <th className="num">TC</th>
                        <th className="num">Điểm 10</th>
                        <th className="num">Chữ</th>
                        <th className="num">Hệ 4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => {
                        const e = grades.draft[s.id];
                        const score = e && !e.inProgress ? parseScore(e.score) : null;
                        const band = score !== null ? gradeBandFor(score) : null;
                        const invalid = e ? isInvalidScore(e.score) : false;
                        return (
                          <tr key={s.id} className={cn(score !== null && score < passMark && 'is-fail')}>
                            <td>
                              <Link to={`/app/subjects/${s.code}`} className="gpa-code">
                                {s.code}
                              </Link>
                              <span className="gpa-name">{s.nameVi}</span>
                            </td>
                            <td className="num">{s.credits}</td>
                            <td className="num">
                              <input
                                className={cn('sw-score', invalid && 'invalid', e?.inProgress && 'is-progress')}
                                inputMode="decimal"
                                placeholder={e?.inProgress ? 'học' : '—'}
                                disabled={e?.inProgress}
                                value={e?.inProgress ? '' : (e?.score ?? '')}
                                onChange={(ev) => grades.setEntry(s.id, { score: ev.target.value, termNo: s.termNo })}
                                onFocus={(ev) => ev.currentTarget.select()}
                                aria-label={`Điểm ${s.code}`}
                              />
                            </td>
                            <td className="num">{band ? <span className={cn('gpa-letter', tone(band.gpa4))}>{band.letter}</span> : <span className="muted">—</span>}</td>
                            <td className="num">{band ? band.gpa4.toFixed(1) : <span className="muted">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </section>

        <aside className="gpa-side">
          <section className="panel panel-pad">
            <h2 className="t-h4 gpa-side-h">
              <Target className="ic ic-sm" />
              Cần bao nhiêu để đạt mục tiêu
            </h2>
            <div className="gpa-goal">
              <label className="field">
                <span className="label">GPA mục tiêu</span>
                <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Tín chỉ kỳ tới</span>
                <input className="input" inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value)} />
              </label>
            </div>
            <div className="gpa-need">
              {!need ? (
                <p>Nhập mục tiêu và số tín chỉ để xem mức điểm cần đạt.</p>
              ) : need.needed <= 0 ? (
                <p className="is-ok">Bạn đã vượt mục tiêu — giữ phong độ là đủ.</p>
              ) : !need.reachable ? (
                <p className="is-bad">Không thể chạm mục tiêu chỉ trong một kỳ {p} tín chỉ. Giãn ra nhiều kỳ hoặc đăng ký nhiều tín chỉ hơn.</p>
              ) : (
                <>
                  <span className="sw-stat-l">GPA hệ 4 trung bình cần đạt kỳ tới</span>
                  <b>{need.needed.toFixed(2)}</b>
                  <p>
                    Tương đương khoảng{' '}
                    {need.needed >= 3.75 ? 'toàn A' : need.needed >= 3.25 ? 'A và B+' : need.needed >= 2.75 ? 'B+ và B' : need.needed >= 2.25 ? 'B và C+' : 'C trở lên'} cho {p} tín chỉ.
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="panel panel-pad">
            <h2 className="t-h4 gpa-side-h">Thang quy đổi</h2>
            <table className="gpa-scale">
              <thead>
                <tr>
                  <th>Hệ 10</th>
                  <th>Chữ</th>
                  <th className="num">Hệ 4</th>
                </tr>
              </thead>
              <tbody>
                {GRADE_SCALE.map((g) => (
                  <tr key={g.letter}>
                    <td className="num-l">{g.min === 0 ? '< 4.0' : `≥ ${g.min.toFixed(1)}`}</td>
                    <td>
                      <span className={cn('gpa-letter', tone(g.gpa4))}>{g.letter}</span>
                    </td>
                    <td className="num">{g.gpa4.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="gpa-fine">
              <Info className="ic ic-xs" />
              Thang phổ biến ở các trường Việt Nam. Trường bạn có thể khác, hãy đối chiếu quy chế trước khi dùng cho hồ sơ.
            </p>
          </section>
        </aside>
      </div>

      <div className={cn('sw-savebar', grades.changed > 0 && 'show')} role="status" aria-live="polite">
        <div className="sw-savebar-in">
          <span className={cn('sw-dot-live', grades.invalid.length > 0 && 'is-bad')} />
          <p>
            {grades.invalid.length > 0 ? (
              <>
                <b>{grades.invalid.length} ô điểm không hợp lệ.</b> Điểm phải từ 0 đến 10 — sửa các ô đỏ rồi lưu.
              </>
            ) : (
              <>
                <b>{grades.changed} thay đổi chưa lưu.</b> GPA ở trên đã tính theo điểm bạn vừa nhập.
              </>
            )}
          </p>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={grades.reset}>
            <RotateCcw className="ic ic-sm" />
            Hoàn tác
          </button>
          <button type="button" className={cn('btn btn-primary btn-sm', grades.saving && 'is-loading')} onClick={save} disabled={grades.invalid.length > 0}>
            <Save className="ic ic-sm" />
            Lưu điểm
          </button>
        </div>
      </div>
    </>
  );
}
