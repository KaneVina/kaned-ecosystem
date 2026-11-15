import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { registerSchema, STUDY_YEARS, type RegisterInput } from '@kaned/shared';
import { AuthLayout } from './AuthLayout';
import { GoogleButton } from './GoogleButton';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useMajors, useUniversities } from '@/features/catalog/queries';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Registration runs in two steps so the first screen stays short. */
export function RegisterPage() {
  const { register: signUp, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', universityId: null, majorId: null, year: 3 },
  });

  const universityId = form.watch('universityId');
  const { data: universities = [] } = useUniversities();
  const { data: majors = [] } = useMajors(universityId ?? undefined);

  const goToStep2 = async () => {
    const valid = await form.trigger(['name', 'email', 'password']);
    if (valid) setStep(2);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signUp(values);
      toast.success(`Chào mừng ${values.name.split(' ').slice(-1)[0]} đến với Kaned`, 'Tài khoản dùng chung cho mọi module.');
      navigate('/app', { replace: true });
    } catch (error) {
      const err = toApiError(error);
      if (err.fields) {
        for (const [field, message] of Object.entries(err.fields)) {
          form.setError(field as keyof RegisterInput, { message });
        }
        if (err.fields.email || err.fields.password || err.fields.name) setStep(1);
      }
      toast.error('Không tạo được tài khoản', err.message);
    }
  });

  const handleGoogle = async (credential: string) => {
    try {
      await loginWithGoogle(credential);
      navigate('/app', { replace: true });
    } catch (error) {
      toast.error('Không đăng ký được bằng Google', toApiError(error).message);
    }
  };

  return (
    <AuthLayout
      eyebrow="Tạo tài khoản"
      title="Tham gia hệ sinh thái"
      subtitle="Một tài khoản cho thư viện và mọi công cụ đi kèm. Miễn phí cho sinh viên."
      footer={
        <>
          Khi tiếp tục, bạn đồng ý với <Link to="/register" className="underline">Điều khoản sử dụng</Link> và{' '}
          <Link to="/register" className="underline">Chính sách riêng tư</Link>.
        </>
      }
    >
      <div className="mb-6 flex items-center gap-3">
        <span className={cn('h-[3px] flex-1 rounded-full', 'bg-brand')} />
        <span className={cn('h-[3px] flex-1 rounded-full transition-colors', step === 2 ? 'bg-brand' : 'bg-line')} />
        <span className="tabular shrink-0 text-xs text-ink-3">Bước {step} / 2</span>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {step === 1 ? (
          <div className="animate-fade-in space-y-4">
            <Field label="Họ và tên" htmlFor="name" error={form.formState.errors.name?.message}>
              <Input id="name" autoComplete="name" placeholder="Trần Bảo Ngọc" {...form.register('name')} />
            </Field>

            <Field label="Email sinh viên" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" placeholder="ngoc.tb@fpt.edu.vn" {...form.register('email')} />
            </Field>

            <Field
              label="Mật khẩu"
              htmlFor="password"
              hint="Ít nhất 8 ký tự."
              error={form.formState.errors.password?.message}
            >
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-11"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-sunk hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
            </Field>

            <Button type="button" size="lg" block onClick={goToStep2} iconEnd={<ArrowRight className="size-4" />}>
              Tiếp tục
            </Button>
          </div>
        ) : (
          <div className="animate-fade-in space-y-4">
            <Field label="Trường" htmlFor="universityId" error={form.formState.errors.universityId?.message}>
              <Select
                id="universityId"
                {...form.register('universityId', {
                  onChange: () => form.setValue('majorId', null),
                })}
              >
                <option value="">Chọn trường của bạn</option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Ngành" htmlFor="majorId" error={form.formState.errors.majorId?.message}>
              <Select id="majorId" disabled={!universityId} {...form.register('majorId')}>
                <option value="">{universityId ? 'Chọn ngành học' : 'Chọn trường trước'}</option>
                {majors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.nameVi}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Năm học">
              <div className="flex gap-2">
                {STUDY_YEARS.map((year) => (
                  <label key={year} className="flex-1">
                    <input type="radio" value={year} className="peer sr-only" {...form.register('year')} />
                    <span
                      className={cn(
                        'grid h-11 cursor-pointer place-items-center rounded-[11px] border-[1.5px] border-line bg-paper-2 text-sm font-medium text-ink-2 transition-all',
                        'peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white hover:border-brand-200',
                      )}
                    >
                      Năm {year}
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <div className="flex gap-2.5 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setStep(1)}
                icon={<ArrowLeft className="size-4" />}
              >
                Quay lại
              </Button>
              <Button type="submit" size="lg" className="flex-1" loading={form.formState.isSubmitting}>
                Tạo tài khoản
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3.5 py-1 text-[12.5px] text-ink-4">
          <span className="h-px flex-1 bg-line" />
          hoặc tiếp tục với
          <span className="h-px flex-1 bg-line" />
        </div>

        <GoogleButton onCredential={handleGoogle} />

        <p className="pt-2 text-center text-sm text-ink-3">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
