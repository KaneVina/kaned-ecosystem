import { useEffect } from 'react';
import { useForm, type FieldValues, type Path, type Resolver, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z, ZodTypeAny } from 'zod';
import {
  academicTermInputSchema,
  facultyInputSchema,
  majorInputSchema,
  REGIONS,
  REGION_LABELS,
  SEMESTERS,
  SEMESTER_LABELS,
  universityInputSchema,
  UNIVERSITY_KINDS,
  UNIVERSITY_KIND_LABELS,
  type AcademicTermDto,
  type AdminFacultyDto,
  type AdminMajorDto,
  type AdminUniversityDto,
} from '@kaned/shared';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSaveFaculty, useSaveMajor, useSaveTerm, useSaveUniversity } from './api';
import { Sheet } from './ui';

/** zodResolver typed with the schema's input (what the form holds) and output (what submit gets). */
export const schemaResolver = <S extends ZodTypeAny>(schema: S) =>
  zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>;

/** Field errors from the API (409 duplicate code, 400 bad dates…) land on the right input. */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown) {
  const err = toApiError(error);
  if (err.fields) for (const [k, m] of Object.entries(err.fields)) form.setError(k as Path<T>, { message: m });
  return err;
}

function Footer({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
        Huỷ
      </button>
      <button type="submit" form="adm-form" className={cn('btn btn-primary', busy && 'is-loading')} disabled={busy}>
        {label}
      </button>
    </>
  );
}

/* ───────────────────────────── university ───────────────────────────── */

const PRESETS = ['#F26F21', '#1E4DB7', '#0F6E3F', '#B3261E', '#4433B4', '#0E7C86', '#9C2A6B', '#1C1A2B'];
type UniIn = z.input<typeof universityInputSchema>;
type UniOut = z.output<typeof universityInputSchema>;

export function UniversityForm({ open, onClose, university }: { open: boolean; onClose: () => void; university?: AdminUniversityDto | null }) {
  const toast = useToast();
  const save = useSaveUniversity();
  const form = useForm<UniIn, unknown, UniOut>({ resolver: schemaResolver(universityInputSchema) });
  const color = form.watch('color');

  useEffect(() => {
    if (!open) return;
    form.reset(
      university
        ? {
            code: university.code,
            name: university.name,
            nameVi: university.nameVi,
            city: university.city,
            region: university.region as UniIn['region'],
            kind: university.kind as UniIn['kind'],
            foundedYear: university.foundedYear ?? '',
            color: university.color,
            description: university.description ?? '',
          }
        : { code: '', name: '', nameVi: '', city: '', region: 'south', kind: 'Public', foundedYear: '', color: '#4433B4', description: '' },
    );
  }, [open, university, form]);

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      const saved = await save.mutateAsync({ id: university?.id, input });
      toast.success(university ? 'Đã lưu trường' : 'Đã thêm trường', `${saved.code} — ${saved.nameVi}`);
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
      title={university ? `Sửa ${university.code}` : 'Thêm trường'}
      description="Mã trường dùng để lọc thư viện và hiện trên thẻ tài liệu."
      footer={<Footer onClose={onClose} busy={save.isPending} label={university ? 'Lưu thay đổi' : 'Thêm trường'} />}
    >
      <form id="adm-form" className="sheet-section" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <Field label="Mã trường" htmlFor="u-code" required error={e.code?.message} hint="Viết hoa, ví dụ HUST, FPTU.">
            <input id="u-code" className="input" maxLength={16} style={{ textTransform: 'uppercase' }} {...form.register('code')} />
          </Field>
          <Field label="Thành phố" htmlFor="u-city" required error={e.city?.message}>
            <input id="u-city" className="input" {...form.register('city')} />
          </Field>
          <Field label="Tên tiếng Việt" htmlFor="u-vi" required error={e.nameVi?.message} className="span-2">
            <input id="u-vi" className="input" placeholder="Đại học Bách khoa Hà Nội" {...form.register('nameVi')} />
          </Field>
          <Field label="Tên tiếng Anh" htmlFor="u-en" required error={e.name?.message} className="span-2">
            <input id="u-en" className="input" placeholder="Hanoi University of Science and Technology" {...form.register('name')} />
          </Field>
          <Field label="Miền" htmlFor="u-region" required>
            <select id="u-region" className="select" {...form.register('region')}>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Loại hình" htmlFor="u-kind" required>
            <select id="u-kind" className="select" {...form.register('kind')}>
              {UNIVERSITY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {UNIVERSITY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Năm thành lập" htmlFor="u-year" optional error={e.foundedYear?.message}>
            <input id="u-year" className="input" inputMode="numeric" {...form.register('foundedYear')} />
          </Field>
          <Field label="Màu nhận diện" htmlFor="u-color" required error={e.color?.message}>
            <div className="color-field">
              <input id="u-color" type="color" value={color ?? '#4433B4'} onChange={(ev) => form.setValue('color', ev.target.value.toUpperCase(), { shouldDirty: true })} />
              <div className="color-presets">
                {PRESETS.map((p) => (
                  <button key={p} type="button" style={{ background: p }} aria-label={p} aria-pressed={color?.toUpperCase() === p} onClick={() => form.setValue('color', p, { shouldDirty: true })} />
                ))}
              </div>
            </div>
          </Field>
          <Field label="Giới thiệu" htmlFor="u-desc" optional error={e.description?.message} className="span-2">
            <textarea id="u-desc" className="textarea" rows={3} {...form.register('description')} />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

/* ───────────────────────────── faculty ───────────────────────────── */

type FacIn = z.input<typeof facultyInputSchema>;
type FacOut = z.output<typeof facultyInputSchema>;

export function FacultyForm({ open, onClose, universityId, faculty }: { open: boolean; onClose: () => void; universityId: string; faculty?: AdminFacultyDto | null }) {
  const toast = useToast();
  const save = useSaveFaculty();
  const form = useForm<FacIn, unknown, FacOut>({ resolver: schemaResolver(facultyInputSchema) });
  useEffect(() => {
    if (open) form.reset(faculty ? { universityId, code: faculty.code, name: faculty.name, nameVi: faculty.nameVi } : { universityId, code: '', name: '', nameVi: '' });
  }, [open, faculty, universityId, form]);

  const onSubmit = form.handleSubmit(async ({ universityId: uid, ...rest }) => {
    try {
      await save.mutateAsync(faculty ? { id: faculty.id, input: rest } : { input: { universityId: uid, ...rest } });
      toast.success(faculty ? 'Đã lưu khoa' : 'Đã thêm khoa', rest.nameVi);
      onClose();
    } catch (e) {
      toast.error('Không lưu được', applyServerErrors(form, e).message);
    }
  });
  const e = form.formState.errors;

  return (
    <Sheet open={open} onClose={onClose} title={faculty ? `Sửa khoa ${faculty.code}` : 'Thêm khoa'} description="Khoa hoặc trường thành viên, nơi các ngành trực thuộc." footer={<Footer onClose={onClose} busy={save.isPending} label={faculty ? 'Lưu' : 'Thêm khoa'} />}>
      <form id="adm-form" className="sheet-section" onSubmit={onSubmit} noValidate>
        <Field label="Mã khoa" htmlFor="f-code" required error={e.code?.message} hint="Ví dụ SOICT, IT, CSE.">
          <input id="f-code" className="input" maxLength={16} style={{ textTransform: 'uppercase' }} {...form.register('code')} />
        </Field>
        <Field label="Tên tiếng Việt" htmlFor="f-vi" required error={e.nameVi?.message}>
          <input id="f-vi" className="input" {...form.register('nameVi')} />
        </Field>
        <Field label="Tên tiếng Anh" htmlFor="f-en" required error={e.name?.message}>
          <input id="f-en" className="input" {...form.register('name')} />
        </Field>
      </form>
    </Sheet>
  );
}

/* ───────────────────────────── major ───────────────────────────── */

type MajIn = z.input<typeof majorInputSchema>;
type MajOut = z.output<typeof majorInputSchema>;

export function MajorForm({
  open,
  onClose,
  faculties,
  facultyId,
  major,
}: {
  open: boolean;
  onClose: () => void;
  faculties: AdminFacultyDto[];
  facultyId?: string;
  major?: AdminMajorDto | null;
}) {
  const toast = useToast();
  const save = useSaveMajor();
  const form = useForm<MajIn, unknown, MajOut>({ resolver: schemaResolver(majorInputSchema) });
  useEffect(() => {
    if (!open) return;
    form.reset(
      major
        ? { facultyId: major.facultyId, code: major.code, name: major.name, nameVi: major.nameVi, totalCredits: major.totalCredits, passMark: major.passMark, termCount: major.termCount }
        : { facultyId: facultyId ?? faculties[0]?.id ?? '', code: '', name: '', nameVi: '', totalCredits: 140, passMark: 5, termCount: 8 },
    );
  }, [open, major, facultyId, faculties, form]);

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await save.mutateAsync({ id: major?.id, input });
      toast.success(major ? 'Đã lưu ngành' : 'Đã thêm ngành', input.nameVi);
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
      title={major ? `Sửa ngành ${major.code}` : 'Thêm ngành'}
      description="Số kỳ và điểm qua môn quyết định cách trang Môn học & điều kiện tính cho sinh viên ngành này."
      footer={<Footer onClose={onClose} busy={save.isPending} label={major ? 'Lưu' : 'Thêm ngành'} />}
    >
      <form id="adm-form" className="sheet-section" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <Field label="Khoa" htmlFor="m-fac" required error={e.facultyId?.message} className="span-2">
            <select id="m-fac" className="select" {...form.register('facultyId')}>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} — {f.nameVi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mã ngành" htmlFor="m-code" required error={e.code?.message}>
            <input id="m-code" className="input" maxLength={16} style={{ textTransform: 'uppercase' }} {...form.register('code')} />
          </Field>
          <Field label="Tổng tín chỉ" htmlFor="m-cr" required error={e.totalCredits?.message}>
            <input id="m-cr" className="input" inputMode="numeric" {...form.register('totalCredits')} />
          </Field>
          <Field label="Tên tiếng Việt" htmlFor="m-vi" required error={e.nameVi?.message} className="span-2">
            <input id="m-vi" className="input" {...form.register('nameVi')} />
          </Field>
          <Field label="Tên tiếng Anh" htmlFor="m-en" required error={e.name?.message} className="span-2">
            <input id="m-en" className="input" {...form.register('name')} />
          </Field>
          <Field label="Số kỳ trong chương trình" htmlFor="m-terms" required error={e.termCount?.message} hint="Kỳ 1 đến kỳ N.">
            <input id="m-terms" className="input" inputMode="numeric" {...form.register('termCount')} />
          </Field>
          <Field label="Điểm qua môn (hệ 10)" htmlFor="m-pass" required error={e.passMark?.message} hint="FPT dùng 5.0, nhiều trường dùng 4.0.">
            <input id="m-pass" className="input" inputMode="decimal" {...form.register('passMark')} />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

/* ───────────────────────────── academic term ───────────────────────────── */

type TermIn = z.input<typeof academicTermInputSchema>;
type TermOut = z.output<typeof academicTermInputSchema>;

export function TermForm({ open, onClose, universityId, term, suggest }: { open: boolean; onClose: () => void; universityId: string; term?: AcademicTermDto | null; suggest?: Partial<TermIn> }) {
  const toast = useToast();
  const save = useSaveTerm();
  const form = useForm<TermIn, unknown, TermOut>({ resolver: schemaResolver(academicTermInputSchema) });
  useEffect(() => {
    if (!open) return;
    form.reset(
      term
        ? { universityId, code: term.code, name: term.name, schoolYear: term.schoolYear, semester: term.semester, startsOn: term.startsOn ?? '', endsOn: term.endsOn ?? '' }
        : { universityId, code: '', name: '', schoolYear: '2026–2027', semester: 'S1', startsOn: '', endsOn: '', ...suggest },
    );
  }, [open, term, universityId, suggest, form]);

  const onSubmit = form.handleSubmit(async ({ universityId: uid, ...rest }) => {
    try {
      await save.mutateAsync(term ? { id: term.id, input: rest } : { input: { universityId: uid, ...rest } });
      toast.success(term ? 'Đã lưu kỳ học' : 'Đã thêm kỳ học', rest.name);
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
      title={term ? `Sửa ${term.name}` : 'Thêm kỳ học'}
      description="Mỗi trường đặt tên kỳ theo cách riêng. Kỳ học gắn với một học kỳ chuẩn để thư viện lọc chung được."
      footer={<Footer onClose={onClose} busy={save.isPending} label={term ? 'Lưu' : 'Thêm kỳ'} />}
    >
      <form id="adm-form" className="sheet-section" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <Field label="Tên kỳ" htmlFor="t-name" required error={e.name?.message} hint="Như sinh viên trường gọi: Spring 2026, HK1 2026–2027…" className="span-2">
            <input id="t-name" className="input" {...form.register('name')} />
          </Field>
          <Field label="Mã kỳ" htmlFor="t-code" required error={e.code?.message} hint="Ví dụ SP26, HK261, 20261.">
            <input id="t-code" className="input" maxLength={16} style={{ textTransform: 'uppercase' }} {...form.register('code')} />
          </Field>
          <Field label="Năm học" htmlFor="t-sy" required error={e.schoolYear?.message}>
            <input id="t-sy" className="input" placeholder="2026–2027" {...form.register('schoolYear')} />
          </Field>
          <Field label="Tương ứng học kỳ" htmlFor="t-sem" required className="span-2">
            <select id="t-sem" className="select" {...form.register('semester')}>
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {SEMESTER_LABELS[s].vi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bắt đầu" htmlFor="t-start" optional error={e.startsOn?.message}>
            <input id="t-start" className="input" type="date" {...form.register('startsOn')} />
          </Field>
          <Field label="Kết thúc" htmlFor="t-end" optional error={e.endsOn?.message}>
            <input id="t-end" className="input" type="date" {...form.register('endsOn')} />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
