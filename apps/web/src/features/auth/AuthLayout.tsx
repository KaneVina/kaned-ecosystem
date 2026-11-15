import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  GraduationCap,
  Layers,
  LayoutGrid,
  Library,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';

const MODULES = [
  { name: 'Thư viện', state: 'Đang mở', icon: Library },
  { name: 'Tính GPA', state: 'Đang mở', icon: Calculator },
  { name: 'Môn học & điều kiện', state: 'Đang mở', icon: GraduationCap },
  { name: 'Thẻ ghi nhớ', state: 'Sắp có', icon: Layers },
  { name: 'Thời khoá biểu', state: 'Sắp có', icon: CalendarDays },
  { name: 'Nhóm học', state: 'Đang thiết kế', icon: Users },
];

/** The split auth screen: the form on paper, the ecosystem on deep violet. */
export function AuthLayout({
  title,
  subtitle,
  eyebrow = 'Tài khoản sinh viên',
  steps,
  children,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  steps?: { current: number; total: number };
  children: ReactNode;
}) {
  return (
    <section className="screen-auth">
      <div className="auth-split">
        <div className="auth-pane">
          <div className="auth-pane-head">
            <Link to="/" aria-label="Kaned — trang chủ">
              <Wordmark />
            </Link>
            <Link to="/" className="auth-back">
              <ArrowLeft className="ic ic-sm" />
              Trang chủ
            </Link>
          </div>

          <div className="auth-inner">
            <span className="auth-eyebrow">
              <ShieldCheck className="ic ic-xs" />
              {eyebrow}
            </span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            {steps && (
              <div className="steps" aria-label={`Bước ${steps.current} trên ${steps.total}`}>
                {Array.from({ length: steps.total }, (_, i) => (
                  <i key={i} className={i < steps.current ? 'on' : undefined} />
                ))}
                <span>
                  Bước {steps.current} / {steps.total}
                </span>
              </div>
            )}
            {children}
          </div>

          <p className="auth-legal">
            Khi tiếp tục, bạn đồng ý với <Link to="/">Điều khoản sử dụng</Link> và <Link to="/">Chính sách riêng tư</Link>.
          </p>
        </div>

        <aside className="auth-canvas" aria-hidden>
          <span className="canvas-mesh" />
          <span className="canvas-grid" />
          <span className="canvas-margin" />
          <div className="canvas-top">
            <Wordmark />
            <span className="canvas-chip">
              <LayoutGrid className="ic ic-xs" />
              {MODULES.length} module
            </span>
          </div>
          <div className="canvas-body">
            <h2>Một tài khoản cho mọi thứ môn học của bạn cần.</h2>
            <p>Đăng nhập một lần. Tài liệu đã lưu, bảng điểm và kế hoạch học đều nằm trên cùng một tài khoản sinh viên.</p>
            <div className="canvas-mods">
              {MODULES.map((m, i) => (
                <div key={m.name} className="cmod" style={{ animationDelay: `${120 + i * 60}ms` }}>
                  <m.icon className="ic ic-sm" />
                  <div>
                    <b>{m.name}</b>
                    <span>{m.state}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="canvas-quote">
            <blockquote>
              “Mình tìm được đề thi của đúng môn, đúng học kỳ trong hai phút. Kỳ trước mình hỏi khắp nhóm lớp mà không ai có.”
            </blockquote>
            <div className="cq-who">
              <Avatar name="Lê Thảo Vy" size="md" />
              <div>
                <b>Lê Thảo Vy</b>
                <span>Hệ thống thông tin, Đại học Cần Thơ</span>
              </div>
            </div>
            <div className="canvas-stats">
              <div>
                <b>43</b>
                <span>môn FPTU SE</span>
              </div>
              <div>
                <b>9</b>
                <span>kỳ học</span>
              </div>
              <div>
                <b>
                  <BookOpen className="ic ic-sm" style={{ display: 'inline', verticalAlign: '-2px' }} /> 1
                </b>
                <span>tài khoản</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

interface FloatFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  valid?: boolean;
  action?: ReactNode;
  after?: ReactNode;
}

/** A large input whose label floats up when it has focus or a value. */
export const FloatField = forwardRef<HTMLInputElement, FloatFieldProps>(function FloatField(
  { label, error, valid, action, after, id, className, ...rest },
  ref,
) {
  return (
    <div className={cn('ffield', error && 'invalid', valid && !error && 'valid', className)}>
      <input ref={ref} id={id} className="finput" placeholder=" " aria-invalid={Boolean(error) || undefined} {...rest} />
      <label htmlFor={id}>{label}</label>
      {action}
      {!action && <CircleCheck className="ic ic-sm f-ok" aria-hidden />}
      <span className="err" role={error ? 'alert' : undefined}>
        <CircleAlert className="ic ic-xs" />
        <span>{error}</span>
      </span>
      {after}
    </div>
  );
});

interface FloatSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

export const FloatSelect = forwardRef<HTMLSelectElement, FloatSelectProps>(function FloatSelect(
  { label, error, id, children, ...rest },
  ref,
) {
  return (
    <div className={cn('ffield', error && 'invalid')}>
      <select ref={ref} id={id} className="finput" {...rest}>
        {children}
      </select>
      <label htmlFor={id}>{label}</label>
      <span className="err">
        <CircleAlert className="ic ic-xs" />
        <span>{error}</span>
      </span>
    </div>
  );
});
