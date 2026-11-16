import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, CalendarPlus, CalendarRange, Landmark, Pencil, Plus, Route as RouteIcon, Trash2 } from 'lucide-react';
import { SEMESTER_LABELS, type AcademicTermDto, type AdminFacultyDto, type AdminMajorDto, type TermState } from '@kaned/shared';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtDate, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDeleteFaculty, useDeleteMajor, useDeleteTerm, useFacultiesAdmin, useTermsAdmin, useUniversityAdmin } from './api';
import { ConfirmDialog, type ConfirmState } from './ui';
import { FacultyForm, MajorForm, TermForm, UniversityForm } from './forms';
import { UniMark } from './UniversitiesPage';
import { useAdminCrumbs } from './AdminShell';

const STATE_LABEL: Record<TermState, string> = { current: 'Đang diễn ra', upcoming: 'Sắp tới', past: 'Đã kết thúc', undated: 'Chưa có ngày' };

function TermProgress({ t }: { t: AcademicTermDto }) {
  if (t.state !== 'current' || !t.startsOn || !t.endsOn) return null;
  const start = new Date(t.startsOn).getTime();
  const end = new Date(t.endsOn).getTime();
  const p = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  return (
    <span className="term-timeline" title={`Đã qua ${Math.round(p)}% kỳ`}>
      <i style={{ width: `${p}%` }} />
    </span>
  );
}

/** "Fall 2026" → suggest "Spring 2027"; "HK1 2026–2027" → "HK2 2026–2027". */
function nextTermSuggestion(terms: AcademicTermDto[]) {
  const latest = terms[0];
  if (!latest) return undefined;
  const [y1, y2] = latest.schoolYear.split('–').map(Number);
  const order = ['S1', 'S2', 'SUMMER'] as const;
  const i = order.indexOf(latest.semester);
  const semester = order[(i + 1) % 3];
  const schoolYear = semester === 'S1' ? `${y1 + 1}–${y2 + 1}` : latest.schoolYear;
  return { semester, schoolYear };
}

export function UniversityDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: uni, isError } = useUniversityAdmin(id);
  const { data: faculties = [], isLoading: loadingFac } = useFacultiesAdmin(id);
  const { data: terms = [], isLoading: loadingTerms } = useTermsAdmin(id);
  const [tab, setTab] = useState<'programmes' | 'terms'>('programmes');
  const [uniForm, setUniForm] = useState(false);
  const [facForm, setFacForm] = useState<{ faculty?: AdminFacultyDto } | null>(null);
  const [majForm, setMajForm] = useState<{ major?: AdminMajorDto; facultyId?: string } | null>(null);
  const [termForm, setTermForm] = useState<{ term?: AcademicTermDto } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const delFac = useDeleteFaculty();
  const delMaj = useDeleteMajor();
  const delTerm = useDeleteTerm();
  useAdminCrumbs([{ label: 'Trường học', to: '/admin/universities' }, { label: uni?.code ?? '…' }], [uni?.code]);
  const suggest = useMemo(() => nextTermSuggestion(terms), [terms]);

  if (isError) return <ErrorState title="Không tìm thấy trường" description="Trường này có thể đã bị xoá." />;

  const fail = (what: string) => (e: unknown) => {
    toast.error(`Không xoá được ${what}`, toApiError(e).message);
    throw e;
  };

  return (
    <>
      {uni ? (
        <div className="uni-hero" style={{ ['--uc' as string]: uni.color }}>
          <UniMark u={uni} />
          <div>
            <h1>{uni.nameVi}</h1>
            <p>
              {uni.name} · {uni.city}
              {uni.foundedYear ? ` · thành lập ${uni.foundedYear}` : ''}
            </p>
          </div>
          <span className="spacer" />
          <dl className="uni-hero-stats">
            <div>
              <dt>Khoa</dt>
              <dd>{uni.facultyCount}</dd>
            </div>
            <div>
              <dt>Ngành</dt>
              <dd>{uni.majorCount}</dd>
            </div>
            <div>
              <dt>Môn</dt>
              <dd>{fmtInt(uni.subjectCount)}</dd>
            </div>
            <div>
              <dt>Sinh viên</dt>
              <dd>{fmtInt(uni.userCount)}</dd>
            </div>
          </dl>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUniForm(true)}>
            <Pencil className="ic ic-sm" />
            Sửa
          </button>
        </div>
      ) : (
        <div className="skel" style={{ height: 92, borderRadius: 14, marginBottom: 18 }} />
      )}

      <section className="adm-panel">
        <div className="tabs adm-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'programmes'} onClick={() => setTab('programmes')}>
            <Landmark className="ic ic-sm" />
            Khoa và ngành <span className="count">{faculties.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'terms'} onClick={() => setTab('terms')}>
            <CalendarRange className="ic ic-sm" />
            Kỳ học <span className="count">{terms.length}</span>
          </button>
          <div className="adm-tab-actions">
            {tab === 'programmes' ? (
              <>
                <Link to={`/admin/subjects?universityId=${id}`} className="btn btn-ghost btn-sm">
                  <BookOpen className="ic ic-sm" />
                  Môn học của trường
                </Link>
                <button type="button" className="btn btn-soft btn-sm" onClick={() => setFacForm({})}>
                  <Plus className="ic ic-sm" />
                  Thêm khoa
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setTermForm({})}>
                <CalendarPlus className="ic ic-sm" />
                Thêm kỳ học
              </button>
            )}
          </div>
        </div>

        {tab === 'programmes' ? (
          loadingFac ? (
            <div style={{ padding: 18 }}>
              <div className="skel" style={{ height: 120 }} />
            </div>
          ) : !faculties.length ? (
            <EmptyState
              title="Trường chưa có khoa nào"
              description="Thêm một khoa trước, rồi thêm các ngành thuộc khoa đó. Mỗi ngành có chương trình đào tạo riêng."
              action={
                <button type="button" className="btn btn-primary" onClick={() => setFacForm({})}>
                  <Plus className="ic ic-sm" />
                  Thêm khoa đầu tiên
                </button>
              }
            />
          ) : (
            faculties.map((f) => (
              <div key={f.id} className="fac-block">
                <div className="fac-row">
                  <span className="fac-badge">
                    <Landmark className="ic ic-sm" />
                  </span>
                  <div>
                    <span className="cell-title">
                      <span className="cell-code">{f.code}</span> · {f.nameVi}
                    </span>
                    <span className="cell-sub">
                      {f.name} · {f.majors.length} ngành · {f.subjectCount} môn
                    </span>
                  </div>
                  <div className="row-acts" style={{ opacity: 1 }}>
                    <button type="button" className="icon-btn" aria-label={`Sửa khoa ${f.code}`} onClick={() => setFacForm({ faculty: f })}>
                      <Pencil className="ic ic-sm" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn is-danger"
                      aria-label={`Xoá khoa ${f.code}`}
                      onClick={() =>
                        setConfirm({
                          title: `Xoá khoa ${f.code}?`,
                          body: f.majors.length ? (
                            <>
                              Khoa còn <b>{f.majors.length} ngành</b>. Xoá hoặc chuyển các ngành sang khoa khác trước.
                            </>
                          ) : (
                            <>
                              <b>{f.nameVi}</b> sẽ bị xoá. Các môn của khoa vẫn giữ nguyên, chỉ bỏ liên kết với khoa.
                            </>
                          ),
                          confirmLabel: 'Xoá khoa',
                          run: () => delFac.mutateAsync(f.id).then(() => toast.success('Đã xoá khoa', f.nameVi), fail('khoa')),
                        })
                      }
                    >
                      <Trash2 className="ic ic-sm" />
                    </button>
                  </div>
                </div>
                <div className="major-rows">
                  {f.majors.map((m) => (
                    <div key={m.id} className="major-row">
                      <div>
                        <span className="cell-title">
                          <span className="cell-code">{m.code}</span> · {m.nameVi}
                        </span>
                        <span className="cell-sub">{m.name}</span>
                      </div>
                      <div className="major-meta">
                        <span>
                          <b>{m.termCount}</b> kỳ
                        </span>
                        <span>
                          <b>{m.subjectCount}</b> môn · <b>{m.plannedCredits}</b>/{m.totalCredits} TC
                        </span>
                        <span>
                          qua môn ≥ <b>{m.passMark.toFixed(1)}</b>
                        </span>
                        <span>
                          <b>{m.studentCount}</b> SV
                        </span>
                      </div>
                      <div className="row-acts" style={{ opacity: 1 }}>
                        <button type="button" className="btn btn-soft btn-sm" onClick={() => navigate(`/admin/curriculum/${m.id}`)}>
                          <RouteIcon className="ic ic-sm" />
                          Chương trình
                        </button>
                        <button type="button" className="icon-btn" aria-label={`Sửa ngành ${m.code}`} onClick={() => setMajForm({ major: m })}>
                          <Pencil className="ic ic-sm" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn is-danger"
                          aria-label={`Xoá ngành ${m.code}`}
                          onClick={() =>
                            setConfirm({
                              title: `Xoá ngành ${m.code}?`,
                              body: (
                                <>
                                  Chương trình {m.subjectCount} môn của <b>{m.nameVi}</b> sẽ bị xoá (các môn học vẫn còn).
                                  {m.studentCount > 0 && ` ${m.studentCount} sinh viên đang chọn ngành này sẽ phải chọn lại.`}
                                </>
                              ),
                              confirmLabel: 'Xoá ngành',
                              typeToConfirm: m.studentCount > 0 ? m.code : undefined,
                              run: () => delMaj.mutateAsync(m.id).then(() => toast.success('Đã xoá ngành', m.nameVi), fail('ngành')),
                            })
                          }
                        >
                          <Trash2 className="ic ic-sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="major-add" onClick={() => setMajForm({ facultyId: f.id })}>
                    <Plus className="ic ic-sm" />
                    Thêm ngành vào {f.code}
                  </button>
                </div>
              </div>
            ))
          )
        ) : loadingTerms ? (
          <div style={{ padding: 18 }}>
            <div className="skel" style={{ height: 120 }} />
          </div>
        ) : !terms.length ? (
          <EmptyState
            title="Chưa có kỳ học nào"
            description="Kỳ học là cách trường gọi từng học kỳ (Spring 2026, HK1 2026–2027…). Tài liệu gắn với kỳ để sinh viên lọc đúng đề của kỳ đó."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setTermForm({})}>
                <CalendarPlus className="ic ic-sm" />
                Thêm kỳ đầu tiên
              </button>
            }
          />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table rows-in">
              <thead>
                <tr>
                  <th>Kỳ học</th>
                  <th>Năm học</th>
                  <th>Tương ứng</th>
                  <th>Thời gian</th>
                  <th>Trạng thái</th>
                  <th className="num">Tài liệu</th>
                  <th className="w-acts" aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="cell-title">{t.name}</span>
                      <span className="cell-sub cell-code">{t.code}</span>
                    </td>
                    <td>{t.schoolYear}</td>
                    <td>{SEMESTER_LABELS[t.semester].vi}</td>
                    <td style={{ fontSize: 13.5, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                      {t.startsOn && t.endsOn ? `${fmtDate(t.startsOn)} – ${fmtDate(t.endsOn)}` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={cn('term-state', `is-${t.state}`)}>
                          <i />
                          {STATE_LABEL[t.state]}
                        </span>
                        <TermProgress t={t} />
                      </div>
                    </td>
                    <td className="num">{fmtInt(t.documentCount ?? 0)}</td>
                    <td className="w-acts">
                      <div className="row-acts">
                        <button type="button" className="icon-btn" aria-label={`Sửa ${t.name}`} onClick={() => setTermForm({ term: t })}>
                          <Pencil className="ic ic-sm" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn is-danger"
                          aria-label={`Xoá ${t.name}`}
                          onClick={() =>
                            setConfirm({
                              title: `Xoá ${t.name}?`,
                              body: t.documentCount
                                ? `${t.documentCount} tài liệu đang gắn với kỳ này sẽ chỉ còn học kỳ và niên khoá, không mất tài liệu nào.`
                                : 'Kỳ này chưa có tài liệu nào.',
                              confirmLabel: 'Xoá kỳ',
                              run: () => delTerm.mutateAsync(t.id).then(() => toast.success('Đã xoá kỳ học', t.name), fail('kỳ học')),
                            })
                          }
                        >
                          <Trash2 className="ic ic-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UniversityForm open={uniForm} university={uni} onClose={() => setUniForm(false)} />
      <FacultyForm open={Boolean(facForm)} universityId={id} faculty={facForm?.faculty} onClose={() => setFacForm(null)} />
      <MajorForm open={Boolean(majForm)} faculties={faculties} facultyId={majForm?.facultyId} major={majForm?.major} onClose={() => setMajForm(null)} />
      <TermForm open={Boolean(termForm)} universityId={id} term={termForm?.term} suggest={termForm?.term ? undefined : suggest} onClose={() => setTermForm(null)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
