import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookPlus, Pencil, Trash2 } from 'lucide-react';
import { SEMESTERS, SEMESTER_LABELS, STUDY_YEARS, subjectInputSchema, type AdminSubjectDto } from '@kaned/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDeleteSubject, useFacultiesAdmin, useSaveSubject, useSubjectsAdmin, useUniversitiesAdmin } from './api';
import { AdminHead, ConfirmDialog, EmptyRow, Pager, SearchBox, Sheet, TableSkeleton, useDebounced, type ConfirmState } from './ui';
import { applyServerErrors, schemaResolver } from './forms';
import { useAdminCrumbs } from './AdminShell';

type In = z.input<typeof subjectInputSchema>;
type Out = z.output<typeof subjectInputSchema>;

const toLines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

export function SubjectForm({ open, onClose, subject, universityId }: { open: boolean; onClose: () => void; subject?: AdminSubjectDto | null; universityId?: string }) {
  const toast = useToast();
  const save = useSaveSubject();
  const { data: universities = [] } = useUniversitiesAdmin();
  const form = useForm<In, unknown, Out>({ resolver: schemaResolver(subjectInputSchema) });
  const uni = form.watch('universityId');
  const { data: faculties = [] } = useFacultiesAdmin(uni || undefined);
  const [topics, setTopics] = useState('');
  const [outcomes, setOutcomes] = useState('');

  useEffect(() => {
    if (!open) return;
    form.reset(
      subject
        ? {
            universityId: subject.universityId,
            facultyId: subject.facultyId ?? '',
            code: subject.code,
            name: subject.name,
            nameVi: subject.nameVi,
            credits: subject.credits,
            typicalYear: subject.typicalYear ?? '',
            typicalSemester: subject.typicalSemester ?? '',
            description: subject.description ?? '',
            assessment: subject.assessment ?? '',
            topics: subject.topics,
            outcomes: subject.outcomes,
          }
        : { universityId: universityId ?? '', facultyId: '', code: '', name: '', nameVi: '', credits: 3, typicalYear: '', typicalSemester: '', description: '', assessment: '', topics: [], outcomes: [] },
    );
    setTopics(subject?.topics.join('\n') ?? '');
    setOutcomes(subject?.outcomes.join('\n') ?? '');
  }, [open, subject, universityId, form]);

  useEffect(() => {
    if (faculties.length) form.setValue('facultyId', form.getValues('facultyId'));
  }, [faculties.length, form]);

  const onSubmit = form.handleSubmit(async ({ universityId: uid, ...rest }) => {
    const input = { ...rest, topics: toLines(topics), outcomes: toLines(outcomes) };
    try {
      const saved = await save.mutateAsync(subject ? { id: subject.id, input } : { input: { universityId: uid, ...input } });
      toast.success(subject ? 'Đã lưu môn học' : 'Đã thêm môn học', `${saved.code} — ${saved.nameVi}`);
      onClose();
    } catch (e) {
      toast.error('Không lưu được', applyServerErrors(form, e).message);
    }
  });
  const e = form.formState.errors;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={subject ? `Sửa ${subject.code}` : 'Thêm môn học'}
      description={
        subject?.programmes.length
          ? `Dùng trong ${subject.programmes.map((p) => `${p.majorCode}${p.termNo ? ` (kỳ ${p.termNo})` : ''}`).join(', ')}. Đổi mã sẽ tự cập nhật điều kiện ở các môn khác.`
          : 'Môn học thuộc một trường. Thêm vào chương trình đào tạo ở trang Chương trình.'
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Huỷ
          </button>
          <button type="submit" form="adm-form" className={cn('btn btn-primary', save.isPending && 'is-loading')} disabled={save.isPending}>
            {subject ? 'Lưu thay đổi' : 'Thêm môn'}
          </button>
        </>
      }
    >
      <form id="adm-form" onSubmit={onSubmit} noValidate style={{ display: 'contents' }}>
        <section className="sheet-section">
          <h3>Thông tin môn</h3>
          <div className="form-grid">
            <Field label="Trường" htmlFor="s-uni" required error={e.universityId?.message}>
              <select id="s-uni" className="select" disabled={Boolean(subject)} {...form.register('universityId', { onChange: () => form.setValue('facultyId', '') })}>
                <option value="">Chọn trường</option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.nameVi}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Khoa" htmlFor="s-fac" optional error={e.facultyId?.message}>
              <select id="s-fac" className="select" disabled={!uni} {...form.register('facultyId')}>
                <option value="">Không thuộc khoa nào</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} — {f.nameVi}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mã môn" htmlFor="s-code" required error={e.code?.message} hint="Giữ đúng chữ hoa/thường như trường viết, ví dụ SWE201c.">
              <input id="s-code" className="input" maxLength={24} {...form.register('code')} />
            </Field>
            <Field label="Số tín chỉ" htmlFor="s-cr" required error={e.credits?.message}>
              <input id="s-cr" className="input" inputMode="numeric" {...form.register('credits')} />
            </Field>
            <Field label="Tên tiếng Việt" htmlFor="s-vi" required error={e.nameVi?.message} className="span-2">
              <input id="s-vi" className="input" {...form.register('nameVi')} />
            </Field>
            <Field label="Tên tiếng Anh" htmlFor="s-en" required error={e.name?.message} className="span-2">
              <input id="s-en" className="input" {...form.register('name')} />
            </Field>
            <Field label="Thường học năm" htmlFor="s-year" optional>
              <select id="s-year" className="select" {...form.register('typicalYear')}>
                <option value="">—</option>
                {STUDY_YEARS.map((y) => (
                  <option key={y} value={y}>
                    Năm {y}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Học kỳ thường mở" htmlFor="s-sem" optional>
              <select id="s-sem" className="select" {...form.register('typicalSemester')}>
                <option value="">—</option>
                {SEMESTERS.map((s) => (
                  <option key={s} value={s}>
                    {SEMESTER_LABELS[s].vi}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
        <section className="sheet-section">
          <h3>Đề cương</h3>
          <p>Hiện ở bảng chi tiết môn trong trang Môn học & điều kiện của sinh viên.</p>
          <Field label="Mô tả" htmlFor="s-desc" optional error={e.description?.message}>
            <textarea id="s-desc" className="textarea" rows={4} {...form.register('description')} />
          </Field>
          <div className="form-grid">
            <Field label="Nội dung chính" htmlFor="s-topics" optional hint="Mỗi dòng một chủ đề.">
              <textarea id="s-topics" className="textarea" rows={6} value={topics} onChange={(ev) => setTopics(ev.target.value)} />
            </Field>
            <Field label="Chuẩn đầu ra" htmlFor="s-out" optional hint="Mỗi dòng một chuẩn đầu ra.">
              <textarea id="s-out" className="textarea" rows={6} value={outcomes} onChange={(ev) => setOutcomes(ev.target.value)} />
            </Field>
          </div>
          <Field label="Đánh giá" htmlFor="s-assess" optional hint="Ví dụ: Lab 30%, Progress test 20%, Final 50%.">
            <input id="s-assess" className="input" {...form.register('assessment')} />
          </Field>
        </section>
      </form>
    </Sheet>
  );
}

const PAGE_SIZE = 30;

export function SubjectsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: universities = [] } = useUniversitiesAdmin();
  const universityId = params.get('universityId') ?? '';
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminSubjectDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const remove = useDeleteSubject();
  const { data, isLoading } = useSubjectsAdmin({ q: query || undefined, universityId: universityId || undefined, page, pageSize: PAGE_SIZE });
  useAdminCrumbs([{ label: 'Môn học' }]);

  useEffect(() => setPage(1), [query, universityId]);
  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      const p = new URLSearchParams(params);
      p.delete('new');
      setParams(p, { replace: true });
    }
  }, [params, setParams]);

  const items = data?.items ?? [];
  const uniById = new Map(universities.map((u) => [u.id, u]));

  return (
    <>
      <AdminHead
        title="Môn học"
        description="Danh mục môn của từng trường. Một môn có thể nằm trong nhiều chương trình đào tạo với điều kiện khác nhau."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <BookPlus className="ic ic-sm" />
            Thêm môn
          </button>
        }
      />
      <section className="adm-panel">
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm mã hoặc tên môn…" />
          <select
            className="select"
            value={universityId}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              if (e.target.value) p.set('universityId', e.target.value);
              else p.delete('universityId');
              setParams(p, { replace: true });
            }}
            aria-label="Trường"
          >
            <option value="">Mọi trường</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.nameVi}
              </option>
            ))}
          </select>
        </div>
        <div className="adm-table-wrap">
          <table className={cn('adm-table is-clickable', !isLoading && 'rows-in')}>
            <thead>
              <tr>
                <th>Môn học</th>
                <th>Trường · khoa</th>
                <th className="num">Tín chỉ</th>
                <th>Chương trình</th>
                <th className="num">Tài liệu</th>
                <th className="w-acts" aria-label="Thao tác" />
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={6} />
            ) : !items.length ? (
              <EmptyRow cols={6}>
                <EmptyState
                  title={query ? 'Không có môn khớp' : 'Chưa có môn học'}
                  description={query ? `Không tìm thấy “${query}”.` : 'Thêm môn đầu tiên cho trường này.'}
                  action={
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                      <BookPlus className="ic ic-sm" />
                      Thêm môn
                    </button>
                  }
                />
              </EmptyRow>
            ) : (
              <tbody>
                {items.map((s) => {
                  const u = uniById.get(s.universityId);
                  return (
                    <tr key={s.id} onClick={() => setEditing(s)}>
                      <td>
                        <span className="cell-title">
                          <span className="cell-code">{s.code}</span> · {s.nameVi}
                        </span>
                        <span className="cell-sub">{s.name}</span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                          {u && <span className="adm-swatch" style={{ background: u.color }} />}
                          {u?.code ?? '—'}
                          {s.faculty ? <span className="muted">· {s.faculty.code}</span> : null}
                        </span>
                      </td>
                      <td className="num">{s.credits}</td>
                      <td style={{ fontSize: 13 }}>
                        {s.programmes.length ? (
                          s.programmes.map((p) => (
                            <Link key={p.majorId} to={`/admin/curriculum/${p.majorId}`} className="badge badge-violet" style={{ marginRight: 4 }} onClick={(ev) => ev.stopPropagation()}>
                              {p.majorCode}
                              {p.termNo ? ` · kỳ ${p.termNo}` : ''}
                            </Link>
                          ))
                        ) : (
                          <span className="muted">Chưa xếp</span>
                        )}
                      </td>
                      <td className="num">{fmtInt(s.documentCount)}</td>
                      <td className="w-acts" onClick={(ev) => ev.stopPropagation()}>
                        <div className="row-acts">
                          <button type="button" className="icon-btn" aria-label={`Sửa ${s.code}`} onClick={() => setEditing(s)}>
                            <Pencil className="ic ic-sm" />
                          </button>
                          <button
                            type="button"
                            className="icon-btn is-danger"
                            aria-label={`Xoá ${s.code}`}
                            onClick={() =>
                              setConfirm({
                                title: `Xoá ${s.code}?`,
                                body: s.documentCount ? (
                                  <>
                                    Môn còn <b>{s.documentCount} tài liệu</b>. Chuyển tài liệu sang môn khác trước khi xoá.
                                  </>
                                ) : (
                                  <>
                                    <b>{s.nameVi}</b> sẽ bị xoá khỏi danh mục{s.programmes.length ? ` và khỏi ${s.programmes.length} chương trình` : ''}. Điểm sinh viên đã nhập
                                    cho môn này cũng mất.
                                  </>
                                ),
                                confirmLabel: 'Xoá môn',
                                typeToConfirm: s.programmes.length ? s.code : undefined,
                                run: () =>
                                  remove.mutateAsync(s.id).then(
                                    () => toast.success('Đã xoá môn', s.code),
                                    (err) => {
                                      toast.error('Không xoá được', toApiError(err).message);
                                      throw err;
                                    },
                                  ),
                              })
                            }
                          >
                            <Trash2 className="ic ic-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
        {data && <Pager page={page} totalPages={data.totalPages} total={data.total} unit="môn" onPage={setPage} />}
      </section>
      <SubjectForm open={creating || Boolean(editing)} subject={editing} universityId={universityId || undefined} onClose={() => (setCreating(false), setEditing(null))} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
