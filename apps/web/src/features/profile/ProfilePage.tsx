import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bookmark, Building2, CalendarDays, Clock, CloudUpload, Compass, FileText, GraduationCap, Pencil, X } from 'lucide-react';
import { STUDY_YEARS, updateProfileSchema, type DocumentSummaryDto, type UpdateProfileInput } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { DocCard, DocCardSkeleton } from '@/components/library/DocCard';
import { QuickPreview } from '@/components/library/QuickPreview';
import { useDocuments, useDownload, useSavedDocuments, useToggleBookmark } from '@/features/library/queries';
import { useMajors, useUniversities } from '@/features/catalog/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { avatarColor, fmtDate, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';

type Tab = 'saved' | 'uploads';

/** Empty selects and inputs mean “not set”, which the API spells null. */
const emptyToNull = (v: unknown) => (v === '' ? null : v);
const profileFormSchema = updateProfileSchema.extend({
  bio: z.preprocess(emptyToNull, updateProfileSchema.shape.bio),
  avatarUrl: z.preprocess(emptyToNull, updateProfileSchema.shape.avatarUrl),
  universityId: z.preprocess(emptyToNull, updateProfileSchema.shape.universityId),
  majorId: z.preprocess(emptyToNull, updateProfileSchema.shape.majorId),
  year: z.preprocess(emptyToNull, updateProfileSchema.shape.year),
});

function EditProfile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const form = useForm<UpdateProfileInput>({ resolver: zodResolver(profileFormSchema) as never });
  const universityId = form.watch('universityId');
  const { data: universities = [] } = useUniversities();
  const { data: majors = [] } = useMajors(universityId ?? undefined);

  useEffect(() => {
    if (open && user) {
      form.reset({
        name: user.name,
        bio: user.bio ?? '',
        avatarUrl: user.avatarUrl ?? '',
        universityId: user.universityId,
        majorId: user.majorId,
        year: user.year,
      });
    }
  }, [open, user, form]);

  // Majors load after the university is known; put the saved major back once they arrive.
  useEffect(() => {
    if (open && majors.length) form.setValue('majorId', form.getValues('majorId'));
  }, [open, majors.length, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateProfile(values);
      toast.success('Đã lưu hồ sơ');
      onClose();
    } catch (e) {
      const err = toApiError(e);
      if (err.fields) for (const [f, m] of Object.entries(err.fields)) form.setError(f as keyof UpdateProfileInput, { message: m });
      toast.error('Không lưu được hồ sơ', err.message);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sửa hồ sơ"
      description="Trường và ngành quyết định chương trình học Kaned dùng để gợi ý môn cho bạn."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" form="edit-profile" className={cn('btn btn-primary', form.formState.isSubmitting && 'is-loading')}>
            Lưu thay đổi
          </button>
        </>
      }
    >
      <form id="edit-profile" onSubmit={onSubmit} className="stack-form" noValidate>
        <Field label="Họ và tên" htmlFor="pf-name" error={form.formState.errors.name?.message}>
          <Input id="pf-name" {...form.register('name')} />
        </Field>
        <Field label="Giới thiệu" htmlFor="pf-bio" optional hint="Một hai câu để người tải tài liệu của bạn biết bạn là ai.">
          <Textarea id="pf-bio" rows={3} maxLength={280} {...form.register('bio')} />
        </Field>
        <Field label="Ảnh đại diện" htmlFor="pf-av" optional error={form.formState.errors.avatarUrl?.message} hint="Dán liên kết ảnh, hoặc để trống để dùng chữ cái đầu tên.">
          <Input id="pf-av" placeholder="https://…" {...form.register('avatarUrl')} />
        </Field>
        <Field label="Trường" htmlFor="pf-uni">
          <Select id="pf-uni" {...form.register('universityId', { onChange: () => form.setValue('majorId', null) })}>
            <option value="">Chưa chọn</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="form-grid">
          <Field label="Ngành" htmlFor="pf-major">
            <Select id="pf-major" disabled={!universityId} {...form.register('majorId')}>
              <option value="">Chưa chọn</option>
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameVi}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Năm học" htmlFor="pf-year">
            <Select id="pf-year" {...form.register('year')}>
              <option value="">Chưa chọn</option>
              {STUDY_YEARS.map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function ProfilePage({ defaultTab = 'uploads' }: { defaultTab?: Tab }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'saved' || params.get('tab') === 'uploads' ? (params.get('tab') as Tab) : defaultTab;
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<DocumentSummaryDto | null>(null);
  const toggleBookmark = useToggleBookmark();
  const download = useDownload();

  const { data: saved, isLoading: loadingSaved } = useSavedDocuments();
  const { data: uploads, isLoading: loadingUploads } = useDocuments({ uploaderId: user?.id, sort: 'recent', pageSize: 48 }, { enabled: Boolean(user) });

  if (!user) return null;
  const list = tab === 'saved' ? (saved ?? []) : (uploads?.items ?? []);
  const loading = tab === 'saved' ? loadingSaved : loadingUploads;
  const avgRating = uploads?.items.length ? uploads.items.reduce((n, d) => n + d.ratingAvg, 0) / uploads.items.length : 0;

  return (
    <>
      <div className="profile-cover" style={{ ['--uc' as string]: user.university?.color ?? avatarColor(user.name) }}>
        <div className="entity-paper" aria-hidden />
      </div>
      <div className="container profile-head">
        <Avatar name={user.name} src={user.avatarUrl} size="xl" />
        <div className="ph-info">
          <div className="ph-name">
            <h1 className="t-h1">{user.name}</h1>
            {user.hasGoogle && <span className="badge badge-blue">Google</span>}
          </div>
          <ul className="eh-meta">
            {user.university && (
              <li>
                <Building2 className="ic ic-sm" />
                {user.university.name}
              </li>
            )}
            {user.major && (
              <li>
                <GraduationCap className="ic ic-sm" />
                {user.major.name}
              </li>
            )}
            {user.year && (
              <li>
                <CalendarDays className="ic ic-sm" />
                Năm {user.year}
              </li>
            )}
            <li>
              <Clock className="ic ic-sm" />
              Tham gia {fmtDate(user.createdAt)}
            </li>
          </ul>
          <p className="ph-bio">{user.bio || 'Chưa có giới thiệu. Thêm vài dòng để người tải tài liệu của bạn biết bạn là ai.'}</p>
        </div>
        <div className="ph-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            <Pencil className="ic ic-sm" />
            Sửa hồ sơ
          </button>
          <Link className="btn btn-primary" to="/app/upload">
            <CloudUpload className="ic ic-sm" />
            Tải lên
          </Link>
        </div>
      </div>

      <div className="container">
        <dl className="profile-stats">
          <div>
            <dt>Tài liệu đã đăng</dt>
            <dd>{user.stats?.uploads ?? uploads?.total ?? 0}</dd>
          </div>
          <div>
            <dt>Lượt tải nhận được</dt>
            <dd>{fmtInt(user.stats?.downloadsReceived ?? 0)}</dd>
          </div>
          <div>
            <dt>Điểm đánh giá TB</dt>
            <dd>{avgRating ? avgRating.toFixed(1) : '–'}</dd>
          </div>
          <div>
            <dt>Đã lưu</dt>
            <dd>{saved?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Đánh giá đã viết</dt>
            <dd>{user.stats?.reviews ?? 0}</dd>
          </div>
        </dl>

        <div className="tabs profile-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'saved'} onClick={() => setParams({ tab: 'saved' })}>
            <Bookmark className="ic ic-sm" />
            Đã lưu<span className="count">{saved?.length ?? 0}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'uploads'} onClick={() => setParams({ tab: 'uploads' })}>
            <FileText className="ic ic-sm" />
            Đã đăng<span className="count">{uploads?.total ?? 0}</span>
          </button>
        </div>

        <div className="profile-body">
          {loading ? (
            <div className="grid-docs grid-4">
              {Array.from({ length: 4 }, (_, i) => (
                <DocCardSkeleton key={i} />
              ))}
            </div>
          ) : !list.length ? (
            tab === 'saved' ? (
              <EmptyState
                title="Chưa lưu tài liệu nào"
                description="Bấm biểu tượng đánh dấu trên bất kỳ tài liệu nào để dành lại đây cho mùa thi."
                action={
                  <Link className="btn btn-primary" to="/app/library">
                    <Compass className="ic ic-sm" />
                    Mở thư viện
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title="Bạn chưa đăng tài liệu nào"
                description="Chia sẻ ghi chép hay đề thi của một môn bạn đã học. Mất khoảng hai phút."
                action={
                  <Link className="btn btn-primary" to="/app/upload">
                    <CloudUpload className="ic ic-sm" />
                    Chia sẻ tài liệu
                  </Link>
                }
              />
            )
          ) : (
            <div className="grid-docs grid-4">
              {list.map((d) =>
                tab === 'saved' ? (
                  <div key={d.id} className="saved-item">
                    <DocCard doc={d} onToggleBookmark={(id) => toggleBookmark.mutate(id)} onPreview={setPreview} />
                    <button type="button" className="saved-remove" onClick={() => toggleBookmark.mutate(d.id)}>
                      <X className="ic ic-xs" />
                      Bỏ khỏi đã lưu
                    </button>
                  </div>
                ) : (
                  <DocCard key={d.id} doc={d} onToggleBookmark={(id) => toggleBookmark.mutate(id)} onPreview={setPreview} />
                ),
              )}
            </div>
          )}
        </div>
      </div>

      <EditProfile open={editing} onClose={() => setEditing(false)} />
      <QuickPreview
        doc={preview ? (list.find((d) => d.id === preview.id) ?? preview) : null}
        onClose={() => setPreview(null)}
        onToggleBookmark={(id) => toggleBookmark.mutate(id)}
        onDownload={(d) => download.mutate(d.id, { onSuccess: ({ fileUrl }) => window.open(fileUrl, '_blank', 'noopener') })}
        downloading={download.isPending}
      />
    </>
  );
}
