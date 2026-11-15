import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Save, ShieldCheck, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { STUDY_YEARS, updateProfileSchema, type UpdateProfileInput } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { useFaculties, useMajors, useUniversities } from '@/features/catalog/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtDate, fmtInt } from '@/lib/format';

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: user?.name ?? '',
      bio: user?.bio ?? '',
      universityId: user?.universityId ?? null,
      majorId: user?.majorId ?? null,
      year: user?.year ?? null,
      avatarUrl: user?.avatarUrl ?? null,
    },
  });

  // The profile arrives after the first paint, so sync once it lands.
  useEffect(() => {
    if (!user) return;
    form.reset({
      name: user.name,
      bio: user.bio ?? '',
      universityId: user.universityId,
      majorId: user.majorId,
      year: user.year,
      avatarUrl: user.avatarUrl,
    });
  }, [user, form]);

  const universityId = form.watch('universityId');
  const [facultyId, setFacultyId] = useState('');

  const { data: universities = [] } = useUniversities();
  const { data: faculties = [] } = useFaculties(universityId ?? undefined);
  const { data: majors = [] } = useMajors(universityId ?? undefined);
  const majorsInFaculty = facultyId ? majors.filter((major) => major.facultyId === facultyId) : majors;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateProfile(values);
      toast.success('Đã lưu hồ sơ');
    } catch (error) {
      const err = toApiError(error);
      if (err.fields) {
        for (const [field, message] of Object.entries(err.fields)) {
          form.setError(field as keyof UpdateProfileInput, { message });
        }
      }
      toast.error('Không lưu được hồ sơ', err.message);
    }
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <PageHeader title="Hồ sơ của bạn" subtitle="Trường và ngành quyết định những gì Kaned gợi ý cho bạn." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={onSubmit} noValidate className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Thông tin cá nhân" />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar name={user.name} src={user.avatarUrl} size="xl" />
                <div className="min-w-0 flex-1">
                  <Field label="Ảnh đại diện" htmlFor="avatarUrl" hint="Dán liên kết ảnh, hoặc để trống dùng chữ cái đầu.">
                    <Input id="avatarUrl" placeholder="https://…" {...form.register('avatarUrl')} />
                  </Field>
                </div>
              </div>

              <Field label="Họ và tên" htmlFor="name" error={form.formState.errors.name?.message}>
                <Input id="name" {...form.register('name')} />
              </Field>

              <Field label="Email" hint="Email đăng nhập không đổi được ở đây.">
                <div className="flex h-11 items-center gap-2.5 rounded-[11px] border-[1.5px] border-line bg-paper-2 px-3.5 text-sm text-ink-3">
                  <Mail className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{user.email}</span>
                  {user.hasGoogle && <Badge tone="ok">Google</Badge>}
                </div>
              </Field>

              <Field label="Giới thiệu" htmlFor="bio" hint="Một hai câu để người tải tài liệu biết bạn là ai.">
                <Textarea id="bio" rows={3} placeholder="Sinh viên Kỹ thuật phần mềm, thích thuật toán và cà phê sữa đá." {...form.register('bio')} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Học tập" subtitle="Dùng cho thư viện, công cụ GPA và kế hoạch học tập." />
            <CardBody className="space-y-4">
              <Field label="Trường" htmlFor="profileUniversity">
                <Select
                  id="profileUniversity"
                  {...form.register('universityId', {
                    onChange: () => {
                      setFacultyId('');
                      form.setValue('majorId', null);
                    },
                  })}
                >
                  <option value="">Chưa chọn</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Khoa / Viện" htmlFor="profileFaculty">
                  <Select
                    id="profileFaculty"
                    disabled={!universityId}
                    value={facultyId}
                    onChange={(event) => {
                      setFacultyId(event.target.value);
                      form.setValue('majorId', null);
                    }}
                  >
                    <option value="">Chưa chọn</option>
                    {faculties.map((faculty) => (
                      <option key={faculty.id} value={faculty.id}>
                        {faculty.nameVi}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Ngành" htmlFor="profileMajor">
                  <Select id="profileMajor" disabled={!universityId} {...form.register('majorId')}>
                    <option value="">Chưa chọn</option>
                    {majorsInFaculty.map((major) => (
                      <option key={major.id} value={major.id}>
                        {major.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Năm học" htmlFor="profileYear">
                <Select id="profileYear" {...form.register('year')}>
                  <option value="">Chưa chọn</option>
                  {STUDY_YEARS.map((year) => (
                    <option key={year} value={year}>
                      Năm {year}
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" icon={<Save className="size-[18px]" />} loading={form.formState.isSubmitting}>
              Lưu thay đổi
            </Button>
          </div>
        </form>

        <div className="space-y-4 lg:sticky lg:top-[88px] lg:self-start">
          <Card>
            <CardHeader title="Đóng góp của bạn" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-2.5 text-center">
                <div className="rounded-lg bg-paper-2 py-3">
                  <dt className="text-xs text-ink-4">Tài liệu</dt>
                  <dd className="tabular text-xl font-semibold">{user.stats?.uploads ?? 0}</dd>
                </div>
                <div className="rounded-lg bg-paper-2 py-3">
                  <dt className="text-xs text-ink-4">Lượt tải</dt>
                  <dd className="tabular text-xl font-semibold">{fmtInt(user.stats?.downloadsReceived ?? 0)}</dd>
                </div>
              </dl>
              <p className="mt-3.5 text-[12.5px] text-ink-4">Tham gia từ {fmtDate(user.createdAt)}</p>
              <Link
                to="/app/upload"
                className="mt-3.5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[11px] border-[1.5px] border-line-2 text-sm font-semibold text-ink-2 transition-colors hover:border-brand-200 hover:text-brand"
              >
                <Upload className="size-4" aria-hidden />
                Chia sẻ thêm tài liệu
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-ink-4" aria-hidden />
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                Chỉ tên, ảnh và phần giới thiệu của bạn hiện công khai trên tài liệu bạn chia sẻ. Email và điểm số luôn
                riêng tư.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
