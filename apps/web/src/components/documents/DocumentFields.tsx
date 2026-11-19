import { LecturerInput } from './LecturerInput';
import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Plus, X } from 'lucide-react';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, SEMESTERS, SEMESTER_LABELS, STUDY_YEARS, type DocumentType, type Semester } from '@kaned/shared';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useFolders, useSubjects, useTerms, useUniversities } from '@/features/catalog/queries';
import { buildFolderTree, flattenTree } from '@/lib/folders';
import { TYPE_ICONS } from '@/lib/typeIcons';
import { cn } from '@/lib/cn';

/*
 * The fields a document is described and filed with. The student upload page
 * and the admin editor both render these, so the two forms cannot drift apart.
 */

function ErrorText({ children }: { children: string }) {
  return (
    <span className="error-text">
      <CircleAlert className="ic ic-xs" />
      <span>{children}</span>
    </span>
  );
}

/* ─────────────────────────────── type ─────────────────────────────── */

export function TypePicker({ value, onChange, invalid, name = 'doc-type' }: { value: DocumentType | '' | undefined; onChange: (t: DocumentType) => void; invalid?: boolean; name?: string }) {
  return (
    <fieldset className={cn('field', invalid && 'invalid')}>
      <legend className="label">
        Loại tài liệu <span className="req">*</span>
      </legend>
      <div className="type-grid">
        {DOCUMENT_TYPES.map((t) => {
          const Icon = TYPE_ICONS[t];
          return (
            <label key={t} className="type-card">
              <input type="radio" name={name} value={t} checked={value === t} onChange={() => onChange(t)} />
              <span className="tc-ic">
                <Icon className="ic ic-sm" />
              </span>
              <span>{DOCUMENT_TYPE_LABELS[t].vi}</span>
            </label>
          );
        })}
      </div>
      <ErrorText>Chọn loại tài liệu.</ErrorText>
    </fieldset>
  );
}

/* ─────────────────────────────── tags ─────────────────────────────── */

export const MAX_TAGS = 8;

/** Adds every piece of `raw` split on commas or new lines, skipping repeats. */
export function mergeTags(current: string[], raw: string) {
  const next = [...current];
  for (const part of raw.split(/[,，\n]/)) {
    const t = part.trim().slice(0, 30);
    if (t && !next.includes(t) && next.length < MAX_TAGS) next.push(t);
  }
  return next;
}

export function TagInput({
  id,
  value,
  onChange,
  suggestions = [],
  draft,
  onDraft,
}: {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  /** The half-typed tag; kept by the parent so a save can include it. */
  draft: string;
  onDraft: (v: string) => void;
}) {
  const add = (raw: string) => {
    const next = mergeTags(value, raw);
    if (next.length !== value.length) onChange(next);
    onDraft('');
  };
  const suggested = suggestions.filter((t) => t && !value.includes(t));
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        Thẻ <span className="opt">· tối đa {MAX_TAGS}, Enter hoặc dấu phẩy để tách</span>
      </label>
      <div className="tag-input" onClick={() => document.getElementById(id)?.focus()}>
        {value.map((t) => (
          <span key={t} className="chip">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Bỏ thẻ ${t}`}>
              <X className="ic ic-xs" />
            </button>
          </span>
        ))}
        <input
          id={id}
          placeholder={value.length ? '' : 'Gõ từ khoá rồi nhấn Enter'}
          maxLength={30}
          value={draft}
          enterKeyHint="enter"
          onChange={(e) => {
            // Phone keyboards do not report "," as a key press, so split on the text itself.
            const val = e.target.value;
            if (/[,，]/.test(val)) add(val);
            else onDraft(val);
          }}
          onBlur={() => draft.trim() && add(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {suggested.length > 0 && value.length < MAX_TAGS && (
        <div className="tag-suggest">
          <span>Gợi ý:</span>
          {suggested.map((t) => (
            <button key={t} type="button" className="tag" onClick={() => add(t)}>
              <Plus className="ic ic-xs" />
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── placement ───────────────────────────── */

export interface Placement {
  universityId: string;
  subjectId: string;
  folderId: string;
  academicTermId: string;
  semester: Semester | '';
  schoolYear: string;
  period: string;
  year: number | string;
  lecturer: string;
  /** Set when the lecturer was picked from the directory. */
  lecturerId?: string | null;
}

export type PlacementErrors = Partial<Record<'universityId' | 'subjectId' | 'semester' | 'year', boolean>>;

/**
 * School → subject → folder → the school's own term (or a plain semester when
 * the school has none) → block → study year → lecturer.
 * When the school has terms, the current one is picked for a new document.
 */
export function PlacementFields({
  idPrefix,
  value,
  onChange,
  errors = {},
  autoPickTerm = true,
}: {
  idPrefix: string;
  value: Placement;
  onChange: (patch: Partial<Placement>) => void;
  errors?: PlacementErrors;
  autoPickTerm?: boolean;
}) {
  const { data: universities = [] } = useUniversities();
  const { data: subjectPage } = useSubjects({ universityId: value.universityId || undefined, pageSize: 200 }, { enabled: Boolean(value.universityId) });
  const subjects = subjectPage?.items ?? [];
  const { data: terms = [] } = useTerms(value.universityId || undefined);
  const { data: folders = [] } = useFolders(value.subjectId || undefined);
  const folderOptions = useMemo(() => flattenTree(buildFolderTree(folders)), [folders]);
  const university = universities.find((u) => u.id === value.universityId);
  const periods = university?.periods ?? [];

  /** Picking one of the school's terms fills in semester and school year. */
  const pickTerm = (termId: string) => {
    const term = terms.find((t) => t.id === termId);
    onChange(term ? { academicTermId: termId, semester: term.semester, schoolYear: term.schoolYear } : { academicTermId: termId });
  };

  // The school's current term is the most likely one; pick it unless one is set.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (!autoPickTerm || !terms.length || value.academicTermId || picked === value.universityId) return;
    const current = terms.find((t) => t.state === 'current') ?? terms[terms.length - 1];
    if (current) {
      setPicked(value.universityId);
      pickTerm(current.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPickTerm, terms, value.universityId, value.academicTermId]);

  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <div className="form-grid">
      <div className={cn('field', errors.universityId && 'invalid')}>
        <label className="label" htmlFor={id('uni')}>
          Trường <span className="req">*</span>
        </label>
        <SearchSelect
          id={id('uni')}
          value={value.universityId}
          invalid={Boolean(errors.universityId)}
          placeholder="Chọn trường"
          searchPlaceholder="Gõ tên hoặc mã trường…"
          options={universities.map((u) => ({ value: u.id, code: u.code, label: u.nameVi, keywords: u.name }))}
          onChange={(uni) => onChange({ universityId: uni, subjectId: '', folderId: '', academicTermId: '', period: '' })}
        />
        <ErrorText>Chọn trường.</ErrorText>
      </div>
      <div className={cn('field', errors.subjectId && 'invalid')}>
        <label className="label" htmlFor={id('subject')}>
          Môn học <span className="req">*</span>
        </label>
        <SearchSelect
          id={id('subject')}
          value={value.subjectId}
          disabled={!value.universityId}
          invalid={Boolean(errors.subjectId)}
          placeholder={value.universityId ? 'Chọn môn học' : 'Chọn trường trước'}
          searchPlaceholder="Gõ mã môn hoặc tên, vd. CSD201, cấu trúc…"
          options={subjects.map((s) => ({ value: s.id, code: s.code, label: s.nameVi, keywords: s.name }))}
          onChange={(subject) => onChange({ subjectId: subject, folderId: '' })}
        />
        <ErrorText>Chọn môn mà tài liệu thuộc về.</ErrorText>
      </div>
      {folderOptions.length > 0 && (
        <div className="field">
          <label className="label" htmlFor={id('folder')}>
            Thư mục trong môn
          </label>
          <SearchSelect
            id={id('folder')}
            value={value.folderId}
            clearable
            placeholder="Không xếp vào thư mục"
            searchPlaceholder="Tìm thư mục…"
            options={folderOptions.map((f) => ({ value: f.id, label: f.name, depth: f.depth }))}
            onChange={(folder) => onChange({ folderId: folder })}
          />
        </div>
      )}
      {terms.length > 0 ? (
        <div className={cn('field', errors.semester && 'invalid')}>
          <label className="label" htmlFor={id('term')}>
            Học kỳ <span className="req">*</span>
          </label>
          <SearchSelect
            id={id('term')}
            value={value.academicTermId}
            invalid={Boolean(errors.semester)}
            placeholder="Chọn học kỳ"
            searchPlaceholder="Tìm học kỳ, vd. Fall 2026…"
            options={[...terms].reverse().map((t) => ({
              value: t.id,
              label: t.state === 'current' ? `${t.name} — đang diễn ra` : t.name,
              keywords: t.code,
            }))}
            onChange={pickTerm}
          />
          <ErrorText>Chọn học kỳ.</ErrorText>
        </div>
      ) : (
        <fieldset className={cn('field', errors.semester && 'invalid')}>
          <legend className="label">
            Học kỳ <span className="req">*</span>
          </legend>
          <div className="pill-radios">
            {SEMESTERS.map((s) => (
              <label key={s} className="pill-radio">
                <input type="radio" name={id('semester')} value={s} checked={value.semester === s} onChange={() => onChange({ semester: s })} />
                <span>{SEMESTER_LABELS[s].vi}</span>
              </label>
            ))}
          </div>
          <ErrorText>Chọn học kỳ.</ErrorText>
        </fieldset>
      )}
      {periods.length > 0 && (
        <fieldset className="field">
          <legend className="label">Block</legend>
          <div className="pill-radios">
            {periods.map((p) => (
              <label key={p} className="pill-radio">
                <input
                  type="radio"
                  name={id('period')}
                  checked={value.period === p}
                  onChange={() => onChange({ period: p })}
                  onClick={() => value.period === p && onChange({ period: '' })}
                />
                <span>{p}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className={cn('field', errors.year && 'invalid')}>
        <legend className="label">
          Năm học <span className="req">*</span>
        </legend>
        <div className="pill-radios">
          {STUDY_YEARS.map((y) => (
            <label key={y} className="pill-radio">
              <input type="radio" name={id('year')} value={y} checked={String(value.year) === String(y)} onChange={() => onChange({ year: y })} />
              <span>Năm {y}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="label" htmlFor={id('lecturer')}>
          Giảng viên
        </label>
        <LecturerInput
          id={id('lecturer')}
          universityId={value.universityId}
          value={value.lecturer}
          lecturerId={value.lecturerId ?? null}
          onChange={(patch) => onChange(patch)}
        />
      </div>
    </div>
  );
}
