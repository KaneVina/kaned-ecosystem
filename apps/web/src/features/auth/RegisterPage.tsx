import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { registerSchema, STUDY_YEARS, type RegisterInput } from '@kaned/shared';
import { AuthLayout, FloatField, FloatSelect } from './AuthLayout';
import { ProviderButtons } from './ProviderButtons';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useMajors, useUniversities } from '@/features/catalog/queries';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 0–4: length, mixed case, digits, symbols. */
function strength(pw: string) {
  if (pw.length < 8) return pw ? 1 : 0;
  let s = 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return Math.min(4, s);
}
const STRENGTH_WORD = ['', 'Quá ngắn', 'Tạm được', 'Khá mạnh', 'Rất mạnh'];

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [back, setBack] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', universityId: null, majorId: null, year: 3 },
  });
  const { errors, isSubmitting } = form.formState;
  const [name, email, password, universityId] = form.watch(['name', 'email', 'password', 'universityId']);
  const level = strength(password ?? '');

  const { data: universities = [] } = useUniversities();
  const { data: majors = [] } = useMajors(universityId ?? undefined);

  const fail = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const next = async () => {
    if (await form.trigger(['name', 'email', 'password'])) {
      setBack(false);
      setStep(2);
    } else fail();
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      try {
        await signUp(values);
        toast.success(`Chào ${values.name.trim().split(/\s+/).slice(-1)[0]}!`, 'Tài khoản đã sẵn sàng cho mọi module.');
        navigate('/app', { replace: true });
      } catch (error) {
        const err = toApiError(error);
        if (err.fields) {
          for (const [f, m] of Object.entries(err.fields)) form.setError(f as keyof RegisterInput, { message: m });
          if (err.fields.email || err.fields.password || err.fields.name) setStep(1);
        }
        toast.error('Chưa tạo được tài khoản', err.message);
        fail();
      }
    },
    () => fail(),
  );

  return (
    <AuthLayout
      eyebrow="Tạo tài khoản"
      title="Tham gia Kaned"
      subtitle="Một tài khoản cho thư viện và mọi công cụ đi kèm. Miễn phí cho sinh viên."
      steps={{ current: step, total: 2 }}
    >
      <form onSubmit={onSubmit} noValidate className={cn(shake && 'shake')}>
        {step === 1 ? (
          <div className={cn('step-pane', back && 'back')} key="s1">
            <div className="auth-fields">
              <FloatField id="name" label="Họ và tên" autoComplete="name" error={errors.name?.message} valid={(name ?? '').trim().length >= 2} {...form.register('name')} />
              <FloatField id="email" type="email" label="Email sinh viên" autoComplete="email" error={errors.email?.message} valid={EMAIL_RE.test(email ?? '')} {...form.register('email')} />
              <FloatField
                id="password"
                type={showPassword ? 'text' : 'password'}
                label="Mật khẩu (ít nhất 8 ký tự)"
                autoComplete="new-password"
                error={errors.password?.message}
                action={
                  <button type="button" className="f-act" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                    {showPassword ? <EyeOff className="ic ic-sm" /> : <Eye className="ic ic-sm" />}
                  </button>
                }
                after={
                  password ? (
                    <div className={cn('pw-meter', `s${level}`)}>
                      <span className="bars">
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                      <span>{STRENGTH_WORD[level]}</span>
                    </div>
                  ) : null
                }
                {...form.register('password')}
              />
            </div>
            <div className="auth-actions">
              <button type="button" className="btn btn-primary btn-auth btn-block" onClick={next}>
                Tiếp tục
                <ArrowRight className="ic ic-sm" />
              </button>
            </div>
          </div>
        ) : (
          <div className="step-pane" key="s2">
            <div className="auth-fields">
              <FloatSelect
                id="universityId"
                label="Trường"
                required
                error={errors.universityId?.message}
                {...form.register('universityId', { onChange: () => form.setValue('majorId', null) })}
              >
                <option value="" disabled />
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </FloatSelect>
              <FloatSelect id="majorId" label="Ngành" required disabled={!universityId} error={errors.majorId?.message} {...form.register('majorId')}>
                <option value="" disabled />
                {majors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nameVi} — {m.name}
                  </option>
                ))}
              </FloatSelect>
              <div className="year-pills" role="radiogroup" aria-label="Năm học">
                {STUDY_YEARS.map((y) => (
                  <label key={y}>
                    <input type="radio" value={y} {...form.register('year')} />
                    <span>Năm {y}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="auth-actions">
              <button
                type="button"
                className="btn btn-secondary btn-auth"
                onClick={() => {
                  setBack(true);
                  setStep(1);
                }}
              >
                <ArrowLeft className="ic ic-sm" />
                Quay lại
              </button>
              <button type="submit" className={cn('btn btn-primary btn-auth', isSubmitting && 'is-loading')} style={{ flex: 1 }}>
                Tạo tài khoản
              </button>
            </div>
          </div>
        )}

        <ProviderButtons divider="hoặc đăng ký nhanh với" />

        <p className="auth-switch">
          Đã có tài khoản? <Link to="/login" className="link">Đăng nhập</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
