import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BookMarked,
  Calculator,
  CalendarClock,
  FlaskConical,
  GraduationCap,
  Layers,
  Library,
  Route,
  Sparkles,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress, Skeleton } from '@/components/ui/Feedback';
import { DocumentRow } from '@/components/library/DocumentCard';
import { useDocuments, useSavedDocuments, useToggleBookmark } from '@/features/library/queries';
import { useGradeSummary } from '@/features/grades/queries';
import { useAuth } from '@/providers/AuthProvider';
import { fmtToday } from '@/lib/format';

/** The modules of the ecosystem. Live ones link out; the rest state their status. */
const MODULES = [
  {
    name: 'Thư viện học liệu',
    description: 'Đề thi, slide, ghi chép và bài tập có lọc theo trường, môn, học kỳ.',
    to: '/app/library',
    icon: Library,
    status: 'live' as const,
  },
  {
    name: 'Tính GPA',
    description: 'Quy đổi điểm hệ 10 sang hệ 4, xem cần bao nhiêu để đạt mục tiêu.',
    to: '/app/tools/gpa',
    icon: Calculator,
    status: 'live' as const,
  },
  {
    name: 'Thông tin môn học',
    description: 'Tra mã môn để xem tín chỉ, nội dung và điều kiện tiên quyết.',
    to: '/app/subjects',
    icon: GraduationCap,
    status: 'live' as const,
  },
  {
    name: 'Kế hoạch học tập',
    description: 'Kỳ tới học được môn nào, môn nào đang bị chặn vì tiên quyết.',
    to: '/app/planner',
    icon: Route,
    status: 'live' as const,
  },
  {
    name: 'Thẻ ghi nhớ',
    description: 'Ôn tập theo thuật toán lặp lại giãn cách, sinh thẻ từ tài liệu đã lưu.',
    to: null,
    icon: Layers,
    status: 'soon' as const,
  },
  {
    name: 'Thời khoá biểu',
    description: 'Xếp lịch học, nhắc deadline và đồng bộ với lịch trên máy bạn.',
    to: null,
    icon: CalendarClock,
    status: 'soon' as const,
  },
  {
    name: 'Phòng thí nghiệm',
    description: 'Những module đang thử nghiệm cùng một nhóm nhỏ sinh viên.',
    to: null,
    icon: FlaskConical,
    status: 'lab' as const,
  },
];

export function DashboardPage() {
  const { user } = useAuth();
  const { data: recent, isLoading: loadingRecent } = useDocuments({ sort: 'recent', pageSize: 5 });
  const { data: saved } = useSavedDocuments();
  const { data: gradeSummary } = useGradeSummary();
  const toggleBookmark = useToggleBookmark();

  const firstName = user?.name.split(' ').slice(-1)[0] ?? 'bạn';

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <section className="relative overflow-hidden rounded-lg border border-line bg-[#241A63] px-6 py-7 text-white sm:px-8 sm:py-9">
        <div
          aria-hidden
          className="absolute -inset-[30%] blur-[30px]"
          style={{
            background:
              'radial-gradient(40% 50% at 18% 20%, rgba(104,84,220,.95), transparent 62%),' +
              'radial-gradient(34% 44% at 88% 26%, rgba(199,130,28,.42), transparent 64%),' +
              'radial-gradient(46% 46% at 64% 94%, rgba(68,51,180,.9), transparent 66%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(circle at 76% 10%, #000, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(circle at 76% 10%, #000, transparent 72%)',
          }}
        />

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[13px] text-white/60">{fmtToday()}</p>
            <h1 className="mt-2 text-[clamp(24px,2.6vw,32px)] leading-tight font-semibold">
              Chào {firstName}, hôm nay học gì?
            </h1>
            <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-white/70">
              {user?.major
                ? `${user.major.name}${user.university ? ` · ${user.university.name}` : ''}`
                : 'Thêm trường và ngành vào hồ sơ để Kaned gợi ý đúng môn của bạn.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/app/library"
              className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-white px-4 text-sm font-semibold text-[#241A63] transition-transform hover:-translate-y-0.5"
            >
              <Library className="size-4" aria-hidden />
              Mở thư viện
            </Link>
            <Link
              to="/app/upload"
              className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              <Upload className="size-4" aria-hidden />
              Chia sẻ tài liệu
            </Link>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="GPA hệ 4"
          value={gradeSummary?.totalCredits ? gradeSummary.gpa4.toFixed(2) : '—'}
          hint={gradeSummary?.totalCredits ? gradeSummary.classification.vi : 'Nhập điểm để xem'}
          icon={<TrendingUp className="size-[18px]" />}
        />
        <StatCard
          label="Tín chỉ tích luỹ"
          value={gradeSummary?.earnedCredits ?? 0}
          hint={`${gradeSummary?.gradedCount ?? 0} môn đã có điểm`}
          icon={<GraduationCap className="size-[18px]" />}
        />
        <StatCard
          label="Tài liệu đã lưu"
          value={saved?.length ?? 0}
          hint="Mở lại bất cứ lúc nào"
          icon={<BookMarked className="size-[18px]" />}
        />
        <Card>
          <CardBody>
            <p className="text-xs tracking-wide text-ink-4 uppercase">Tiến độ chương trình</p>
            <p className="tabular mt-2 text-2xl font-semibold">
              {gradeSummary?.earnedCredits ?? 0}
              <span className="text-base font-normal text-ink-3"> tín chỉ</span>
            </p>
            <Progress
              className="mt-2.5"
              value={Math.min(100, Math.round(((gradeSummary?.earnedCredits ?? 0) / 145) * 100))}
            />
            <p className="mt-1.5 text-xs text-ink-3">Ước tính trên 145 tín chỉ toàn khoá</p>
          </CardBody>
        </Card>
      </section>

      {/* The ecosystem */}
      <section>
        <div className="mb-3.5 flex items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-[18px] text-brand" aria-hidden />
              Hệ sinh thái Kaned
            </h2>
            <p className="mt-0.5 text-sm text-ink-3">
              Thư viện là một module. Mỗi module dùng chung tài khoản và dữ liệu học tập của bạn.
            </p>
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((module) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand">
                    <module.icon className="size-5" aria-hidden />
                  </span>
                  {module.status === 'live' ? (
                    <ArrowUpRight className="size-4 text-ink-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  ) : (
                    <Badge tone={module.status === 'lab' ? 'warn' : 'neutral'}>
                      {module.status === 'lab' ? 'Thử nghiệm' : 'Sắp có'}
                    </Badge>
                  )}
                </div>
                <h3 className="mt-3.5 text-[15.5px] font-semibold">{module.name}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">{module.description}</p>
              </>
            );

            return module.to ? (
              <Link
                key={module.name}
                to={module.to}
                className="group rounded-md border border-line bg-paper p-4 shadow-xs transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                {body}
              </Link>
            ) : (
              <div key={module.name} className="rounded-md border border-dashed border-line-2 bg-paper-2 p-4">
                {body}
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent documents */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader
            title="Mới chia sẻ"
            subtitle="Tài liệu vừa được sinh viên tải lên."
            actions={
              <Link to="/app/library?sort=recent" className="text-sm font-medium text-brand hover:underline">
                Xem tất cả
              </Link>
            }
          />
          <CardBody className="space-y-2.5">
            {loadingRecent
              ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)
              : recent?.items.map((document) => (
                  <DocumentRow key={document.id} document={document} onToggleBookmark={(id) => toggleBookmark.mutate(id)} />
                ))}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Đã lưu của bạn" />
            <CardBody>
              {!saved?.length ? (
                <p className="text-sm text-ink-3">
                  Chưa có tài liệu nào được lưu. Bấm dấu đánh dấu trên tài liệu để dành đọc sau.
                </p>
              ) : (
                <ul className="space-y-1">
                  {saved.slice(0, 5).map((document) => (
                    <li key={document.id}>
                      <Link
                        to={`/app/library/${document.id}`}
                        className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-sunk"
                      >
                        <span className="text-[12.5px] font-bold text-brand">{document.subject.code}</span>
                        <span className="mt-0.5 block line-clamp-2 text-[13.5px] leading-snug">{document.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {saved && saved.length > 5 && (
                <Link to="/app/saved" className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
                  Xem cả {saved.length} tài liệu
                </Link>
              )}
            </CardBody>
          </Card>

          {gradeSummary?.byTerm.length ? (
            <Card>
              <CardHeader title="GPA theo học kỳ" />
              <CardBody>
                <ul className="space-y-2.5">
                  {gradeSummary.byTerm.map((term) => (
                    <li key={term.termNo} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 text-[13px] text-ink-3">HK{term.termNo}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunk">
                        <div
                          className="h-full rounded-full bg-brand transition-[width] duration-700"
                          style={{ width: `${(term.gpa4 / 4) * 100}%` }}
                        />
                      </div>
                      <span className="tabular w-10 shrink-0 text-right text-[13px] font-semibold">
                        {term.gpa4.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}
