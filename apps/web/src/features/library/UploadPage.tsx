import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, CloudUpload, FileUp, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  createDocumentSchema,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  MAX_UPLOAD_BYTES,
  MIME_TO_FORMAT,
  SEMESTERS,
  SEMESTER_LABELS,
  STUDY_YEARS,
  type CreateDocumentInput,
  type FileFormat,
} from '@kaned/shared';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { FileBadge } from '@/components/ui/FileBadge';
import { Progress } from '@/components/ui/Feedback';
import { Tag } from '@/components/ui/Badge';
import { useCreateDocument, uploadToCloudinary } from './queries';
import { useSubjects, useUniversities } from '@/features/catalog/queries';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Staged {
  file: File;
  format: FileFormat;
}

export function UploadPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const createDocument = useCreateDocument();
  const { data: universities = [] } = useUniversities();

  const form = useForm<CreateDocumentInput>({
    resolver: zodResolver(createDocumentSchema),
    defaultValues: {
      title: '',
      description: '',
      type: 'EXAM',
      universityId: '',
      subjectId: '',
      year: 3,
      semester: 'S1',
      tags: [],
      language: 'Vietnamese',
      fileUrl: '',
      filePublicId: '',
      fileBytes: 0,
    },
  });

  const universityId = form.watch('universityId');
  const tags = form.watch('tags') ?? [];
  const { data: subjectPage } = useSubjects({ universityId: universityId || undefined, pageSize: 200 });
  const subjects = subjectPage?.items ?? [];

  const accept = (file: File) => {
    const format = MIME_TO_FORMAT[file.type];
    if (!format) {
      toast.error('Định dạng không hỗ trợ', 'Chỉ nhận PDF, DOCX, PPTX hoặc XLSX.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Tệp quá lớn', `Giới hạn ${fmtBytes(MAX_UPLOAD_BYTES)} cho mỗi tệp.`);
      return;
    }
    setStaged({ file, format });
    form.setValue('format', format);
    form.setValue('fileBytes', file.size);
    if (!form.getValues('title')) {
      form.setValue('title', file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value || tags.includes(value) || tags.length >= 8) return;
    form.setValue('tags', [...tags, value]);
    setTagDraft('');
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!staged) {
      toast.error('Chưa chọn tệp', 'Kéo tệp vào khung hoặc bấm để chọn.');
      return;
    }
    try {
      setProgress(0);
      const uploaded = await uploadToCloudinary(staged.file, setProgress);
      const created = await createDocument.mutateAsync({
        ...values,
        fileUrl: uploaded.url,
        filePublicId: uploaded.publicId,
        fileBytes: uploaded.bytes,
        pages: uploaded.pages,
      });
      toast.success('Đã tải lên', 'Tài liệu sẽ hiển thị trong thư viện sau khi kiểm duyệt.');
      navigate(`/app/library/${created.id}`);
    } catch (error) {
      const err = toApiError(error);
      if (err.fields) {
        for (const [field, message] of Object.entries(err.fields)) {
          form.setError(field as keyof CreateDocumentInput, { message });
        }
      }
      toast.error('Không tải lên được', err.message);
    } finally {
      setProgress(null);
    }
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chia sẻ tài liệu"
        subtitle="Mỗi tài liệu bạn chia sẻ giúp một lớp khác đỡ phải hỏi khắp nhóm. Mất khoảng hai phút."
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {/* Dropzone */}
          <Card>
            <CardHeader title="Tệp tài liệu" subtitle={`PDF, DOCX, PPTX hoặc XLSX, tối đa ${fmtBytes(MAX_UPLOAD_BYTES)}.`} />
            <CardBody>
              {staged ? (
                <div className="flex items-center gap-4 rounded-xl border border-line bg-paper-2 p-4">
                  <FileBadge format={staged.format} bytes={staged.file.size} className="bg-paper shadow-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{staged.file.name}</p>
                    <p className="text-[13px] text-ink-3">{fmtBytes(staged.file.size)}</p>
                    {progress !== null && (
                      <div className="mt-2">
                        <Progress value={progress} />
                        <p className="tabular mt-1 text-xs text-ink-3">Đang tải lên {progress}%</p>
                      </div>
                    )}
                  </div>
                  {progress === null && (
                    <IconButton label="Bỏ tệp này" onClick={() => setStaged(null)}>
                      <Trash2 className="size-[18px]" />
                    </IconButton>
                  )}
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) accept(file);
                  }}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                    dragging ? 'border-brand bg-brand-50' : 'border-line-2 bg-paper-2 hover:border-brand-200',
                  )}
                >
                  <CloudUpload className={cn('size-11 transition-colors', dragging ? 'text-brand' : 'text-ink-4')} aria-hidden />
                  <p className="mt-3.5 font-semibold">Kéo tệp vào đây</p>
                  <p className="mt-1 text-sm text-ink-3">hoặc bấm để chọn từ máy của bạn</p>
                  <input
                    ref={inputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.docx,.pptx,.xlsx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) accept(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader title="Thông tin tài liệu" subtitle="Ghi đúng mã môn và học kỳ để người khác tìm được." />
            <CardBody className="space-y-4">
              <Field label="Tiêu đề" htmlFor="title" error={form.formState.errors.title?.message}>
                <Input id="title" placeholder="Đề thi cuối kỳ CSD201 — Fall 2025 kèm lời giải" {...form.register('title')} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Trường" htmlFor="universityId" error={form.formState.errors.universityId?.message}>
                  <Select
                    id="universityId"
                    {...form.register('universityId', { onChange: () => form.setValue('subjectId', '') })}
                  >
                    <option value="">Chọn trường</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Môn học" htmlFor="subjectId" error={form.formState.errors.subjectId?.message}>
                  <Select id="subjectId" disabled={!universityId} {...form.register('subjectId')}>
                    <option value="">{universityId ? 'Chọn môn học' : 'Chọn trường trước'}</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Loại tài liệu" error={form.formState.errors.type?.message}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DOCUMENT_TYPES.map((type) => (
                    <label key={type} className="block">
                      <input type="radio" value={type} className="peer sr-only" {...form.register('type')} />
                      <span className="flex h-11 cursor-pointer items-center gap-2 rounded-[11px] border-[1.5px] border-line bg-paper-2 px-3 text-[13.5px] font-medium text-ink-2 transition-all peer-checked:border-brand peer-checked:bg-brand-50 peer-checked:text-brand-700 hover:border-brand-200">
                        <span aria-hidden>{DOCUMENT_TYPE_LABELS[type].icon}</span>
                        {DOCUMENT_TYPE_LABELS[type].vi}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Năm học" htmlFor="year" error={form.formState.errors.year?.message}>
                  <Select id="year" {...form.register('year')}>
                    {STUDY_YEARS.map((year) => (
                      <option key={year} value={year}>
                        Năm {year}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Học kỳ" htmlFor="semester" error={form.formState.errors.semester?.message}>
                  <Select id="semester" {...form.register('semester')}>
                    {SEMESTERS.map((s) => (
                      <option key={s} value={s}>
                        {SEMESTER_LABELS[s].vi}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Niên khoá" htmlFor="schoolYear" hint="Ví dụ: 2025-2026">
                  <Input id="schoolYear" placeholder="2025-2026" {...form.register('schoolYear')} />
                </Field>
              </div>

              <Field
                label="Mô tả"
                htmlFor="description"
                hint="Nói rõ tài liệu gồm những gì, có lời giải chưa, nguồn từ lớp nào."
                error={form.formState.errors.description?.message}
              >
                <Textarea
                  id="description"
                  rows={5}
                  placeholder="Đề thi cuối kỳ gồm 6 câu tự luận về cây AVL, bảng băm và đồ thị. Có lời giải chi tiết do mình tự làm và đối chiếu với đáp án của giảng viên…"
                  {...form.register('description')}
                />
              </Field>

              <Field label="Thẻ" hint="Tối đa 8 thẻ. Enter để thêm.">
                <div className="flex gap-2">
                  <Input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="có lời giải, cuối kỳ, AVL…"
                  />
                  <Button type="button" variant="secondary" onClick={addTag} icon={<Plus className="size-4" />}>
                    Thêm
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Tag key={tag}>
                        {tag}
                        <button
                          type="button"
                          onClick={() => form.setValue('tags', tags.filter((t) => t !== tag))}
                          aria-label={`Bỏ thẻ ${tag}`}
                          className="ml-1 rounded hover:text-ink"
                        >
                          <X className="size-3" />
                        </button>
                      </Tag>
                    ))}
                  </div>
                )}
              </Field>
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:sticky lg:top-[88px] lg:self-start">
          <Card>
            <CardBody>
              <Button
                type="submit"
                size="lg"
                block
                icon={<FileUp className="size-[18px]" />}
                loading={progress !== null || createDocument.isPending}
                disabled={!staged}
              >
                Tải lên tài liệu
              </Button>
              <p className="mt-3 text-center text-xs leading-relaxed text-ink-4">
                Bằng việc tải lên, bạn xác nhận mình có quyền chia sẻ tài liệu này.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Trước khi tải lên" />
            <CardBody>
              <ul className="space-y-3 text-[13.5px] text-ink-2">
                {[
                  'Tệp rõ nét, đọc được toàn bộ nội dung',
                  'Không có tên, mã số sinh viên của người khác',
                  'Không phải tài liệu bán hoặc có bản quyền của trung tâm',
                  'Ghi đúng mã môn để lớp sau tìm được',
                ].map((rule) => (
                  <li key={rule} className="flex gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-ok)]" aria-hidden />
                    {rule}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2.5 rounded-xl border border-dashed border-line-2 bg-paper-2 p-3 text-[12.5px] leading-relaxed text-ink-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
                Tài liệu vi phạm sẽ được gỡ trong 24 giờ kể từ khi có báo cáo.
              </div>
            </CardBody>
          </Card>
        </div>
      </form>
    </div>
  );
}
