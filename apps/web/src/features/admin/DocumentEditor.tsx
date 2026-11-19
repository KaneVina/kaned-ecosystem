import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudUpload, ExternalLink, FileUp, Github, Link2, Trash2 } from 'lucide-react';
import {
  createDocumentSchema,
  detectLinkProvider,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  isExternalFormat,
  isWebUrl,
  normalizeGithubInput,
  MAX_UPLOAD_BYTES,
  MIME_TO_FORMAT,
  type AdminDocumentDto,
  type DocumentStatus,
  type DocumentType,
  type FileFormat,
  type Semester,
} from '@kaned/shared';
import { Field } from '@/components/ui/Field';
import { InternalFields } from '@/components/library/InternalFields';
import { mergeTags, PlacementFields, TagInput, TypePicker } from '@/components/documents/DocumentFields';
import { GithubSource, githubStatusMessage, githubStatusUsable, type GithubStatus } from '@/components/documents/GithubSource';
import { useAuth } from '@/providers/AuthProvider';
import { FileIcon } from '@/components/ui/FileBadge';
import { useSubjects } from '@/features/catalog/queries';
import { uploadToCloudinary } from '@/features/library/queries';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useCreateDocumentAdmin, useUpdateDocumentAdmin } from './api';
import { Sheet } from './ui';

const EXT: Record<string, FileFormat> = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', xlsx: 'XLSX', html: 'HTML', htm: 'HTML', md: 'MD', markdown: 'MD' };

interface Draft {
  source: 'file' | 'link' | 'github';
  link: string;
  guide: string;
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
  tags: string[];
  lecturer: string;
  period: string;
  status: DocumentStatus;
  internal: boolean;
  allowDownload: boolean;
  allowShare: boolean;
}

const blank = (): Draft => ({
  source: 'file',
  link: '',
  guide: '',
  title: '',
  description: '',
  type: '',
  universityId: '',
  subjectId: '',
  academicTermId: '',
  folderId: '',
  year: '1',
  semester: '',
  schoolYear: '',
  tags: [],
  lecturer: '',
  period: '',
  status: 'PUBLISHED',
  internal: false,
  allowDownload: true,
  allowShare: true,
});

const fromDoc = (d: AdminDocumentDto): Draft => ({
  source: d.format === 'LINK' ? 'link' : d.format === 'GITHUB' ? 'github' : 'file',
  link: isExternalFormat(d.format) ? d.fileUrl : '',
  guide: d.guide ?? '',
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
  tags: d.tags,
  lecturer: d.lecturer ?? '',
  period: d.period ?? '',
  status: d.status,
  internal: d.internal,
  allowDownload: d.allowDownload,
  allowShare: d.allowShare,
});

export interface DocumentDefaults {
  universityId?: string;
  subjectId?: string;
  folderId?: string | null;
}

export function DocumentEditor({ doc, open, onClose, defaults }: { doc: AdminDocumentDto | null; open: boolean; onClose: () => void; defaults?: DocumentDefaults }) {
  const toast = useToast();
  const { user } = useAuth();
  const [tagDraft, setTagDraft] = useState('');
  const editing = Boolean(doc);
  const [draft, setDraft] = useState<Draft>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<{ file: File; format: FileFormat } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [ghStatus, setGhStatus] = useState<GithubStatus>('empty');
  const picker = useRef<HTMLInputElement>(null);
  const uploaded = useRef<{ file: File; url: string; publicId: string; bytes: number; pages?: number } | null>(null);

  const create = useCreateDocumentAdmin();
  const update = useUpdateDocumentAdmin();
  const { data: subjectPage } = useSubjects({ universityId: draft.universityId || undefined, pageSize: 200 }, { enabled: Boolean(draft.universityId) });

  useEffect(() => {
    if (!open) return;
    setDraft(doc ? fromDoc(doc) : { ...blank(), universityId: defaults?.universityId ?? user?.university?.id ?? '', subjectId: defaults?.subjectId ?? '', folderId: defaults?.folderId ?? '' });
    setErrors({});
    setTagDraft('');
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
    if (!format) return setErrors((e) => ({ ...e, fileUrl: 'Chỉ nhận PDF, DOCX, PPTX, XLSX, HTML hoặc MD.' }));
    if (f.size > MAX_UPLOAD_BYTES) return setErrors((e) => ({ ...e, fileUrl: `Tệp vượt quá ${fmtBytes(MAX_UPLOAD_BYTES)}.` }));
    setFile({ file: f, format });
    setErrors(({ fileUrl: _, ...rest }) => rest);
    if (!draft.title.trim()) set('title', f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 150));
  };

  const busy = progress !== null || create.isPending || update.isPending;

  // A pasted GitHub address fills the title and description, only where they are still empty.
  // An earlier suggestion the admin has not touched is replaced by the newer one.
  const suggested = useRef({ title: '', description: '' });
  const suggestFromGithub = useCallback(({ title, description }: { title: string; description: string }) => {
    const prev = suggested.current;
    suggested.current = { title, description };
    setDraft((d) => ({
      ...d,
      title: title && (!d.title.trim() || d.title.trim() === prev.title) ? title : d.title,
      description: description && (!d.description.trim() || d.description.trim() === prev.description) ? description : d.description,
    }));
  }, []);

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
      tags: mergeTags(draft.tags, tagDraft),
      lecturer: draft.lecturer.trim() || undefined,
      period: draft.period || undefined,
      language: 'Vietnamese',
      ...(draft.source === 'github' ? { guide: draft.guide.trim() || null } : {}),
      internal: draft.internal,
      allowDownload: !draft.internal || draft.allowDownload,
      allowShare: !draft.internal || draft.allowShare,
    };

    try {
      if (editing && doc) {
        const parsed = createDocumentSchema.omit({ fileUrl: true, filePublicId: true, fileBytes: true, format: true }).safeParse(meta);
        if (!parsed.success) return showIssues(parsed.error.issues);
        if (doc.format === 'LINK' && !isWebUrl(draft.link.trim())) return setErrors({ fileUrl: 'Dán một liên kết bắt đầu bằng https://' });
        if (doc.format === 'GITHUB' && !githubStatusUsable(ghStatus)) return setErrors({ fileUrl: githubStatusMessage(ghStatus) });
        await update.mutateAsync({
          id: doc.id,
          input: { ...parsed.data, status: draft.status, ...(isExternalFormat(doc.format) && draft.link.trim() !== doc.fileUrl ? { linkUrl: doc.format === 'GITHUB' ? normalizeGithubInput(draft.link) : draft.link.trim() } : {}) },
        });
        toast.success('Đã lưu tài liệu', draft.title);
        onClose();
        return;
      }

      let source: { format: FileFormat; fileUrl: string; filePublicId: string; fileBytes: number; pages?: number };
      if (draft.source === 'link') {
        if (!isWebUrl(draft.link.trim())) return setErrors({ fileUrl: 'Dán một liên kết bắt đầu bằng https://' });
        source = { format: 'LINK', fileUrl: draft.link.trim(), filePublicId: '', fileBytes: 0 };
      } else if (draft.source === 'github') {
        if (!githubStatusUsable(ghStatus)) return setErrors({ fileUrl: githubStatusMessage(ghStatus) });
        source = { format: 'GITHUB', fileUrl: normalizeGithubInput(draft.link), filePublicId: '', fileBytes: 0 };
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

  const subject = (subjectPage?.items ?? []).find((x) => x.id === draft.subjectId);
  const statuses = editing ? DOCUMENT_STATUSES : (['PUBLISHED', 'PENDING'] as const);

  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={editing ? 'Sửa tài liệu' : 'Đăng tài liệu'}
      description={editing ? doc?.title : 'Một tệp từ máy bạn, một liên kết (Google Slides, Drive, Canva, YouTube…) hoặc tài liệu trên GitHub.'}
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
              <button type="button" aria-pressed={draft.source === 'github'} onClick={() => set('source', 'github')}>
                <Github className="ic ic-sm" />
                GitHub
              </button>
            </div>
          )}
        </div>
        {draft.source === 'github' ? (
          <GithubSource
            id="ad-gh"
            value={draft.link}
            onChange={(url) => {
              set('link', url);
              setErrors(({ fileUrl: _a, linkUrl: _b, ...rest }) => rest);
            }}
            guide={draft.guide}
            onGuide={(text) => set('guide', text)}
            onStatus={setGhStatus}
            onSuggest={editing ? undefined : suggestFromGithub}
            error={errors.fileUrl ?? errors.linkUrl}
          />
        ) : draft.source === 'link' ? (
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
                <span>PDF, DOCX, PPTX, XLSX, HTML, MD · tối đa {fmtBytes(MAX_UPLOAD_BYTES)}</span>
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
        <h3>Mô tả tài liệu</h3>
        <Field label="Tiêu đề" htmlFor="ad-title" required error={errors.title} hint={`Ghi rõ môn, chương hoặc kỳ thi. ${draft.title.length}/150`}>
          <input
            id="ad-title"
            className="input"
            maxLength={150}
            placeholder="Ví dụ: Đề thi cuối kỳ CSD201 – Spring 2026 (có đáp án)"
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
        <Field label="Mô tả" htmlFor="ad-desc" required error={errors.description} hint={`Ít nhất 30 ký tự. ${draft.description.length}/1000`}>
          <textarea
            id="ad-desc"
            className="textarea"
            rows={4}
            maxLength={1000}
            placeholder="Bên trong có gì, gồm những chương nào, có đáp án không…"
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <TypePicker name="ad-type" value={draft.type} invalid={Boolean(errors.type)} onChange={(t) => set('type', t)} />
        <TagInput
          id="ad-tags"
          value={draft.tags}
          onChange={(tags) => set('tags', tags)}
          draft={tagDraft}
          onDraft={setTagDraft}
          suggestions={subject ? [subject.code, subject.nameVi.toLowerCase()] : []}
        />
      </section>

      <section className="sheet-section">
        <h3>Xếp vào môn học</h3>
        <PlacementFields
          idPrefix="ad"
          autoPickTerm={!editing}
          value={draft}
          onChange={(patch) => {
            setDraft((d) => ({ ...d, ...patch, year: patch.year !== undefined ? String(patch.year) : d.year }));
            setErrors((e) => {
              const next = { ...e };
              for (const k of Object.keys(patch)) delete next[k];
              if (patch.academicTermId) delete next.semester;
              return next;
            });
          }}
          errors={{ universityId: Boolean(errors.universityId), subjectId: Boolean(errors.subjectId), semester: Boolean(errors.semester), year: Boolean(errors.year) }}
        />
      </section>

      <section className="sheet-section">
        <h3>Chế độ lưu hành</h3>
        <InternalFields
          value={{ internal: draft.internal, allowDownload: draft.allowDownload, allowShare: draft.allowShare }}
          onChange={(v) => setDraft((d) => ({ ...d, ...v }))}
          source={draft.source}
          provider={draft.source === 'link' && isWebUrl(draft.link.trim()) ? detectLinkProvider(draft.link.trim()) : null}
        />
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
