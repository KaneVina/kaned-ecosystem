import { BookMarked } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { DocumentCard, DocumentCardSkeleton } from '@/components/library/DocumentCard';
import { PageHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { useSavedDocuments, useToggleBookmark } from '@/features/library/queries';

export function SavedPage() {
  const { data, isLoading, isError, refetch } = useSavedDocuments();
  const toggleBookmark = useToggleBookmark();

  return (
    <div className="space-y-5">
      <PageHeader title="Tài liệu đã lưu" subtitle="Những tài liệu bạn đánh dấu để đọc lại trước kỳ thi." />

      {isError ? (
        <ErrorState title="Không tải được danh sách đã lưu" onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <DocumentCardSkeleton key={i} />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={<BookMarked className="size-7" />}
          title="Chưa lưu tài liệu nào"
          description="Khi tìm thấy tài liệu hữu ích, bấm dấu đánh dấu ở góc để dành lại đây."
          action={
            <NavLink
              to="/app/library"
              className="inline-flex h-10 items-center rounded-[11px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Mở thư viện
            </NavLink>
          }
        />
      ) : (
        <>
          <p className="text-[13.5px] text-ink-3">
            <b className="tabular text-ink">{data.length}</b> tài liệu
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((document) => (
              <DocumentCard key={document.id} document={document} onToggleBookmark={(id) => toggleBookmark.mutate(id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
