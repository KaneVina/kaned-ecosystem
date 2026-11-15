import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { Card, CardBody, PageHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useMajors, useSubjects, useUniversities } from '@/features/catalog/queries';

export function SubjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const universityId = searchParams.get('universityId') ?? '';
  const majorId = searchParams.get('majorId') ?? '';

  const { data: universities = [] } = useUniversities();
  const { data: majors = [] } = useMajors(universityId || undefined);
  const { data, isLoading, isError, refetch } = useSubjects({
    q: searchParams.get('q') ?? undefined,
    universityId: universityId || undefined,
    majorId: majorId || undefined,
    pageSize: 60,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (query) next.set('q', query);
      else next.delete('q');
      if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchParams, setSearchParams]);

  const patchParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'universityId') next.delete('majorId');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thông tin môn học"
        subtitle="Tra mã môn để xem số tín chỉ, nội dung, điều kiện tiên quyết và những môn mà nó mở ra."
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_200px]">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="CSD201, Cấu trúc dữ liệu, database…"
            icon={<Search className="size-[18px]" />}
            aria-label="Tìm môn học"
          />
          <Select
            value={universityId}
            onChange={(e) => patchParam('universityId', e.target.value)}
            aria-label="Lọc theo trường"
          >
            <option value="">Mọi trường</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </Select>
          <Select
            value={majorId}
            onChange={(e) => patchParam('majorId', e.target.value)}
            disabled={!universityId}
            aria-label="Lọc theo ngành"
          >
            <option value="">{universityId ? 'Mọi ngành' : 'Chọn trường trước'}</option>
            {majors.map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      {isError ? (
        <ErrorState title="Không tải được danh sách môn" onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={<BookOpen className="size-7" />}
          title="Không tìm thấy môn học"
          description="Thử tìm bằng mã môn (CSD201) hoặc bỏ bộ lọc trường và ngành."
        />
      ) : (
        <>
          <p className="text-[13.5px] text-ink-3">
            <b className="tabular text-ink">{data.total}</b> môn học
          </p>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((subject) => (
              <Link
                key={subject.id}
                to={`/app/subjects/${subject.code}`}
                className="group flex flex-col rounded-md border border-line bg-paper p-4 shadow-xs transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-md bg-brand-50 px-2 py-1 text-[13px] font-bold text-brand-700">
                    {subject.code}
                  </span>
                  <span className="tabular shrink-0 text-[12.5px] text-ink-3">{subject.credits} tín chỉ</span>
                </div>
                <h3 className="mt-2.5 line-clamp-2 text-[15px] leading-snug font-semibold group-hover:text-brand-700">
                  {subject.name}
                </h3>
                <p className="mt-1 line-clamp-1 text-[13px] text-ink-3">{subject.nameVi}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3.5">
                  {subject.typicalYear && <Badge tone="neutral">Năm {subject.typicalYear}</Badge>}
                  {subject.prerequisiteCount ? (
                    <Badge tone="warn">{subject.prerequisiteCount} môn tiên quyết</Badge>
                  ) : (
                    <Badge tone="ok">Không cần tiên quyết</Badge>
                  )}
                  {subject.documentCount ? <Badge tone="brand">{subject.documentCount} tài liệu</Badge> : null}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
