import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CircleSlash, Clock, Info, Lock, Route, TriangleAlert, Unlock } from 'lucide-react';
import type { PlannerResult, SubjectStatus } from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '@/components/ui/Card';
import { Checkbox, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useMajors } from '@/features/catalog/queries';
import { usePlanner } from '@/features/grades/queries';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/cn';

const STATUS_META: Record<
  SubjectStatus,
  { label: string; tone: 'ok' | 'brand' | 'warn' | 'danger' | 'neutral'; icon: typeof Lock; blurb: string }
> = {
  passed: { label: 'Đã qua', tone: 'ok', icon: CalendarCheck, blurb: 'Bạn đã hoàn thành môn này.' },
  available: { label: 'Học được', tone: 'brand', icon: Unlock, blurb: 'Đủ điều kiện, có thể đăng ký kỳ tới.' },
  in_progress: { label: 'Đang học', tone: 'warn', icon: Clock, blurb: 'Đang học, chưa có điểm tổng kết.' },
  failed: { label: 'Chưa qua', tone: 'danger', icon: TriangleAlert, blurb: 'Cần học lại trước khi đi tiếp.' },
  blocked: { label: 'Bị chặn', tone: 'neutral', icon: Lock, blurb: 'Chưa đủ điều kiện tiên quyết.' },
};

const ORDER: SubjectStatus[] = ['available', 'failed', 'in_progress', 'blocked', 'passed'];

export function PlannerPage() {
  const { user } = useAuth();
  const [majorId, setMajorId] = useState(user?.majorId ?? '');
  const [requireStrongPass, setRequireStrongPass] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SubjectStatus | 'all'>('all');

  const { data: majors = [] } = useMajors(user?.universityId ?? undefined);
  const { data, isLoading, isError, refetch } = usePlanner(majorId || undefined, requireStrongPass);

  const grouped = useMemo(() => {
    const map = new Map<number, PlannerResult[]>();
    for (const result of data?.summary.results ?? []) {
      const term = result.termNo ?? 0;
      if (!map.has(term)) map.set(term, []);
      map.get(term)!.push(result);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [data]);

  const counts: Record<SubjectStatus, number> | null = data
    ? {
        passed: data.summary.passed.length,
        available: data.summary.available.length,
        blocked: data.summary.blocked.length,
        failed: data.summary.failed.length,
        in_progress: data.summary.inProgress.length,
      }
    : null;

  if (!majorId) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Kế hoạch học tập"
          subtitle="Kaned đọc điểm bạn đã lưu, đối chiếu với chương trình học và chỉ ra kỳ tới học được môn nào."
        />
        <Card>
          <CardBody>
            <div className="mx-auto max-w-sm">
              <Select value={majorId} onChange={(e) => setMajorId(e.target.value)} aria-label="Chọn ngành">
                <option value="">Chọn ngành của bạn</option>
                {majors.map((major) => (
                  <option key={major.id} value={major.id}>
                    {major.name} — {major.nameVi}
                  </option>
                ))}
              </Select>
            </div>
            <EmptyState
              icon={<Route className="size-7" />}
              title="Chọn ngành để bắt đầu"
              description="Chương trình học quyết định thứ tự môn và điều kiện tiên quyết, nên cần chọn ngành trước."
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kế hoạch học tập"
        subtitle="Dựa trên điểm bạn đã lưu ở công cụ tính GPA và điều kiện tiên quyết của chương trình."
        actions={
          <Link
            to="/app/tools/gpa"
            className="inline-flex h-10 items-center rounded-[11px] border-[1.5px] border-line-2 px-4 text-sm font-semibold text-ink-2 transition-colors hover:border-brand-200 hover:text-brand"
          >
            Cập nhật điểm
          </Link>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <Select
            value={majorId}
            onChange={(e) => setMajorId(e.target.value)}
            className="w-auto min-w-[240px] shrink-0"
            aria-label="Ngành"
          >
            {majors.map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </Select>

          <Checkbox
            label="Yêu cầu điểm trên 5.0 mới coi là đạt tiên quyết"
            checked={requireStrongPass}
            onChange={(e) => setRequireStrongPass(e.target.checked)}
          />

          <p className="ml-auto flex items-center gap-2 text-[12.5px] text-ink-4">
            <Info className="size-3.5" aria-hidden />
            Kết quả mang tính tham khảo, hãy đối chiếu với phòng đào tạo.
          </p>
        </CardBody>
      </Card>

      {isError ? (
        <ErrorState title="Không tính được kế hoạch" onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : !data ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Học được kỳ tới"
              value={counts?.available ?? 0}
              hint="Đã đủ điều kiện tiên quyết"
              icon={<Unlock className="size-[18px]" />}
            />
            <StatCard
              label="Đang bị chặn"
              value={counts?.blocked ?? 0}
              hint="Thiếu môn tiên quyết"
              icon={<Lock className="size-[18px]" />}
            />
            <StatCard label="Đã hoàn thành" value={counts?.passed ?? 0} hint={`${data.summary.earnedCredits} tín chỉ`} />
            <StatCard
              label="Cần học lại"
              value={counts?.failed ?? 0}
              hint="Điểm dưới mức đạt"
              icon={<TriangleAlert className="size-[18px]" />}
            />
          </div>

          {/* Suggested next term */}
          <Card>
            <CardHeader
              title="Gợi ý cho kỳ tới"
              subtitle="Ưu tiên môn học lại, rồi đến môn mở ra nhiều môn khác nhất, trong giới hạn 18 tín chỉ."
              icon={<Route className="size-[18px]" />}
            />
            <CardBody>
              {data.suggestion.length === 0 ? (
                <p className="text-sm text-ink-3">
                  Không còn môn nào đủ điều kiện. Có thể bạn đã hoàn thành chương trình, hoặc cần qua các môn đang bị
                  chặn trước.
                </p>
              ) : (
                <>
                  <ol className="space-y-2.5">
                    {data.suggestion.map((result, index) => (
                      <li
                        key={result.subjectId}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper-2 p-3.5"
                      >
                        <span className="tabular grid size-7 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">
                          {index + 1}
                        </span>
                        <Link
                          to={`/app/subjects/${result.code}`}
                          className="text-[13px] font-bold text-brand-700 hover:underline"
                        >
                          {result.code}
                        </Link>
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{result.name}</span>
                        <span className="tabular shrink-0 text-[13px] text-ink-3">{result.credits} TC</span>
                        {result.unlocks.length > 0 && <Badge tone="brand">Mở ra {result.unlocks.length} môn</Badge>}
                      </li>
                    ))}
                  </ol>
                  <p className="tabular mt-3.5 text-sm text-ink-3">
                    Tổng: <b className="text-ink">{data.suggestion.reduce((sum, r) => sum + r.credits, 0)} tín chỉ</b> /{' '}
                    {data.suggestion.length} môn
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          {/* Status legend + filter */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              aria-pressed={statusFilter === 'all'}
              className={cn(
                'h-8 rounded-full border px-3 text-[13px] font-medium transition-colors',
                statusFilter === 'all' ? 'border-brand bg-brand text-white' : 'border-line-2 text-ink-2 hover:bg-sunk',
              )}
            >
              Tất cả ({data.summary.results.length})
            </button>
            {ORDER.map((status) => {
              const meta = STATUS_META[status];
              const count = counts?.[status] ?? 0;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  disabled={!count}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-45',
                    statusFilter === status
                      ? 'border-brand bg-brand text-white'
                      : 'border-line-2 text-ink-2 hover:bg-sunk',
                  )}
                >
                  <meta.icon className="size-3.5" aria-hidden />
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Curriculum by term */}
          <div className="space-y-4">
            {grouped.map(([term, results]) => {
              const visible = statusFilter === 'all' ? results : results.filter((r) => r.status === statusFilter);
              if (!visible.length) return null;
              return (
                <Card key={term}>
                  <CardHeader
                    title={term === 0 ? 'Môn tự chọn / chưa xếp kỳ' : `Học kỳ ${term}`}
                    subtitle={`${visible.length} môn · ${visible.reduce((sum, r) => sum + r.credits, 0)} tín chỉ`}
                  />
                  <CardBody className="grid gap-2.5 sm:grid-cols-2">
                    {visible.map((result) => {
                      const meta = STATUS_META[result.status];
                      return (
                        <div
                          key={result.subjectId}
                          className={cn(
                            'rounded-xl border p-3.5 transition-colors',
                            result.status === 'blocked' || result.status === 'failed'
                              ? 'border-line bg-paper-2'
                              : 'border-line bg-paper',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <Link
                              to={`/app/subjects/${result.code}`}
                              className="text-[13px] font-bold text-brand-700 hover:underline"
                            >
                              {result.code}
                            </Link>
                            <Badge tone={meta.tone}>
                              <meta.icon className="size-3" aria-hidden />
                              {meta.label}
                            </Badge>
                          </div>

                          <p className="mt-1.5 text-[14.5px] leading-snug font-medium">{result.name}</p>

                          <div className="tabular mt-1.5 flex items-center gap-3 text-[12.5px] text-ink-3">
                            <span>{result.credits} tín chỉ</span>
                            {result.score10 !== null && result.score10 !== undefined && (
                              <span className={result.status === 'failed' ? 'font-semibold text-[var(--color-margin)]' : ''}>
                                Điểm {result.score10}
                              </span>
                            )}
                          </div>

                          {result.blockedBy.length > 0 && (
                            <div className="mt-2.5 border-t border-line pt-2.5">
                              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-3">
                                <CircleSlash className="size-3.5" aria-hidden />
                                Đang chờ
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {result.blockedBy.map((reason) => (
                                  <li key={`${reason.subjectId}-${reason.reason}`} className="text-[12.5px] text-ink-2">
                                    <Link to={`/app/subjects/${reason.code}`} className="font-semibold hover:underline">
                                      {reason.code}
                                    </Link>{' '}
                                    <span className="text-ink-3">
                                      {reason.reason === 'not_taken'
                                        ? '— chưa học'
                                        : reason.reason === 'failed'
                                          ? '— chưa qua'
                                          : reason.reason === 'in_progress'
                                            ? '— đang học'
                                            : '— điểm chưa đủ'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {data.summary.results.length === 0 && (
            <EmptyState
              icon={<Route className="size-7" />}
              title="Chương trình học chưa có môn nào"
              description="Ngành này chưa được nhập dữ liệu chương trình học."
            />
          )}

          <Card>
            <CardBody className="flex flex-wrap items-start gap-4">
              {ORDER.map((status) => {
                const meta = STATUS_META[status];
                return (
                  <div key={status} className="flex max-w-[220px] gap-2.5">
                    <meta.icon className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
                    <div>
                      <p className="text-[13px] font-semibold">{meta.label}</p>
                      <p className="text-[12px] leading-relaxed text-ink-3">{meta.blurb}</p>
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
