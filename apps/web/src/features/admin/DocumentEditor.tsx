import { useEffect, useMemo, useRef, useState } from 'react';
import { CloudUpload, ExternalLink, FileUp, Link2, Trash2 } from 'lucide-react';
import {
  createDocumentSchema,
  detectLinkProvider,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  isWebUrl,
  MAX_UPLOAD_BYTES,
  MIME_TO_FORMAT,
  SEMESTERS,
  SEMESTER_LABELS,
  STUDY_YEARS,
  type AdminDocumentDto,
  type DocumentStatus,
  type DocumentType,
  type FileFormat,
  type Semester,
} from '@kaned/shared';
import { Field } from '@/components/ui/Field';
import { FileIcon } from '@/components/ui/FileBadge';
import { useSubjects, useTerms, useUniversities } from '@/features/catalog/queries';
import { uploadToCloudinary } from '@/features/library/queries';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useCreateDocumentAdmin, useFoldersAdmin, useUpdateDocumentAdmin } from './api';
import { buildFolderTree, flattenTree } from '@/lib/folders';
import { Sheet } from './ui';

const EXT: Record<string, FileFormat> = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', xlsx: 'XLSX', html: 'HTML', htm: 'HTML', md: 'MD', markdown: 'MD' };

interface Draft {
  source: 'file' | 'link';
  link: string;
  title: string;
  description: string;
  type: DocumentType | '';
  universityId: string;
  subjectId: string;
  academicTermId: string;
  folderId: string;
  year: string;
  semester: Semester | '';
  schoolYear: string;
  tags: string;
  status: DocumentStatus;
}

const blank = (): Draft => ({
  source: 'file',
  link: '',
  title: '',
  description: '',
  type: '',
  universityId: '',
  subjectId: '',
  academicTermId: '',
  folderId: '',
  year: '1',
  semester: '',
  schoolYear: '2026–2027',
  tags: '',
  status: 'PUBLISHED',
});

const fromDoc = (d: AdminDocumentDto): Draft => ({
  source: d.format === 'LINK' ? 'link' : 'file',
  link: d.format === 'LINK' ? d.fileUrl : '',
  title: d.title,
  description: d.description,
  type: d.type,
  universityId: d.university.id,
  subjectId: d.subject.id,
  academicTermId: d.term?.id ?? '',
  folderId: d.folder?.id ?? '',
  year: String(d.year),
  semester: d.semester,
  schoolYear: d.schoolYear ?? '',
  tags: d.tags.join(', '),
  status: d.status,
});

export interface DocumentDefaults {
  universityId?: string;
  subjectId?: string;
  folderId?: string | null;
}

export function DocumentEditor({ doc, open, onClose, defaults }: { doc: AdminDocumentDto | null; open: boolean; onClose: () => void; defaults?: DocumentDefaults }) {
  const toast = useToast();
  const editing = Boolean(doc);
  const [draft, setDraft] = useState<Draft>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<{ file: File; format: FileFormat } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const uploaded = useRef<{ file: File; url: string; publicId: string; bytes: number; pages?: number } | null>(null);

  const create = useCreateDocumentAdmin();
  const update = useUpdateDocumentAdmin();
  const { data: universities = [] } = useUniversities();
  const { data: subjectPage } = useSubjects({ universityId: draft.universityId || undefined, pageSize: 200 }, { enabled: Boolean(draft.universityId) });
  const { data: terms = [] } = useTerms(draft.universityId || undefined);
  const { data: folders = [] } = useFoldersAdmin(draft.subjectId || undefined);
  const folderOptions = useMemo(() => flattenTree(buildFolderTree(folders)), [folders]);

  useEffect(() => {
    if (!open) return;
    setDraft(doc ? fromDoc(doc) : { ...blank(), universityId: defaults?.universityId ?? '', subjectId: defaults?.subjectId ?? '', folderId: defaults?.folderId ?? '' });
    setErrors({});
    setFile(null);
    setProgress(null);
    uploaded.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key as string]) setErrors(({ [key as string]: _, ...rest }) => rest);
  };

  const provider = useMemo(() => (isWebUrl(draft.link.trim()) ? detectLinkProvider(draft.link.trim()) : null), [draft.link]);

  const accept = (f: File) => {
    const format = MIME_TO_FORMAT[f.type] ?? EXT[(f.name.split('.').pop() ?? '').toLowerCase()];
    if (!format) return setErrors((e) => ({ ...e, fileUrl: 'Chỉ nhận PDF, DOCX, PPTX hoặc XLSX.' }));
    if (f.size > MAX_UPLOAD_BYTES) return setErrors((e) => ({ ...e, fileUrl: `Tệp vượt quá ${fmtBytes(MAX_UPLOAD_BYTES)}.` }));
    setFile({ file: f, format });
    setErrors(({ fileUrl: _, ...rest }) => rest);
    if (!draft.title.trim()) set('title', f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 150));
  };

  const pickTerm = (termId: string) => {
    set('academicTermId', termId);
    const term = terms.find((t) => t.id === termId);
    if (term) setDraft((d) => ({ ...d, academicTermId: termId, semester: term.semester, schoolYear: term.schoolYear }));
  };

  const busy = progress !== null || create.isPending || update.isPending;

  const submit = async () => {
    const meta = {
      title: draft.title,
      description: draft.description,
      type: draft.type || undefined,
      universityId: draft.universityId,
      subjectId: draft.subjectId,
      academicTermId: draft.academicTermId || null,
      folderId: draft.folderId || null,
      year: draft.year,
      semester: draft.semester || undefined,
      schoolYear: draft.schoolYear || undefined,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
      language: 'Vietnamese',
    };

    try {
      if (editing && doc) {
        const parsed = createDocumentSchema.omit({ fileUrl: true, filePublicId: true, fileBytes: true, format: true }).safeParse(meta);
        if (!parsed.success) return showIssues(parsed.error.issues);
        if (doc.format === 'LINK' && !isWebUrl(draft.link.trim())) return setErrors({ fileUrl: 'Dán một liên kết bắt đầu bằng https://' });
        await update.mutateAsync({
          id: doc.id,
          input: { ...parsed.data, status: draft.status, ...(doc.format === 'LINK' && draft.link.trim() !== doc.fileUrl ? { linkUrl: draft.link.trim() } : {}) },
        });
        toast.success('Đã lưu tài liệu', draft.title);
        onClose();
        return;
      }

      let source: { format: FileFormat; fileUrl: string; filePublicId: string; fileBytes: number; pages?: number };
      if (draft.source === 'link') {
        if (!isWebUrl(draft.link.trim())) return setErrors({ fileUrl: 'Dán một liên kết bắt đầu bằng https://' });
        source = { format: 'LINK', fileUrl: draft.link.trim(), filePublicId: '', fileBytes: 0 };
      } else {
        if (!file) return setErrors({ fileUrl: 'Chọn tệp để tải lên.' });
        // Validate the rest before spending time on the upload.
        const pre = createDocumentSchema.safeParse({ ...meta, format: file.format, fileUrl: 'https://placeholder.kaned', filePublicId: 'x', fileBytes: 1 });
        if (!pre.success) return showIssues(pre.error.issues);
        if (uploaded.current?.file !== file.file) {
          setProgress(0);
          const r = await uploadToCloudinary(file.file, setProgress);
          uploaded.current = { file: file.file, url: r.url, publicId: r.publicId, bytes: r.bytes, pages: r.pages };
          setProgress(null);
        }
        const u = uploaded.current!;
        source = { format: file.format, fileUrl: u.url, filePublicId: u.publicId, fileBytes: u.bytes, pages: u.pages };
      }
      const parsed = createDocumentSchema.safeParse({ ...meta, ...source });
      if (!parsed.success) return showIssues(parsed.error.issues);
      await create.mutateAsync({ ...parsed.data, status: draft.status });
      toast.success(draft.status === 'PUBLISHED' ? 'Đã đăng lên thư viện' : 'Đã lưu, đang chờ duyệt', draft.title);
      onClose();
    } catch (e) {
      setProgress(null);
      const err = toApiError(e);
      if (err.fields) setErrors(err.fields);
      toast.error(editing ? 'Không lưu được' : 'Không đăng được', err.message);
    }
  };

  const showIssues = (issues: Array<{ path: Array<string | number>; message: string }>) => {
    const next: Record<string, string> = {};
    for (const i of issues) next[String(i.path[0])] ??= i.message;
    setErrors(next);
    toast.error('Còn vài ô cần sửa', `${Object.keys(next).length} ô được đánh dấu đỏ.`);
  };

  const subjects = subjectPage?.items ?? [];
  const statuses = editing ? DOCUMENT_STATUSES : (['PUBLISHED', 'PENDING'] as const);

  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={editing ? 'Sửa tài liệu' : 'Đăng tài liệu'}
      description={editing ? doc?.title : 'Một tệp từ máy bạn, hoặc liên kết tới Google Slides, Drive, Canva, YouTube…'}
      footer={
        <>
          {editing && doc && (
            <a className="btn btn-ghost" href={`/app/library/${doc.id}`} target="_blank" rel="noreferrer">
              <ExternalLink className="ic ic-sm" />
              Xem trên thư viện
            </a>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className={cn('btn btn-primary', busy && 'is-loading')} onClick={submit} disabled={busy}>
            {editing ? 'Lưu thay đổi' : draft.status === 'PUBLISHED' ? 'Đăng lên thư viện' : 'Lưu chờ duyệt'}
          </button>
        </>
      }
    >
      <section className="sheet-section">
        <div className="sheet-section-head">
          <h3>Nguồn</h3>
          {!editing && (
            <div className="seg" role="group" aria-label="Nguồn tài liệu">
              <button type="button" aria-pressed={draft.source === 'file'} onClick={() => set('source', 'file')}>
                <CloudUpload className="ic ic-sm" />
                Tệp
              </button>
              <button type="button" aria-pressed={draft.source === 'link'} onClick={() => set('source', 'link')}>
                <Link2 className="ic ic-sm" />
                Liên kết
              </button>
            </div>
          )}
        </div>
        {draft.source === 'link' ? (
          <Field
            error={errors.fileUrl ?? errors.linkUrl}
            hint={provider ? `${provider.label} · ${provider.embedUrl ? 'xem được ngay trên trang tài liệu' : 'mở ở tab mới'}` : 'Google Slides, Docs, Drive, Canva, YouTube, Notion… hoặc bất kỳ trang nào.'}
          >
            <div className="input-group">
              <Link2 className="ic ic-sm" />
              <input className="input" type="url" placeholder="https://" value={draft.link} onChange={(e) => set('link', e.target.value)} aria-label="Liên kết" />
            </div>
          </Field>
        ) : editing && doc ? (
          <div className="src-file">
            <FileIcon format={doc.format} size="sm" />
            <div>
              <b>{doc.title}</b>
              <span>
                {doc.format} · {fmtBytes(doc.fileBytes)}
              </span>
            </div>
            <a className="btn btn-ghost btn-sm" href={doc.fileUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="ic ic-sm" />
              Mở tệp
            </a>
          </div>
        ) : (
          <Field error={errors.fileUrl}>
            {file ? (
              <div className="src-file">
                <FileIcon format={file.format} size="sm" />
                <div>
                  <b>{file.file.name}</b>
                  <span>{progress !== null ? `Đang tải lên ${progress}%` : `${fmtBytes(file.file.size)} · sẵn sàng`}</span>
                  {progress !== null && (
                    <div className="src-bar">
                      <i style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
                {progress === null && (
                  <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label="Bỏ tệp">
                    <Trash2 className="ic ic-sm" />
                  </button>
                )}
              </div>
            ) : (
              <div
                className={cn('src-drop', drag && 'drag')}
                role="button"
                tabIndex={0}
                onClick={() => picker.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && picker.current?.click()}
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) accept(f);
                }}
              >
                <FileUp className="ic ic-lg" />
                <b>Kéo thả tệp vào đây, hoặc bấm để chọn</b>
                <span>PDF, DOCX, PPTX, XLSX · tối đa {fmtBytes(MAX_UPLOAD_BYTES)}</span>
                <input
                  ref={picker}
                  type="file"
                  hidden
                  accept=".pdf,.docx,.pptx,.xlsx,.html,.htm,.md,.markdown"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) accept(f);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </Field>
        )}
      </section>

      <section className="sheet-section">
        <h3>Mô tả</h3>
        <Field label="Tiêu đề" htmlFor="ad-title" required error={errors.title}>
          <input id="ad-title" className="input" maxLength={180} value={draft.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Mô tả" htmlFor="ad-desc" required error={errors.description} hint={`${draft.description.trim().length}/30 ký tự tối thiểu`}>
          <textarea id="ad-desc" className="textarea" rows={4} maxLength={2000} value={draft.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="form-grid">
          <Field label="Loại tài liệu" htmlFor="ad-type" required error={errors.type}>
            <select id="ad-type" className="select" value={draft.type} onChange={(e) => set('type', e.target.value as DocumentType)}>
              <option value="">Chọn loại</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t].vi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Thẻ" htmlFor="ad-tags" optional hint="Cách nhau bằng dấu phẩy, tối đa 8.">
            <input id="ad-tags" className="input" placeholder="đề thi, có lời giải" value={draft.tags} onChange={(e) => set('tags', e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="sheet-section">
        <h3>Xếp vào môn học</h3>
        <div className="form-grid">
          <Field label="Trường" htmlFor="ad-uni" required error={errors.universityId}>
            <select
              id="ad-uni"
              className="select"
              value={draft.universityId}
              onChange={(e) => setDraft((d) => ({ ...d, universityId: e.target.value, subjectId: '', academicTermId: '', folderId: '' }))}
            >
              <option value="">Chọn trường</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.nameVi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Môn học" htmlFor="ad-subj" required error={errors.subjectId}>
            <select id="ad-subj" className="select" value={draft.subjectId} disabled={!draft.universityId} onChange={(e) => setDraft((d) => ({ ...d, subjectId: e.target.value, folderId: '' }))}>
              <option value="">{draft.universityId ? 'Chọn môn' : 'Chọn trường trước'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.nameVi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Thư mục" htmlFor="ad-folder" optional error={errors.folderId} hint={draft.subjectId && !folders.length ? 'Môn chưa có thư mục. Tạo ở trang chi tiết môn.' : undefined}>
            <select id="ad-folder" className="select" value={draft.folderId} disabled={!folders.length} onChange={(e) => set('folderId', e.target.value)}>
              <option value="">Không thuộc thư mục nào</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {'\u2003'.repeat(f.depth)}
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kỳ học của trường" htmlFor="ad-term" optional hint={terms.length ? 'Điền sẵn học kỳ và niên khoá.' : 'Trường chưa có kỳ học nào.'}>
            <select id="ad-term" className="select" value={draft.academicTermId} disabled={!terms.length} onChange={(e) => pickTerm(e.target.value)}>
              <option value="">Không chọn</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.state === 'current' ? ' — đang diễn ra' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Năm học của môn" htmlFor="ad-year" required error={errors.year}>
            <select id="ad-year" className="select" value={draft.year} onChange={(e) => set('year', e.target.value)}>
              {STUDY_YEARS.map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Học kỳ" htmlFor="ad-sem" required error={errors.semester}>
            <select id="ad-sem" className="select" value={draft.semester} onChange={(e) => set('semester', e.target.value as Semester)}>
              <option value="">Chọn học kỳ</option>
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {SEMESTER_LABELS[s].vi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Niên khoá" htmlFor="ad-sy" optional error={errors.schoolYear}>
            <input id="ad-sy" className="input" placeholder="2026–2027" value={draft.schoolYear} onChange={(e) => set('schoolYear', e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="sheet-section">
        <h3>Trạng thái</h3>
        <div className="radio-row" role="radiogroup" aria-label="Trạng thái">
          {statuses.map((s) => (
            <label key={s} className="radio-tile">
              <input type="radio" name="ad-status" checked={draft.status === s} onChange={() => set('status', s)} />
              <b>{DOCUMENT_STATUS_LABELS[s].vi}</b>
              <span>{DOCUMENT_STATUS_LABELS[s].hint}</span>
            </label>
          ))}
        </div>
      </section>
    </Sheet>
  );
}
