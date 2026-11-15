import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarDays,
  Download,
  Eye,
  Flag,
  GraduationCap,
  Link2,
  Star,
  User,
} from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, SEMESTER_LABELS } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Badge';
import { FileBadge } from '@/components/ui/FileBadge';
import { Stars } from '@/components/ui/Stars';
import { Textarea } from '@/components/ui/Field';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { DocumentCard } from '@/components/library/DocumentCard';
import { useCreateReview, useDocument, useDownload, useToggleBookmark } from './queries';
import { useToast } from '@/providers/ToastProvider';
import { useAuth } from '@/providers/AuthProvider';
import { fmtBytes, fmtDate, fmtInt, formatColor, timeAgo } from '@/lib/format';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useDocument(id);
  const toggleBookmark = useToggleBookmark();
  const download = useDownload();
  const createReview = useCreateReview(id);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Không tìm thấy tài liệu"
        description="Tài liệu có thể đã bị gỡ, hoặc đường dẫn không đúng."
        onRetry={() => refetch()}
      />
    );
  }

  const color = formatColor(data.format);
  const myReview = data.reviews.find((review) => review.user.id === user?.id);

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) {
      toast.error('Chọn số sao trước', 'Đánh giá cần ít nhất 1 sao.');
      return;
    }
    if (comment.trim().length < 10) {
      toast.error('Viết thêm vài chữ', 'Nhận xét cần ít nhất 10 ký tự để người khác hiểu được.');
      return;
    }
    try {
      await createReview.mutateAsync({ score: rating, comment: comment.trim() });
      toast.success('Đã gửi đánh giá', 'Cảm ơn bạn đã giúp lớp sau chọn đúng tài liệu.');
      setComment('');
      setRating(0);
    } catch (error) {
      toast.error('Không gửi được đánh giá', toApiError(error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Link
        to="/app/library"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-brand"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Về thư viện
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <header>
            <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
              <span className="rounded-md px-2 py-1 font-bold text-white" style={{ background: color }}>
                {data.subject.code}
              </span>
              <Link to={`/app/subjects/${data.subject.code}`} className="font-medium text-ink-2 hover:text-brand">
                {data.subject.name}
              </Link>
              <span className="size-1 rounded-full bg-ink-4" aria-hidden />
              <span className="text-ink-3">{DOCUMENT_TYPE_LABELS[data.type].vi}</span>
            </div>

            <h1 className="mt-3 text-[clamp(23px,2.4vw,30px)] leading-tight font-semibold">{data.title}</h1>

            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink-3">
              <span className="flex items-center gap-2">
                <Stars value={data.ratingAvg} size={16} />
                <b className="tabular text-ink">{data.ratingAvg.toFixed(1)}</b>({data.ratingCount} đánh giá)
              </span>
              <span className="tabular flex items-center gap-1.5">
                <Download className="size-4" aria-hidden />
                {fmtInt(data.downloads)} lượt tải
              </span>
              <span className="tabular flex items-center gap-1.5">
                <Eye className="size-4" aria-hidden />
                {fmtInt(data.views)} lượt xem
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                {fmtDate(data.createdAt)}
              </span>
            </div>
          </header>

          {/* Preview */}
          <Card>
            <div
              className="relative grid min-h-[320px] place-items-center overflow-hidden rounded-t-[11px] p-7"
              style={{ background: `${color}0d` }}
            >
              {data.thumbnailUrl ? (
                <img src={data.thumbnailUrl} alt={`Xem trước ${data.title}`} className="max-h-[560px] w-auto rounded-md shadow-md" />
              ) : (
                <div className="text-center">
                  <FileBadge format={data.format} bytes={data.fileBytes} className="mx-auto bg-paper shadow-xs" />
                  <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-ink-3">
                    Tài liệu này chưa có ảnh xem trước. Tải xuống để mở bằng ứng dụng trên máy bạn.
                  </p>
                </div>
              )}
            </div>
            <CardBody className="flex flex-wrap items-center gap-2.5 border-t border-line">
              <Button
                size="lg"
                icon={<Download className="size-[18px]" />}
                loading={download.isPending}
                onClick={() =>
                  download.mutate(data.id, {
                    onSuccess: ({ fileUrl }) => window.open(fileUrl, '_blank', 'noopener'),
                    onError: (error) => toast.error('Không tải được', toApiError(error).message),
                  })
                }
              >
                Tải xuống ({fmtBytes(data.fileBytes)})
              </Button>

              <Button
                variant={data.isBookmarked ? 'primary' : 'secondary'}
                size="lg"
                icon={data.isBookmarked ? <BookmarkCheck className="size-[18px]" /> : <Bookmark className="size-[18px]" />}
                onClick={() => toggleBookmark.mutate(data.id)}
              >
                {data.isBookmarked ? 'Đã lưu' : 'Lưu lại'}
              </Button>

              <Button
                variant="ghost"
                size="lg"
                icon={<Link2 className="size-[18px]" />}
                onClick={async () => {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success('Đã sao chép liên kết');
                }}
              >
                Chia sẻ
              </Button>

              <Button
                variant="ghost"
                size="lg"
                className="ml-auto text-ink-3"
                icon={<Flag className="size-[18px]" />}
                onClick={() => toast.info('Đã nhận báo cáo', 'Kiểm duyệt sẽ xem lại tài liệu này trong 24 giờ.')}
              >
                Báo lỗi
              </Button>
            </CardBody>
          </Card>

          {data.description && (
            <Card>
              <CardHeader title="Mô tả" />
              <CardBody>
                <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{data.description}</p>
                {data.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {data.tags.map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Reviews */}
          <Card>
            <CardHeader title={`Đánh giá (${data.reviews.length})`} subtitle="Nhận xét từ sinh viên đã dùng tài liệu này." />
            <CardBody className="space-y-5">
              {user && !myReview && (
                <form onSubmit={submitReview} className="rounded-xl border border-line bg-paper-2 p-4">
                  <p className="text-sm font-semibold">Tài liệu này có giúp bạn không?</p>
                  <div className="mt-2.5 flex items-center gap-1" role="radiogroup" aria-label="Chấm điểm">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        aria-label={`${value} sao`}
                        aria-pressed={rating === value}
                        className="rounded p-0.5 transition-transform hover:scale-110"
                      >
                        <Star
                          className={cn(
                            'size-6 transition-colors',
                            value <= rating ? 'fill-[var(--color-star)] text-[var(--color-star)]' : 'text-line-2',
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  <Textarea
                    rows={3}
                    className="mt-3"
                    placeholder="Phần nào hữu ích nhất? Có sai sót nào cần lưu ý?"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <div className="mt-3 flex justify-end">
                    <Button type="submit" loading={createReview.isPending}>
                      Gửi đánh giá
                    </Button>
                  </div>
                </form>
              )}

              {data.reviews.length === 0 ? (
                <p className="py-2 text-sm text-ink-3">Chưa có đánh giá nào. Bạn có thể là người đầu tiên.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.reviews.map((review) => (
                    <li key={review.id} className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
                      <Avatar name={review.user.name} src={review.user.avatarUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="text-sm font-semibold">{review.user.name}</p>
                          <Stars value={review.score} size={13} />
                          <span className="text-xs text-ink-4">{timeAgo(review.createdAt)}</span>
                        </div>
                        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{review.comment}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:sticky lg:top-[88px] lg:self-start">
          <Card>
            <CardHeader title="Thông tin" />
            <CardBody className="space-y-3.5 text-sm">
              {[
                { icon: Building2, label: 'Trường', value: data.university.name },
                { icon: GraduationCap, label: 'Môn học', value: `${data.subject.code} — ${data.subject.name}` },
                { icon: CalendarDays, label: 'Thời điểm', value: `${SEMESTER_LABELS[data.semester].vi} · Năm ${data.year}` },
                { icon: User, label: 'Số trang', value: data.pages ? `${data.pages} trang` : 'Không rõ' },
              ].map((row) => (
                <div key={row.label} className="flex gap-3">
                  <row.icon className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-ink-4">{row.label}</p>
                    <p className="font-medium text-ink">{row.value}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-line pt-3.5">
                <span className="text-xs text-ink-4">Tệp</span>
                <FileBadge format={data.format} bytes={data.fileBytes} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Người chia sẻ" />
            <CardBody>
              <div className="flex items-center gap-3">
                <Avatar name={data.uploader.name} src={data.uploader.avatarUrl} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{data.uploader.name}</p>
                  <p className="text-[13px] text-ink-3">{data.uploader.major?.name ?? 'Sinh viên'}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2.5 border-t border-line pt-3.5 text-center">
                <div className="rounded-lg bg-paper-2 py-2.5">
                  <dt className="text-xs text-ink-4">Tài liệu</dt>
                  <dd className="tabular text-lg font-semibold">{data.uploader.uploadCount ?? 0}</dd>
                </div>
                <div className="rounded-lg bg-paper-2 py-2.5">
                  <dt className="text-xs text-ink-4">Năm</dt>
                  <dd className="tabular text-lg font-semibold">{data.uploader.year ?? '—'}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      {data.related.length > 0 && (
        <section className="border-t border-line pt-6">
          <h2 className="text-lg font-semibold">Cùng môn {data.subject.code}</h2>
          <p className="mt-1 text-sm text-ink-3">Những tài liệu khác sinh viên thường tải cùng tài liệu này.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.related.map((document) => (
              <DocumentCard key={document.id} document={document} onToggleBookmark={(x) => toggleBookmark.mutate(x)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
