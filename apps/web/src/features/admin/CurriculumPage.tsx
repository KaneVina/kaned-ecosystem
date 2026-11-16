import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, BookPlus, CalendarMinus, CalendarPlus, GripVertical, Pencil, Plus, Route as RouteIcon, Trash2 } from 'lucide-react';
import {
  describeRequirement,
  requirementCodes,
  requirementSchema,
  type CurriculumSubjectDto,
  type Requirement,
} from '@kaned/shared';
import { EmptyState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  useAddToCurriculum,
  useCandidates,
  useCurriculumAdmin,
  useFacultiesAdmin,
  useMajorsAdmin,
  useRemoveFromCurriculum,
  useSaveMajor,
  useUniversitiesAdmin,
  useUpdateCurriculum,
} from './api';
import { AdminHead, ConfirmDialog, SearchBox, Sheet, useDebounced, type ConfirmState } from './ui';
import { MajorForm } from './forms';
import { SubjectForm } from './SubjectsPage';
import { RequirementList, type CodeOption } from './RequirementEditor';
import { useAdminCrumbs } from './AdminShell';

/** Heavier than this per term is worth a second look. */
const HEAVY_CREDITS = 20;

/* ───────────────────────────── entry sheet ───────────────────────────── */

function EntrySheet({
  majorId,
  entry,
  termCount,
  passMark,
  options,
  onClose,
}: {
  majorId: string;
  entry: CurriculumSubjectDto | null;
  termCount: number;
  passMark: number;
  options: CodeOption[];
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateCurriculum();
  const remove = useRemoveFromCurriculum();
  const [termNo, setTermNo] = useState<string>('');
  const [isRequired, setIsRequired] = useState(true);
  const [choiceGroup, setChoiceGroup] = useState('');
  const [rules, setRules] = useState<Requirement[]>([]);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  useEffect(() => {
    if (!entry) return;
    setTermNo(entry.termNo ? String(entry.termNo) : '');
    setIsRequired(entry.isRequired);
    setChoiceGroup(entry.choiceGroup ?? '');
    setRules(structuredClone(entry.requirements));
    setError('');
  }, [entry]);

  const save = async () => {
    for (const r of rules) {
      const parsed = requirementSchema.safeParse(r);
      if (!parsed.success) {
        setError(`“${describeRequirement(r, passMark)}”: ${parsed.error.issues[0]?.message ?? 'chưa đủ thông tin'}`);
        return;
      }
    }
    setError('');
    try {
      await update.mutateAsync({
        majorId,
        subjectId: entry!.id,
        input: { termNo: termNo ? Number(termNo) : null, isRequired, choiceGroup: choiceGroup || null, requirements: rules },
      });
      toast.success('Đã lưu', `${entry!.code}: ${rules.length} điều kiện`);
      onClose();
    } catch (e) {
      toast.error('Không lưu được', toApiError(e).message);
    }
  };

  return (
    <>
      <Sheet
        open={Boolean(entry)}
        onClose={onClose}
        size="lg"
        title={entry ? `${entry.code} · ${entry.nameVi}` : ''}
        description={entry ? `${entry.credits} tín chỉ. Điều kiện ở đây chỉ áp dụng trong chương trình này.` : undefined}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: 'var(--red)' }}
              onClick={() =>
                setConfirm({
                  title: `Bỏ ${entry?.code} khỏi chương trình?`,
                  body: 'Môn vẫn còn trong danh mục môn của trường. Điều kiện của môn trong chương trình này sẽ mất.',
                  confirmLabel: 'Bỏ khỏi chương trình',
                  run: () =>
                    remove.mutateAsync({ majorId, subjectId: entry!.id }).then(
                      () => {
                        toast.success('Đã bỏ khỏi chương trình', entry!.code);
                        onClose();
                      },
                      (e) => {
                        toast.error('Không bỏ được', toApiError(e).message);
                        throw e;
                      },
                    ),
                })
              }
            >
              <Trash2 className="ic ic-sm" />
              Bỏ khỏi chương trình
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Huỷ
            </button>
            <button type="button" className={cn('btn btn-primary', update.isPending && 'is-loading')} onClick={save} disabled={update.isPending}>
              Lưu
            </button>
          </>
        }
      >
        <section className="sheet-section">
          <h3>Vị trí trong chương trình</h3>
          <div className="form-grid form-grid-3">
            <Field label="Kỳ" htmlFor="e-term">
              <select id="e-term" className="select" value={termNo} onChange={(e) => setTermNo(e.target.value)}>
                <option value="">Chưa xếp kỳ</option>
                {Array.from({ length: termCount }, (_, i) => i + 1).map((t) => (
                  <option key={t} value={t}>
                    Kỳ {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Loại" htmlFor="e-req">
              <select id="e-req" className="select" value={isRequired ? 'req' : 'opt'} onChange={(e) => setIsRequired(e.target.value === 'req')}>
                <option value="req">Bắt buộc</option>
                <option value="opt">Tự chọn</option>
              </select>
            </Field>
            <Field label="Nhóm thay thế" htmlFor="e-group" optional hint="Các môn cùng nhóm: học một là đủ.">
              <input id="e-group" className="input" placeholder="graduation" value={choiceGroup} onChange={(e) => setChoiceGroup(e.target.value)} />
            </Field>
          </div>
        </section>
        <section className="sheet-section">
          <h3>Điều kiện để đăng ký môn</h3>
          <p>Tất cả điều kiện dưới đây phải thoả. Mã màu vàng là môn không có trong chương trình (thường là môn thay thế của khoá cũ).</p>
          <RequirementList value={rules} onChange={setRules} options={options.filter((o) => o.code !== entry?.code)} termCount={termCount} passMark={passMark} />
          {error && (
            <p className="error-text" style={{ display: 'flex' }} role="alert">
              {error}
            </p>
          )}
        </section>
      </Sheet>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

/* ───────────────────────────── add sheet ───────────────────────────── */

function AddSheet({ majorId, universityId, term, termCount, onClose }: { majorId: string; universityId: string; term: number | null | undefined; termCount: number; onClose: () => void }) {
  const toast = useToast();
  const open = term !== undefined;
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const [picked, setPicked] = useState<string[]>([]);
  const [termNo, setTermNo] = useState('');
  const [newSubject, setNewSubject] = useState(false);
  const { data: candidates = [], isFetching } = useCandidates(majorId, query, open);
  const add = useAddToCurriculum();

  useEffect(() => {
    if (open) {
      setQ('');
      setPicked([]);
      setTermNo(term ? String(term) : '');
    }
  }, [open, term]);

  const submit = async () => {
    try {
      for (const subjectId of picked) {
        await add.mutateAsync({ majorId, input: { subjectId, termNo: termNo ? Number(termNo) : null, isRequired: true, choiceGroup: null, requirements: [] } });
      }
      toast.success(`Đã thêm ${picked.length} môn`, termNo ? `vào kỳ ${termNo}` : 'chưa xếp kỳ');
      onClose();
    } catch (e) {
      toast.error('Không thêm được', toApiError(e).message);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Thêm môn vào chương trình"
        description="Chọn từ các môn của trường chưa có trong chương trình, hoặc tạo môn mới."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setNewSubject(true)}>
              <BookPlus className="ic ic-sm" />
              Tạo môn mới
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Huỷ
            </button>
            <button type="button" className={cn('btn btn-primary', add.isPending && 'is-loading')} disabled={!picked.length || add.isPending} onClick={submit}>
              Thêm {picked.length || ''} môn
            </button>
          </>
        }
      >
        <section className="sheet-section">
          <div className="form-grid">
            <Field label="Xếp vào kỳ" htmlFor="a-term">
              <select id="a-term" className="select" value={termNo} onChange={(e) => setTermNo(e.target.value)}>
                <option value="">Chưa xếp kỳ</option>
                {Array.from({ length: termCount }, (_, i) => i + 1).map((t) => (
                  <option key={t} value={t}>
                    Kỳ {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tìm môn" htmlFor="a-q">
              <SearchBox value={q} onChange={setQ} placeholder="Mã hoặc tên môn" />
            </Field>
          </div>
          <div className="cand-list" aria-busy={isFetching}>
            {candidates.length === 0 && !isFetching ? (
              <EmptyState
                title={query ? 'Không có môn khớp' : 'Mọi môn của trường đã có trong chương trình'}
                description="Tạo môn mới, nó sẽ hiện ngay trong danh sách này."
              />
            ) : (
              candidates.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button key={s.id} type="button" className="cand" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}>
                    <div>
                      <span className="cell-title">
                        <span className="cell-code">{s.code}</span> · {s.nameVi}
                      </span>
                      <span className="cell-sub">{s.credits} tín chỉ</span>
                    </div>
                    {on && <span className="badge badge-violet">Đã chọn</span>}
                  </button>
                );
              })
            )}
          </div>
        </section>
      </Sheet>
      <SubjectForm open={newSubject} universityId={universityId} onClose={() => setNewSubject(false)} />
    </>
  );
}

/* ───────────────────────────── board ───────────────────────────── */

function RuleChips({ entry, known, passMark }: { entry: CurriculumSubjectDto; known: Set<string>; passMark: number }) {
  if (!entry.requirements.length) return <span className="cb-none">Không có điều kiện</span>;
  const shown = entry.requirements.slice(0, 3);
  return (
    <div className="cb-reqs">
      {shown.map((r, i) => {
        const unknown = requirementCodes(r).some((c) => !known.has(c));
        const text = r.kind === 'subject' ? `${r.codes.join('/')} ${r.min === 'pass' ? 'qua' : `≥${r.min}`}` : describeRequirement(r, passMark);
        return (
          <span key={i} className={cn('cb-req', r.kind !== 'subject' && 'is-group', unknown && r.kind === 'subject' && 'is-warn')} title={describeRequirement(r, passMark)}>
            <span>{text}</span>
          </span>
        );
      })}
      {entry.requirements.length > 3 && <span className="cb-req is-group">+{entry.requirements.length - 3}</span>}
    </div>
  );
}

function MajorPicker() {
  const { data: majors = [], isLoading } = useMajorsAdmin();
  const { data: universities = [] } = useUniversitiesAdmin();
  const byUni = universities.map((u) => ({ u, majors: majors.filter((m) => m.faculty?.universityId === u.id) })).filter((g) => g.majors.length);

  return (
    <>
      <AdminHead
        title="Chương trình đào tạo"
        description="Chọn một ngành để xếp môn theo kỳ và đặt điều kiện tiên quyết. Đây là dữ liệu trang Môn học & điều kiện của sinh viên dùng để tính môn nào học được."
      />
      {isLoading ? (
        <div className="skel" style={{ height: 200, borderRadius: 14 }} />
      ) : !byUni.length ? (
        <EmptyState
          title="Chưa có ngành nào"
          description="Thêm trường, khoa và ngành trước, rồi quay lại đây để xếp chương trình."
          action={
            <Link to="/admin/universities" className="btn btn-primary">
              Mở Trường học
            </Link>
          }
        />
      ) : (
        byUni.map(({ u, majors: list }) => (
          <section key={u.id} className="adm-panel">
            <div className="adm-panel-head">
              <span className="adm-swatch" style={{ background: u.color }} />
              <h2>{u.nameVi}</h2>
            </div>
            <div className="major-rows" style={{ padding: 14 }}>
              {list.map((m) => (
                <Link key={m.id} to={`/admin/curriculum/${m.id}`} className="major-row">
                  <div>
                    <span className="cell-title">
                      <span className="cell-code">{m.code}</span> · {m.nameVi}
                    </span>
                    <span className="cell-sub">{m.faculty?.nameVi}</span>
                  </div>
                  <div className="major-meta">
                    <span>
                      <b>{m.termCount}</b> kỳ
                    </span>
                    <span>
                      <b>{m.subjectCount}</b> môn
                    </span>
                    <span>
                      <b>{m.plannedCredits}</b>/{m.totalCredits} TC
                    </span>
                  </div>
                  <ArrowRight className="ic ic-sm" style={{ color: 'var(--ink-3)' }} />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}

export function CurriculumPage() {
  const { majorId } = useParams();
  if (!majorId) return <MajorPickerPage />;
  return <Board key={majorId} majorId={majorId} />;
}

function MajorPickerPage() {
  useAdminCrumbs([{ label: 'Chương trình đào tạo' }]);
  return <MajorPicker />;
}

function Board({ majorId }: { majorId: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCurriculumAdmin(majorId);
  const { data: allMajors = [] } = useMajorsAdmin();
  const update = useUpdateCurriculum();
  const saveMajor = useSaveMajor();
  const major = allMajors.find((m) => m.id === majorId);
  const universityId = major?.faculty?.universityId ?? '';
  const { data: faculties = [] } = useFacultiesAdmin(universityId || undefined);
  const [editing, setEditing] = useState<CurriculumSubjectDto | null>(null);
  const [adding, setAdding] = useState<number | null | undefined>(undefined);
  const [majorForm, setMajorForm] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Moves show at once; the server's answer replaces them.
  const [moved, setMoved] = useState<Record<string, number | null>>({});
  useAdminCrumbs([{ label: 'Chương trình đào tạo', to: '/admin/curriculum' }, { label: major?.code ?? '…' }], [major?.code]);

  useEffect(() => setMoved({}), [data]);

  const termCount = major?.termCount ?? data?.major.termCount ?? 8;
  const passMark = major?.passMark ?? data?.major.passMark ?? 5;
  const subjects = useMemo(
    () => (data?.subjects ?? []).map((s) => (s.id in moved ? { ...s, termNo: moved[s.id] } : s)),
    [data, moved],
  );
  const known = useMemo(() => new Set(subjects.map((s) => s.code)), [subjects]);
  const options = useMemo<CodeOption[]>(() => subjects.map((s) => ({ code: s.code, name: s.nameVi })), [subjects]);
  const columns: Array<number | null> = [
    ...Array.from({ length: termCount }, (_, i) => i + 1),
    ...(subjects.some((s) => !s.termNo || s.termNo > termCount) ? [null] : []),
  ];
  const inColumn = (t: number | null) =>
    subjects.filter((s) => (t === null ? !s.termNo || s.termNo > termCount : s.termNo === t)).sort((a, b) => a.code.localeCompare(b.code));
  const credits = subjects.filter((s) => s.isRequired).reduce((n, s) => n + s.credits, 0);

  const drop = (t: number | null) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    const entry = subjects.find((s) => s.id === id);
    if (!entry || (entry.termNo ?? null) === t) return;
    setMoved((m) => ({ ...m, [entry.id]: t }));
    update.mutate(
      { majorId, subjectId: entry.id, input: { termNo: t } },
      {
        onSuccess: () => toast.success(`Đã chuyển ${entry.code}`, t ? `sang kỳ ${t}` : 'về chưa xếp kỳ'),
        onError: (err) => {
          setMoved(({ [entry.id]: _, ...rest }) => rest);
          toast.error('Không chuyển được', toApiError(err).message);
        },
      },
    );
  };

  const changeTerms = (delta: 1 | -1) => {
    const next = termCount + delta;
    saveMajor.mutate(
      { id: majorId, input: { termCount: next } },
      {
        onSuccess: () => toast.success(delta > 0 ? `Đã thêm kỳ ${next}` : `Đã bớt kỳ ${termCount}`),
        onError: (e) => toast.error('Không đổi được số kỳ', toApiError(e).message),
      },
    );
  };

  if (isError) return <EmptyState title="Không tìm thấy ngành" description="Ngành này có thể đã bị xoá." action={<Link to="/admin/curriculum" className="btn btn-secondary">Chọn ngành khác</Link>} />;

  return (
    <>
      <AdminHead
        title={major ? `${major.code} · ${major.nameVi}` : 'Chương trình đào tạo'}
        description={
          <span className="cb-summary">
            <span>
              <b>{subjects.length}</b> môn
            </span>
            <span>
              <b>{credits}</b>/{major?.totalCredits ?? '–'} tín chỉ bắt buộc
            </span>
            <span>
              Qua môn ≥ <b>{passMark.toFixed(1)}</b>
            </span>
            <span>
              <b>{termCount}</b> kỳ
            </span>
          </span>
        }
        actions={
          <>
            <select className="select" style={{ width: 'auto', height: 36, fontSize: 13.5 }} value={majorId} onChange={(e) => navigate(`/admin/curriculum/${e.target.value}`)} aria-label="Đổi ngành">
              {allMajors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.nameVi}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMajorForm(true)} disabled={!major}>
              <Pencil className="ic ic-sm" />
              Sửa ngành
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(null)}>
              <Plus className="ic ic-sm" />
              Thêm môn
            </button>
          </>
        }
      />

      <div className="cb-pick">
        <span className="cb-hint">
          <GripVertical className="ic ic-xs" />
          Kéo thẻ môn sang kỳ khác để đổi kỳ. Bấm vào thẻ để sửa điều kiện.
        </span>
        <span className="cb-legend">
          <span>
            <span className="cb-req">PRO192 qua</span> môn tiên quyết
          </span>
          <span>
            <span className="cb-req is-group">nhóm</span> điều kiện nhóm
          </span>
          <span>
            <span className="cb-req is-warn">mã</span> ngoài chương trình
          </span>
        </span>
      </div>

      {isLoading ? (
        <div className="cb-board">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skel" style={{ height: 360, borderRadius: 14 }} />
          ))}
        </div>
      ) : (
        <div className="cb-board">
          {columns.map((t) => {
            const list = inColumn(t);
            const sum = list.filter((s) => s.isRequired).reduce((n, s) => n + s.credits, 0);
            const key = t === null ? 'none' : String(t);
            return (
              <section
                key={key}
                className={cn('cb-col', over === key && 'is-over')}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (over !== key) setOver(key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={drop(t)}
                aria-label={t ? `Kỳ ${t}` : 'Chưa xếp kỳ'}
              >
                <header className="cb-col-head">
                  <h3>{t ? `Kỳ ${t}` : 'Chưa xếp kỳ'}</h3>
                  <span>{list.length} môn</span>
                  <span className={cn('cb-cr', sum > HEAVY_CREDITS && 'is-heavy')} title={sum > HEAVY_CREDITS ? 'Nhiều hơn 20 tín chỉ bắt buộc' : undefined}>
                    {sum} TC
                  </span>
                </header>
                <div className="cb-list">
                  {list.length === 0 ? (
                    <div className="cb-empty">Thả môn vào đây</div>
                  ) : (
                    list.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        draggable
                        className={cn('cb-card', !s.isRequired && 'is-elective', dragId === s.id && 'is-dragging')}
                        style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', s.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(s.id);
                        }}
                        onDragEnd={() => (setDragId(null), setOver(null))}
                        onClick={() => setEditing(data?.subjects.find((x) => x.id === s.id) ?? s)}
                      >
                        <span className="cb-card-top">
                          <span className="cell-code">{s.code}</span>
                          {s.choiceGroup && <span className="badge badge-blue" style={{ height: 20, fontSize: 11 }}>{s.choiceGroup}</span>}
                          {!s.isRequired && !s.choiceGroup && <span className="badge badge-gray" style={{ height: 20, fontSize: 11 }}>Tự chọn</span>}
                          <span className="cb-credits">{s.credits} TC</span>
                        </span>
                        <span className="cb-name">{s.nameVi}</span>
                        <RuleChips entry={s} known={known} passMark={passMark} />
                      </button>
                    ))
                  )}
                </div>
                <button type="button" className="cb-add" onClick={() => setAdding(t)}>
                  <Plus className="ic ic-xs" />
                  Thêm môn
                </button>
              </section>
            );
          })}
          <div className="cb-col is-new" role="group" aria-label="Số kỳ">
            <button type="button" className="btn btn-soft" onClick={() => changeTerms(1)} disabled={saveMajor.isPending || termCount >= 20}>
              <CalendarPlus className="ic ic-sm" />
              Thêm kỳ {termCount + 1}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeTerms(-1)} disabled={saveMajor.isPending || termCount <= 1 || inColumn(termCount).length > 0} title={inColumn(termCount).length ? `Kỳ ${termCount} còn môn` : undefined}>
              <CalendarMinus className="ic ic-sm" />
              Bớt kỳ {termCount}
            </button>
          </div>
        </div>
      )}

      {!isLoading && subjects.length === 0 && (
        <EmptyState
          title="Chương trình chưa có môn nào"
          description="Thêm môn vào từng kỳ, rồi bấm vào thẻ môn để đặt điều kiện tiên quyết."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(1)}>
              <RouteIcon className="ic ic-sm" />
              Thêm môn vào kỳ 1
            </button>
          }
        />
      )}

      <EntrySheet majorId={majorId} entry={editing} termCount={termCount} passMark={passMark} options={options} onClose={() => setEditing(null)} />
      <AddSheet majorId={majorId} universityId={universityId} term={adding} termCount={termCount} onClose={() => setAdding(undefined)} />
      {major && <MajorForm open={majorForm} faculties={faculties} major={major} onClose={() => setMajorForm(false)} />}
    </>
  );
}
