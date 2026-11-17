import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Columns3, GraduationCap, Info, Lightbulb, ListTree, RotateCcw, Save, Search } from 'lucide-react';
import {
  evaluatePlan,
  suggestNextTerm,
  type PlannerSubject,
  type SubjectStatus,
} from '@kaned/shared';
import { PageHead } from '@/components/ui/Panel';
import { EmptyState, ErrorState, Skeleton, Progress } from '@/components/ui/Feedback';
import { useCurriculum, useMajors } from '@/features/catalog/queries';
import { isInvalidScore, parseScore, useGradeDraft } from '@/features/grades/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { SubjectDetail } from './SubjectDetail';
import { KanbanBoard } from './KanbanBoard';
import { STATUS, STATUS_ORDER } from './status';

type Filter = 'all' | SubjectStatus;
type View = 'list' | 'kanban';

const VIEW_KEY = 'kaned.subjects.view';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'kanban' ? 'kanban' : 'list';
  } catch {
    return 'list';
  }
};

/** Lộ trình (term by term) or Kanban (by status); remembered per browser. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="seg view-switch" role="group" aria-label="Kiểu xem">
      <button type="button" aria-pressed={view === 'list'} onClick={() => onChange('list')}>
        <ListTree className="ic ic-sm" />
        Lộ trình
      </button>
      <button type="button" aria-pressed={view === 'kanban'} onClick={() => onChange('kanban')}>
        <Columns3 className="ic ic-sm" />
        Kanban
      </button>
    </div>
  );
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function SubjectsWorkspace() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [majorId, setMajorId] = useState(user?.majorId ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    setMobileOpen(false);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };
  const detailRef = useRef<HTMLDivElement>(null);

  const { data: majors = [] } = useMajors(user?.universityId ?? undefined);
  const { data: curriculum, isLoading, isError, refetch } = useCurriculum(majorId || undefined);
  const criteriaById = useMemo(() => new Map((curriculum?.subjects ?? []).map((s) => [s.id, s.passCriteria])), [curriculum]);
  const criteriaFor = useCallback((id: string) => criteriaById.get(id), [criteriaById]);
  const grades = useGradeDraft(criteriaFor);

  const passMark = curriculum?.major.passMark ?? 5;
  const subjects = curriculum?.subjects ?? [];

  // The planner runs on every keystroke, entirely in the browser.
  const summary = useMemo(() => {
    const list: PlannerSubject[] = subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      nameVi: s.nameVi,
      credits: s.credits,
      termNo: s.termNo,
      isRequired: s.isRequired,
      choiceGroup: s.choiceGroup,
      requirements: s.requirements,
    }));
    return evaluatePlan(list, grades.plannerGrades, { passMark });
  }, [subjects, grades.plannerGrades, passMark]);

  const suggestion = useMemo(() => suggestNextTerm(summary), [summary]);
  const resultById = useMemo(() => new Map(summary.results.map((r) => [r.subjectId, r])), [summary]);
  const statusByCode = useMemo(() => new Map(summary.results.map((r) => [r.code, r.status])), [summary]);
  const byCode = useMemo(() => new Map(subjects.map((s) => [s.code.toUpperCase(), s])), [subjects]);

  // The selected subject comes from the URL; with none, start at the first thing worth doing.
  const selected =
    (codeParam && byCode.get(codeParam.toUpperCase())) ||
    subjects.find((s) => resultById.get(s.id)?.status === 'available') ||
    subjects[0];

  const pick = (code: string) => {
    if (!byCode.has(code.toUpperCase())) return;
    navigate(`/app/subjects/${code}`, { replace: Boolean(codeParam) });
    setMobileOpen(true);
    detailRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!grades.changed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [grades.changed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', mobileOpen && (view === 'kanban' || window.innerWidth <= 1000));
  }, [mobileOpen, view]);

  const save = async () => {
    try {
      await grades.commit((id) => subjects.find((s) => s.id === id)?.termNo ?? null);
      toast.success('Đã lưu điểm', 'Bảng GPA và tổng quan đã cập nhật theo điểm mới.');
    } catch (e) {
      toast.error('Không lưu được điểm', toApiError(e).message);
    }
  };

  /** Later subjects a below-pass score still satisfies, because they only ask for ≥ 4. */
  const softUnlocks = (code: string, score: number | null) => {
    if (score === null || score >= passMark) return [];
    return subjects
      .filter((s) =>
        s.requirements.some((r) => r.kind === 'subject' && r.codes.includes(code) && typeof r.min === 'number' && score >= r.min),
      )
      .map((s) => s.code);
  };

  const terms = useMemo(() => {
    const map = new Map<number, typeof subjects>();
    for (const s of subjects) {
      const t = s.termNo ?? 0;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => (a || 99) - (b || 99));
  }, [subjects]);

  const counts = {
    all: summary.results.length,
    available: summary.available.length,
    blocked: summary.blocked.length,
    failed: summary.failed.length,
    in_progress: summary.inProgress.length,
    passed: summary.passed.length,
  };

  const matches = (s: (typeof subjects)[number]) => {
    const r = resultById.get(s.id);
    if (filter !== 'all' && r?.status !== filter) return false;
    if (!query) return true;
    return fold(`${s.code} ${s.name} ${s.nameVi}`).includes(fold(query));
  };

  /* ───────────────────────── states ───────────────────────── */

  if (!majorId) {
    return (
      <>
        <PageHead crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Môn học' }]} title="Môn học & điều kiện" />
        <div className="container">
          <EmptyState
            title="Chọn ngành để xem chương trình học"
            description="Chương trình học quyết định thứ tự môn và điều kiện tiên quyết. Bạn có thể lưu ngành vào hồ sơ để lần sau khỏi chọn."
            art={
              <span className="confirm-ic">
                <GraduationCap className="ic ic-lg" />
              </span>
            }
            action={
              <select className="select" style={{ maxWidth: 360 }} value={majorId} onChange={(e) => setMajorId(e.target.value)}>
                <option value="">Chọn ngành</option>
                {majors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nameVi} — {m.name}
                  </option>
                ))}
              </select>
            }
          />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <div className="container nf">
        <ErrorState title="Không tải được chương trình học" onRetry={() => refetch()} />
      </div>
    );
  }

  const selectedResult = selected ? resultById.get(selected.id) : undefined;
  const selectedEntry = selected ? grades.draft[selected.id] : undefined;

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Môn học' }]}
        title="Môn học & điều kiện"
        description={
          curriculum
            ? `${curriculum.major.nameVi} — ${subjects.length} môn, ${summary.totalCredits} tín chỉ. Nhập điểm vào từng môn để biết kỳ tới học được gì và môn nào đang bị chặn.`
            : 'Đang tải chương trình học…'
        }
        actions={
          majors.length > 1 ? (
            <select className="select select-sm" value={majorId} onChange={(e) => setMajorId(e.target.value)} aria-label="Ngành">
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameVi}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        <div className="sw-stats">
          <div className="sw-stat sw-progress">
            <span className="sw-stat-l">Tiến độ chương trình</span>
            <b>
              {summary.progressPercent}
              <small>%</small>
            </b>
            <Progress value={summary.progressPercent} tone="green" />
            <span className="sw-stat-s">
              {summary.earnedCredits}/{summary.totalCredits} tín chỉ đã qua
            </span>
          </div>
          {(['available', 'blocked', 'failed', 'in_progress'] as const).map((st) => {
            const S = STATUS[st];
            return (
              <button
                key={st}
                type="button"
                className={cn('sw-stat sw-stat-btn', `st-${st}`, filter === st && 'on')}
                onClick={() => setFilter(filter === st ? 'all' : st)}
                aria-pressed={filter === st}
              >
                <span className="sw-stat-l">
                  <S.icon className="ic ic-xs" />
                  {S.label}
                </span>
                <b>{counts[st]}</b>
                <span className="sw-stat-s">{S.hint}</span>
              </button>
            );
          })}
        </div>
      </PageHead>

      {view === 'kanban' ? (
        <div className="container kb-wrap">
          <div className="kb-toolbar">
            <ViewSwitch view={view} onChange={setView} />
            <div className="input-group">
              <Search className="ic ic-sm" />
              <input className="input input-sm" type="search" placeholder="Tìm mã môn hoặc tên môn" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm môn" />
            </div>
            {suggestion.length > 0 && (
              <p className="kb-suggest">
                <Lightbulb className="ic ic-sm" />
                Gợi ý kỳ tới:
                {suggestion.map((s) => (
                  <button key={s.subjectId} type="button" className={cn('unlock', `st-${s.status}`)} onClick={() => pick(s.code)}>
                    {s.code}
                  </button>
                ))}
              </p>
            )}
          </div>
          {isLoading || !grades.ready ? (
            <div className="kb">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="kb-col">
                  <Skeleton style={{ height: 16, width: 110, margin: '4px 4px 12px' }} />
                  {Array.from({ length: 3 }, (_, j) => (
                    <Skeleton key={j} style={{ height: 92, marginBottom: 8, borderRadius: 12 }} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <KanbanBoard
              subjects={subjects}
              resultById={resultById}
              draft={grades.draft}
              statusByCode={statusByCode}
              visible={(s) => !query || fold(`${s.code} ${s.name} ${s.nameVi}`).includes(fold(query))}
              selectedId={mobileOpen ? selected?.id : undefined}
              onOpen={pick}
              onStart={(s) => {
                grades.setEntry(s.id, { inProgress: true, termNo: s.termNo });
                toast.info(`${s.code} → Đang học`, 'Nhớ bấm “Lưu điểm” ở thanh dưới để giữ thay đổi.');
              }}
              onStop={(s) => grades.setEntry(s.id, { inProgress: false, termNo: s.termNo })}
              onNeedScore={(s) => {
                grades.setEntry(s.id, { inProgress: false, termNo: s.termNo });
                pick(s.code);
                window.setTimeout(() => document.getElementById('sd-score')?.focus(), 380);
              }}
            />
          )}
          <p className="sw-note">
            <Info className="ic ic-xs" />
            Kéo thẻ giữa “Học được” và “Đang học”; thả vào “Đã qua” hoặc “Chưa qua” để nhập điểm. Cột do điểm và điều kiện tiên quyết quyết định.
          </p>
          <div className={cn('kb-drawer', mobileOpen && 'open')} ref={detailRef} aria-hidden={!mobileOpen}>
            {mobileOpen && selected && selectedResult && (
              <SubjectDetail
                key={selected.id}
                subject={selected}
                result={selectedResult}
                entry={selectedEntry}
                passMark={passMark}
                statusByCode={statusByCode}
                softUnlocks={softUnlocks(selected.code, parseScore(selectedEntry?.score ?? ''))}
                onScore={(v) => grades.setEntry(selected.id, { score: v, termNo: selected.termNo })}
                onInProgress={(v) => grades.setEntry(selected.id, { inProgress: v, termNo: selected.termNo })}
                onCriteria={(criteria) => grades.setEntry(selected.id, { criteria, termNo: selected.termNo })}
                onPick={pick}
                onClose={() => setMobileOpen(false)}
              />
            )}
          </div>
          <div className={cn('kb-scrim', mobileOpen && 'open')} onClick={() => setMobileOpen(false)} />
        </div>
      ) : (
      <div className="container sw-layout">
        {/* ───────────── curriculum ───────────── */}
        <section className="panel sw-list" aria-label="Lộ trình">
          <div className="sw-toolbar">
            <ViewSwitch view={view} onChange={setView} />
            <div className="input-group">
              <Search className="ic ic-sm" />
              <input
                className="input input-sm"
                type="search"
                placeholder="Tìm mã môn hoặc tên môn"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Tìm môn"
              />
            </div>
            <div className="pills sw-filters" role="group" aria-label="Lọc theo trạng thái">
              {(['all', ...STATUS_ORDER] as Filter[]).map((f) => (
                <button key={f} type="button" className="pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'Tất cả' : STATUS[f].label}
                  <span className="count">{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>

          {suggestion.length > 0 && filter === 'all' && !query && (
            <div className="sw-suggest">
              <p>
                <Lightbulb className="ic ic-sm" />
                <b>Gợi ý kỳ tới</b>
                <span>{suggestion.reduce((n, s) => n + s.credits, 0)} tín chỉ</span>
              </p>
              <div className="sw-suggest-list">
                {suggestion.map((s) => (
                  <button key={s.subjectId} type="button" className={cn('unlock', `st-${s.status}`)} onClick={() => pick(s.code)}>
                    {s.code}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoading || !grades.ready ? (
            <div className="sw-terms">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="sw-term">
                  <Skeleton style={{ height: 14, width: 120, margin: '14px 16px' }} />
                  {Array.from({ length: 5 }, (_, j) => (
                    <Skeleton key={j} style={{ height: 44, margin: '6px 12px' }} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="sw-terms">
              {terms.map(([term, list]) => {
                const visible = list.filter(matches);
                if (!visible.length) return null;
                const credits = list.filter((s) => !s.choiceGroup).reduce((n, s) => n + s.credits, 0) + (list.some((s) => s.choiceGroup) ? Math.max(...list.filter((s) => s.choiceGroup).map((s) => s.credits)) : 0);
                const done = list.filter((s) => resultById.get(s.id)?.status === 'passed').reduce((n, s) => n + s.credits, 0);
                return (
                  <div key={term} className="sw-term">
                    <div className="sw-term-head">
                      <h3>{term ? `Kỳ ${term}` : 'Tự chọn'}</h3>
                      <span>
                        {list.length} môn · {credits} TC
                      </span>
                      <span className="sw-term-bar">
                        <i style={{ width: `${credits ? Math.min(100, Math.round((done / credits) * 100)) : 0}%` }} />
                      </span>
                    </div>
                    <ul>
                      {visible.map((s) => {
                        const r = resultById.get(s.id)!;
                        const S = STATUS[r.status];
                        const entry = grades.draft[s.id];
                        const invalid = entry ? isInvalidScore(entry.score) : false;
                        const waiting = r.status === 'blocked'
                          ? r.checks.filter((c) => !c.ok).flatMap((c) => (c.codes.length ? c.codes.filter((x) => statusByCode.get(x) !== 'passed').slice(0, 2) : [])).slice(0, 3)
                          : [];
                        const debt = r.status === 'blocked' && r.checks.some((c) => !c.ok && !c.codes.length);
                        return (
                          <li key={s.id} className={cn('sw-row', `st-${r.status}`, selected?.id === s.id && 'on')}>
                            <button type="button" className="sw-row-main" onClick={() => pick(s.code)} aria-current={selected?.id === s.id ? 'true' : undefined}>
                              <span className="sw-dot" title={S.label}>
                                <S.icon className="ic ic-xs" />
                              </span>
                              <span className="sw-row-text">
                                <span className="sw-row-top">
                                  <b>{s.code}</b>
                                  <span className="sw-cr">{s.credits} TC</span>
                                  {s.choiceGroup && <span className="sw-tag">chọn 1</span>}
                                </span>
                                <span className="sw-name">{s.nameVi}</span>
                                {(waiting.length > 0 || debt) && (
                                  <span className="sw-wait">
                                    Chờ {[...new Set(waiting)].join(', ')}
                                    {debt && (waiting.length ? ' + điều kiện nợ môn' : 'điều kiện nợ môn')}
                                  </span>
                                )}
                              </span>
                            </button>
                            <input
                              className={cn('sw-score', invalid && 'invalid', entry?.inProgress && 'is-progress')}
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder={entry?.inProgress ? 'học' : '—'}
                              disabled={entry?.inProgress}
                              value={entry?.inProgress ? '' : (entry?.score ?? '')}
                              onChange={(e) => grades.setEntry(s.id, { score: e.target.value, termNo: s.termNo })}
                              onFocus={(e) => {
                                e.currentTarget.select();
                                if (selected?.id !== s.id) navigate(`/app/subjects/${s.code}`, { replace: true });
                              }}
                              aria-label={`Điểm ${s.code}`}
                              aria-invalid={invalid || undefined}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {terms.every(([, list]) => !list.some(matches)) && (
                <EmptyState compact title="Không có môn nào khớp" description="Thử từ khoá khác hoặc bỏ bộ lọc trạng thái." />
              )}
            </div>
          )}

          <p className="sw-note">
            <Info className="ic ic-xs" />
            Điểm đạt của chương trình là {passMark.toFixed(1)}. Kết quả chỉ để tham khảo — hãy đối chiếu với phòng đào tạo trước khi đăng ký.
          </p>
        </section>

        {/* ───────────── detail ───────────── */}
        <div className={cn('sw-detail', mobileOpen && 'open')} ref={detailRef}>
          {selected && selectedResult ? (
            <SubjectDetail
              key={selected.id}
              subject={selected}
              result={selectedResult}
              entry={selectedEntry}
              passMark={passMark}
              statusByCode={statusByCode}
              softUnlocks={softUnlocks(selected.code, parseScore(selectedEntry?.score ?? ''))}
              onScore={(v) => grades.setEntry(selected.id, { score: v, termNo: selected.termNo })}
              onInProgress={(v) => grades.setEntry(selected.id, { inProgress: v, termNo: selected.termNo })}
              onCriteria={(criteria) => grades.setEntry(selected.id, { criteria, termNo: selected.termNo })}
              onPick={pick}
              onClose={() => setMobileOpen(false)}
            />
          ) : (
            <div className="panel panel-pad">
              <Skeleton style={{ height: 24, width: '40%' }} />
              <Skeleton style={{ height: 32, width: '80%', marginTop: 14 }} />
              <Skeleton style={{ height: 120, marginTop: 20 }} />
            </div>
          )}
        </div>
        <div className={cn('sw-scrim', mobileOpen && 'open')} onClick={() => setMobileOpen(false)} />
      </div>
      )}

      {/* Unsaved changes */}
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
                <b>{grades.changed} thay đổi chưa lưu.</b> Kết quả ở trên đã tính theo điểm bạn vừa nhập.
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

      {/* Linked from the GPA tool too */}
      <div className="container sw-foot">
        <p className="t-small">
          Muốn xem GPA theo từng kỳ hay đặt mục tiêu điểm? <Link className="link" to="/app/tools/gpa">Mở công cụ Tính GPA</Link>
        </p>
      </div>
    </>
  );
}
