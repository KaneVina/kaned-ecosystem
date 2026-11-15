import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lightbulb } from 'lucide-react';
import { loginSchema, type LoginInput } from '@kaned/shared';
import { AuthLayout } from './AuthLayout';
import { GoogleButton } from './GoogleButton';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/app';

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login(values);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const err = toApiError(error);
      if (err.fields) {
        for (const [field, message] of Object.entries(err.fields)) {
          form.setError(field as keyof LoginInput, { message });
        }
      }
      toast.error('Không đăng nhập được', err.message);
    }
  });

  const handleGoogle = async (credential: string) => {
    setGoogleBusy(true);
    try {
      await loginWithGoogle(credential);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error('Không đăng nhập được bằng Google', toApiError(error).message);
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Tài khoản sinh viên"
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để mở thư viện và các công cụ học tập trên tài khoản của bạn."
      footer={
        <>
          Khi tiếp tục, bạn đồng ý với <Link to="/login" className="underline">Điều khoản sử dụng</Link> và{' '}
          <Link to="/login" className="underline">Chính sách riêng tư</Link>.
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Email sinh viên" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="ngoc.tb@fpt.edu.vn"
            invalid={Boolean(form.formState.errors.email)}
            {...form.register('email')}
          />
        </Field>

        <Field label="Mật khẩu" htmlFor="password" error={form.formState.errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pr-11"
              invalid={Boolean(form.formState.errors.password)}
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

        <Button type="submit" size="lg" block loading={form.formState.isSubmitting}>
          Đăng nhập
        </Button>

        <div className="flex items-center gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50 px-3.5 py-3 text-[13px] text-brand-700">
          <Lightbulb className="size-4 shrink-0" aria-hidden />
          <span>
            Tài khoản demo: <b>ngoc.tb@fpt.edu.vn</b> / <b>kaned2026</b>
          </span>
          <button
            type="button"
            className="ml-auto shrink-0 rounded-md px-2 py-1 font-semibold text-brand hover:bg-brand-100"
            onClick={() => {
              form.setValue('email', 'ngoc.tb@fpt.edu.vn');
              form.setValue('password', 'kaned2026');
            }}
          >
            Điền
          </button>
        </div>

        <div className="flex items-center gap-3.5 py-1 text-[12.5px] text-ink-4">
          <span className="h-px flex-1 bg-line" />
          hoặc tiếp tục với
          <span className="h-px flex-1 bg-line" />
        </div>

        <GoogleButton onCredential={handleGoogle} disabled={googleBusy} />

        <p className="pt-2 text-center text-sm text-ink-3">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-semibold text-brand hover:underline">
            Tạo tài khoản
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
