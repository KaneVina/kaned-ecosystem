import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck, Eye, FileCheck, LayoutGrid, ShieldCheck } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';
import { Avatar } from '@/components/ui/Avatar';

const MODULES = [
  { name: 'Thư viện', status: 'Đang mở' },
  { name: 'Tính GPA', status: 'Đang mở' },
  { name: 'Thông tin môn', status: 'Đang mở' },
  { name: 'Kế hoạch học', status: 'Đang mở' },
  { name: 'Thẻ ghi nhớ', status: 'Sắp có' },
  { name: 'Thời khoá biểu', status: 'Sắp có' },
];

const POINTS = [
  { icon: FileCheck, text: 'Đề thi các năm kèm lời giải' },
  { icon: BookOpenCheck, text: 'Ghi chép và slide từ chính lớp bạn' },
  { icon: Eye, text: 'Xem trước từng trang trước khi tải' },
  { icon: ShieldCheck, text: 'Có kiểm duyệt, gỡ tài liệu vi phạm trong 24 giờ' },
];

/**
 * Two columns: the form on paper white, the ecosystem on deep violet.
 * The right panel never scrolls with the form, so the brand stays put.
 */
export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1.06fr_0.94fr]">
      {/* ─── Form side ─────────────────────────────────────────── */}
      <div className="flex flex-col px-6 py-7 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="rounded">
            <Wordmark />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Trang chủ
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">
            <ShieldCheck className="size-3.5" aria-hidden />
            {eyebrow}
          </p>
          <h1 className="mt-3.5 text-[clamp(28px,3vw,36px)] leading-tight font-semibold">{title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{subtitle}</p>

          <div className="mt-7">{children}</div>
        </div>

        <p className="text-center text-xs leading-relaxed text-ink-4">{footer}</p>
      </div>

      {/* ─── Brand side ────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-[#241A63] px-11 py-9 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="absolute -inset-[20%] blur-[26px]"
          style={{
            background:
              'radial-gradient(42% 46% at 22% 18%, rgba(104,84,220,.95), transparent 60%),' +
              'radial-gradient(38% 44% at 82% 30%, rgba(199,130,28,.5), transparent 62%),' +
              'radial-gradient(52% 50% at 60% 88%, rgba(68,51,180,.9), transparent 64%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,.09) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(255,255,255,.09) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
            maskImage: 'radial-gradient(circle at 68% 24%, #000, transparent 76%)',
            WebkitMaskImage: 'radial-gradient(circle at 68% 24%, #000, transparent 76%)',
          }}
        />
        <span
          aria-hidden
          className="absolute inset-y-0 left-7 w-px"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,138,128,.5), transparent)' }}
        />

        <div className="relative flex items-center justify-between">
          <Wordmark light />
          <span className="inline-flex h-[30px] items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 text-[12.5px] backdrop-blur">
            <LayoutGrid className="size-3.5" aria-hidden />6 module
          </span>
        </div>

        <div className="relative my-auto">
          <h2 className="max-w-[17ch] text-[clamp(26px,2.5vw,34px)] leading-tight font-semibold">
            Một tài khoản cho mọi thứ môn học của bạn cần.
          </h2>
          <p className="mt-3.5 max-w-[42ch] text-[15px] leading-relaxed text-white/70">
            Tài liệu đã lưu, điểm số và kế hoạch học tập đều nằm trên cùng một tài khoản sinh viên.
          </p>

          <div className="mt-8 grid max-w-[440px] grid-cols-3 gap-2.5">
            {MODULES.map((module) => (
              <div
                key={module.name}
                className="rounded-xl border border-white/12 bg-white/8 p-3 backdrop-blur transition-transform duration-300 hover:-translate-y-1 hover:bg-white/15"
              >
                <p className="text-[12.5px] leading-snug font-semibold">{module.name}</p>
                <p className="mt-0.5 text-[10.5px] text-white/55">{module.status}</p>
              </div>
            ))}
          </div>

          <ul className="mt-9 space-y-3">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-center gap-3 text-[14.5px] text-white/90">
                <point.icon className="size-[18px] shrink-0 text-brand-200" aria-hidden />
                {point.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative border-t border-white/15 pt-6">
          <blockquote className="text-[16.5px] leading-snug">
            “Mình tìm được đề thi của đúng môn, đúng học kỳ trong hai phút. Kỳ trước mình hỏi khắp nhóm lớp mà không ai
            có.”
          </blockquote>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name="Lê Thảo Vy" size="md" />
            <div>
              <p className="text-[13.5px] font-semibold">Lê Thảo Vy</p>
              <p className="text-xs text-white/60">Hệ thống thông tin, Đại học Cần Thơ</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
