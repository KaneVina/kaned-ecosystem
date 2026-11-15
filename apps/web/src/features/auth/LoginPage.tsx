import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lightbulb } from 'lucide-react';
import { loginSchema, type LoginInput } from '@kaned/shared';
import { AuthLayout, FloatField } from './AuthLayout';
import { GoogleButton } from './GoogleButton';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/app';

  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const email = form.watch('email');
  const { errors, isSubmitting } = form.formState;

  const fail = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      try {
        await login(values);
        navigate(redirectTo, { replace: true });
      } catch (error) {
        const err = toApiError(error);
        if (err.fields) for (const [f, m] of Object.entries(err.fields)) form.setError(f as keyof LoginInput, { message: m });
        else form.setError('password', { message: 'Email hoặc mật khẩu không đúng.' });
        fail();
      }
    },
    () => fail(),
  );

  const onGoogle = async (credential: string) => {
    try {
      await loginWithGoogle(credential);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error('Không đăng nhập được bằng Google', toApiError(error).message);
    }
  };

  return (
    <AuthLayout title="Chào mừng trở lại" subtitle="Đăng nhập để mở thư viện, bảng điểm và mọi công cụ trên tài khoản của bạn.">
      <form onSubmit={onSubmit} noValidate className={cn(shake && 'shake')}>
        <div className="step-pane">
          <div className="auth-fields">
            <FloatField
              id="email"
              type="email"
              label="Email sinh viên"
              autoComplete="email"
              error={errors.email?.message}
              valid={EMAIL_RE.test(email)}
              {...form.register('email')}
            />
            <FloatField
              id="password"
              type={showPassword ? 'text' : 'password'}
              label="Mật khẩu"
              autoComplete="current-password"
              error={errors.password?.message}
              action={
                <button
                  type="button"
                  className="f-act"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="ic ic-sm" /> : <Eye className="ic ic-sm" />}
                </button>
              }
              {...form.register('password')}
            />
          </div>
        </div>

        <div className="auth-actions">
          <button type="submit" className={cn('btn btn-primary btn-auth btn-block', isSubmitting && 'is-loading')}>
            Đăng nhập
          </button>
        </div>

        <div className="demo-hint">
          <Lightbulb className="ic ic-sm" />
          <span>
            Tài khoản demo: <b>ngoc.tb@fpt.edu.vn</b> / <b>kaned2026</b>
          </span>
          <button
            type="button"
            onClick={() => {
              form.setValue('email', 'ngoc.tb@fpt.edu.vn', { shouldValidate: true });
              form.setValue('password', 'kaned2026', { shouldValidate: true });
            }}
          >
            Điền sẵn
          </button>
        </div>

        <div className="auth-or">hoặc tiếp tục với</div>
        <GoogleButton onCredential={onGoogle} />

        <p className="auth-switch">
          Mới dùng Kaned? <Link to="/register" className="link">Tạo tài khoản</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
