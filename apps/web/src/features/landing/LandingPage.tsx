import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  CalendarClock,
  FileSearch,
  GraduationCap,
  Layers,
  Library,
  Route,
  Sparkles,
} from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/providers/AuthProvider';

const MODULES = [
  {
    name: 'Thư viện học liệu',
    description: 'Đề thi, slide, ghi chép của chính môn bạn đang học — lọc theo trường, môn, học kỳ, định dạng.',
    icon: Library,
    live: true,
  },
  {
    name: 'Tính GPA',
    description: 'Nhập điểm hệ 10, nhận điểm chữ và hệ 4, biết cần bao nhiêu để chạm GPA mục tiêu.',
    icon: Calculator,
    live: true,
  },
  {
    name: 'Thông tin môn học',
    description: 'Tra mã môn ra nội dung, tín chỉ, cách đánh giá và những môn mà nó mở ra.',
    icon: GraduationCap,
    live: true,
  },
  {
    name: 'Kế hoạch học tập',
    description: 'Kỳ tới học được môn nào, môn nào đang bị chặn và vì thiếu môn tiên quyết nào.',
    icon: Route,
    live: true,
  },
  { name: 'Thẻ ghi nhớ', description: 'Ôn tập lặp lại giãn cách, sinh thẻ từ tài liệu bạn đã lưu.', icon: Layers, live: false },
  { name: 'Thời khoá biểu', description: 'Xếp lịch học và nhắc deadline theo từng môn.', icon: CalendarClock, live: false },
];

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Wordmark />
          <nav className="flex items-center gap-2.5">
            {user ? (
              <Link
                to="/app"
                className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Vào không gian học tập
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center rounded-[11px] px-3.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="inline-flex h-10 items-center rounded-[11px] bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Tạo tài khoản
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-line) 1px, transparent 1px),' +
              'linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000, transparent 75%)',
          }}
        />
        <span aria-hidden className="absolute inset-y-0 left-[max(2rem,calc(50%-34rem))] w-px bg-[var(--color-margin)]/25" />

        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <Badge tone="brand">
            <Sparkles className="size-3" aria-hidden />
            Hệ sinh thái học tập cho sinh viên Việt Nam
          </Badge>

          <h1 className="mt-5 max-w-[22ch] text-[clamp(34px,6vw,62px)] leading-[1.04] font-semibold tracking-tight">
            Mọi thứ môn học của bạn cần, trên một tài khoản.
          </h1>

          <p className="mt-5 max-w-[56ch] text-[clamp(16px,1.5vw,19px)] leading-relaxed text-ink-2">
            Kaned gom tài liệu, điểm số và kế hoạch học tập về cùng một nơi. Thư viện học liệu là module đầu tiên — và
            là một phần của hệ sinh thái, không phải tất cả.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to={user ? '/app' : '/register'}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white shadow-sm transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-700"
            >
              {user ? 'Vào không gian học tập' : 'Bắt đầu miễn phí'}
              <ArrowRight className="size-[18px]" aria-hidden />
            </Link>
            <Link
              to={user ? '/app/library' : '/login'}
              className="inline-flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-line-2 px-5 text-[15px] font-semibold text-ink-2 transition-colors hover:border-brand-200 hover:text-brand"
            >
              <FileSearch className="size-[18px]" aria-hidden />
              Xem thư viện
            </Link>
          </div>

          <dl className="mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-line pt-7">
            {[
              { value: '4', label: 'module đang chạy' },
              { value: '4', label: 'trường trong dữ liệu' },
              { value: '1', label: 'tài khoản cho tất cả' },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="tabular text-[clamp(26px,3vw,36px)] leading-none font-semibold text-brand">{stat.value}</dt>
                <dd className="mt-1.5 text-[13.5px] text-ink-3">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Modules */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[clamp(24px,2.6vw,34px)] leading-tight font-semibold">Các module trong hệ sinh thái</h2>
        <p className="mt-2.5 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">
          Mỗi module giải một việc cụ thể trong đời sinh viên, và dùng chung dữ liệu với các module còn lại: điểm bạn
          nhập ở công cụ GPA chính là dữ liệu kế hoạch học tập dùng để biết bạn đang bị chặn môn nào.
        </p>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <article
              key={module.name}
              className="group rounded-md border border-line bg-paper p-5 shadow-xs transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand transition-transform duration-300 group-hover:scale-105">
                  <module.icon className="size-[22px]" aria-hidden />
                </span>
                {!module.live && <Badge tone="neutral">Sắp có</Badge>}
              </div>
              <h3 className="mt-4 text-[17px] font-semibold">{module.name}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{module.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-line bg-paper-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-9">
          <Wordmark />
          <p className="text-[13px] text-ink-3">
            Dự án học tập · {new Date().getFullYear()} · Dữ liệu minh hoạ cho mục đích demo
          </p>
        </div>
      </footer>
    </div>
  );
}
