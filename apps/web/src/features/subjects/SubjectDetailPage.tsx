import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ClipboardList, GraduationCap, Layers, Target } from 'lucide-react';
import { PREREQ_TYPE_LABELS } from '@kaned/shared';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { DocumentCard } from '@/components/library/DocumentCard';
import { useSubject } from '@/features/catalog/queries';
import { useToggleBookmark } from '@/features/library/queries';

const PREREQ_TONE = {
  PREREQUISITE: 'danger',
  COREQUISITE: 'brand',
  PRIOR: 'warn',
} as const;

export function SubjectDetailPage() {
  const { code = '' } = useParams();
  const { data, isLoading, isError, refetch } = useSubject(code);
  const toggleBookmark = useToggleBookmark();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Không tìm thấy môn học"
        description={`Không có môn nào khớp mã “${code}”. Thử tra lại trong danh sách môn.`}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Link
        to="/app/subjects"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-brand"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Danh sách môn học
      </Link>

      <header className="rounded-lg border border-line bg-paper p-5 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="rounded-md bg-brand px-2.5 py-1 text-sm font-bold text-white">{data.code}</span>
            <h1 className="mt-3 text-[clamp(22px,2.2vw,28px)] leading-tight font-semibold">{data.name}</h1>
            <p className="mt-1 text-[15px] text-ink-3">{data.nameVi}</p>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-3 text-center">
            {[
              { label: 'Tín chỉ', value: data.credits },
              { label: 'Tiên quyết', value: data.prerequisites.length },
              { label: 'Tài liệu', value: data.documentCount },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-paper-2 px-4 py-2.5">
                <dt className="text-xs text-ink-4">{stat.label}</dt>
                <dd className="tabular text-xl font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {data.majors.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="text-[13px] text-ink-4">Thuộc chương trình:</span>
            {data.majors.map(({ major, termNo, isRequired }) => (
              <Badge key={major.id} tone={isRequired ? 'brand' : 'neutral'}>
                {major.name}
                {termNo ? ` · HK${termNo}` : ''}
                {isRequired ? '' : ' (tự chọn)'}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {data.description && (
            <Card>
              <CardHeader title="Môn này học gì" />
              <CardBody>
                <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{data.description}</p>
              </CardBody>
            </Card>
          )}

          {data.topics.length > 0 && (
            <Card>
              <CardHeader title="Nội dung chính" icon={<Layers className="size-[18px]" />} />
              <CardBody>
                <ol className="grid gap-2.5 sm:grid-cols-2">
                  {data.topics.map((topic, index) => (
                    <li key={topic} className="flex gap-3 rounded-lg bg-paper-2 px-3.5 py-2.5 text-[14px]">
                      <span className="tabular shrink-0 font-semibold text-brand">{index + 1}.</span>
                      {topic}
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}

          {data.outcomes.length > 0 && (
            <Card>
              <CardHeader title="Học xong bạn làm được gì" icon={<Target className="size-[18px]" />} />
              <CardBody>
                <ul className="space-y-2.5">
                  {data.outcomes.map((outcome) => (
                    <li key={outcome} className="flex gap-3 text-[14.5px] leading-relaxed text-ink-2">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      {outcome}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {data.assessment && (
            <Card>
              <CardHeader title="Cách đánh giá" icon={<ClipboardList className="size-[18px]" />} />
              <CardBody>
                <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{data.assessment}</p>
              </CardBody>
            </Card>
          )}

          {data.recentDocuments && data.recentDocuments.length > 0 && (
            <section>
              <div className="mb-3.5 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Tài liệu cho {data.code}</h2>
                  <p className="mt-0.5 text-sm text-ink-3">Những tài liệu được tải nhiều nhất cho môn này.</p>
                </div>
                <Link
                  to={`/app/library?subjectId=${data.id}`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  Xem tất cả
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {data.recentDocuments.map((document) => (
                  <DocumentCard key={document.id} document={document} onToggleBookmark={(id) => toggleBookmark.mutate(id)} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-[88px] lg:self-start">
          <Card>
            <CardHeader title="Điều kiện tiên quyết" subtitle="Phải hoàn thành trước khi đăng ký môn này." />
            <CardBody>
              {data.prerequisites.length === 0 ? (
                <p className="text-sm text-ink-3">Môn này không yêu cầu môn nào trước. Bạn có thể học ngay.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.prerequisites.map((prereq) => (
                    <li key={`${prereq.type}-${prereq.subject.id}`}>
                      <Link
                        to={`/app/subjects/${prereq.subject.code}`}
                        className="flex items-start gap-3 rounded-lg border border-line p-3 transition-colors hover:border-brand-200 hover:bg-brand-50"
                      >
                        <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[12.5px] font-bold text-ink">
                          {prereq.subject.code}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">{prereq.subject.name}</span>
                          <Badge tone={PREREQ_TONE[prereq.type]} className="mt-1">
                            {PREREQ_TYPE_LABELS[prereq.type].vi}
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Môn này mở ra" subtitle="Những môn cần bạn qua môn này trước." icon={<GraduationCap className="size-[18px]" />} />
            <CardBody>
              {data.unlocks.length === 0 ? (
                <p className="text-sm text-ink-3">Chưa có môn nào trong dữ liệu phụ thuộc vào môn này.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.unlocks.map((unlock) => (
                    <li key={`${unlock.type}-${unlock.subject.id}`}>
                      <Link
                        to={`/app/subjects/${unlock.subject.code}`}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-sunk"
                      >
                        <span className="text-[12.5px] font-bold text-brand">{unlock.subject.code}</span>
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2">{unlock.subject.name}</span>
                        <ArrowUpRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                Muốn biết kỳ tới mình học được môn nào và môn nào đang bị chặn?
              </p>
              <Link
                to="/app/planner"
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Mở kế hoạch học tập
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
