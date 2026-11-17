import { useCallback, useMemo, useState } from 'react';
import { RichText } from '@/components/ui/RichText';
import { Link, useParams } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  Flag,
  GraduationCap,
  Hash,
  Link2,
  Star,
} from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, type DocumentSummaryDto } from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { FileBadge, FileIcon } from '@/components/ui/FileBadge';
import { Stars } from '@/components/ui/Stars';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { SectionHead } from '@/components/ui/Panel';
import { Viewer } from '@/components/paper/Paper';
import { LinkViewer } from '@/components/library/LinkViewer';
import { GithubGetPanel, GithubViewer } from '@/components/library/GithubViewer';
import { useGithubDocument } from '@/components/library/useGithubDocument';
import { FileViewer, fileEmbedUrl } from '@/components/library/FileViewer';
import { profileFor, subjectTone } from '@/components/paper/profiles';
import { DocCard } from '@/components/library/DocCard';
import { QuickPreview } from '@/components/library/QuickPreview';
import { useCreateReview, useDocument, useDownload, useToggleBookmark } from './queries';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { fmtDate, fmtInt, semesterVi, timeAgo } from '@/lib/format';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const STAR_LABELS = ['Chọn số sao', 'Không hữu ích', 'Tạm được', 'Ổn', 'Hữu ích', 'Rất hữu ích'];

/** Five rating buckets. Exact when every rating is a review; otherwise shaped from the average. */
function distribution(avg: number, count: number, scores: number[]): number[] {
  if (scores.length && scores.length >= count) return [5, 4, 3, 2, 1].map((n) => scores.filter((s) => s === n).length);
  const p5 = Math.max(0.05, Math.min(0.95, (avg - 3.9) * 0.95));
  const rest = 1 - p5;
  return [p5, rest * 0.68, rest * 0.2, rest * 0.08, rest * 0.04].map((x) => Math.round(x * count));
}

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useDocument(id);
  const toggleBookmark = useToggleBookmark();
  const download = useDownload();
  const createReview = useCreateReview(id);

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [preview, setPreview] = useState<DocumentSummaryDto | null>(null);
  const [dlState, setDlState] = useState<'idle' | 'progress' | 'done'>('idle');
  // GitHub documents download straight from GitHub; Kaned only counts the download.
  const countMutate = download.mutate;
  const docId = data?.id;
  const countDownload = useCallback(() => {
    if (docId) countMutate(docId);
  }, [docId, countMutate]);
  const gh = useGithubDocument(data, countDownload);

  const dist = useMemo(
    () => (data ? distribution(data.ratingAvg, data.ratingCount, data.reviews.map((r) => r.score)) : []),
    [data],
  );

  if (isLoading) {
    return (
      <div className="container doc-page">
        <Skeleton style={{ height: 14, width: 320 }} />
        <div className="dp-head">
          <Skeleton style={{ width: 56, height: 66 }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ height: 22, width: 260 }} />
            <Skeleton style={{ height: 34, width: '80%', marginTop: 14 }} />
            <Skeleton style={{ height: 16, width: '50%', marginTop: 14 }} />
          </div>
        </div>
        <div className="dp-layout">
          <Skeleton style={{ height: 620, borderRadius: 14 }} />
          <Skeleton style={{ height: 380, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container nf">
        <ErrorState title="Không tìm thấy tài liệu" description="Tài liệu có thể đã bị gỡ, hoặc đường dẫn không đúng." onRetry={() => refetch()} />
      </div>
    );
  }

  const tone = subjectTone(data.subject.code);
  const profile = profileFor(data.subject.code);
  const maxDist = Math.max(1, ...dist);
  const myReview = data.reviews.find((r) => r.user.id === user?.id);
  const isMine = data.uploader.id === user?.id;
  const label = data.format === 'PPTX' ? 'Slide' : data.format === 'XLSX' ? 'Trang tính' : 'Số trang';
  const isGithub = Boolean(gh.target);
  const isLink = data.format === 'LINK' && !isGithub;

  const startDownload = () => {
    if (isGithub) return gh.primary?.run();
    setDlState('progress');
    download.mutate(data.id, {
      onSuccess: ({ fileUrl }) => {
        setDlState('done');
        window.open(fileUrl, '_blank', 'noopener');
        toast.success(isLink ? 'Đã mở liên kết' : 'Đang tải xuống', data.title);
        setTimeout(() => setDlState('idle'), 1800);
      },
      onError: (e) => {
        setDlState('idle');
        toast.error('Không tải được', toApiError(e).message);
      },
    });
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return setReviewError('Chọn số sao trước đã.');
    if (comment.trim().length < 10) return setReviewError('Viết ít nhất 10 ký tự để người sau hiểu bạn đánh giá thế nào.');
    setReviewError('');
    try {
      await createReview.mutateAsync({ score: rating, comment: comment.trim() });
      toast.success('Đã đăng đánh giá', 'Cảm ơn bạn đã giúp người sau chọn đúng tài liệu.');
      setRating(0);
      setComment('');
    } catch (error) {
      toast.error('Không đăng được đánh giá', toApiError(error).message);
    }
  };

  const BookmarkIcon = data.isBookmarked ? BookmarkCheck : Bookmark;
  const ghBusy = Boolean(gh.job && gh.target && gh.job.path === gh.target.path);

  return (
    <>
      <div className="container doc-page">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/app/library">Thư viện</Link>
          <ChevronRight className="ic" />
          <Link to={`/app/library?universityId=${data.university.id}`}>{data.university.code}</Link>
          <ChevronRight className="ic" />
          <Link to={`/app/subjects/${data.subject.code}`}>{data.subject.nameVi}</Link>
          <ChevronRight className="ic" />
          {data.folder && (
            <>
              <Link to={`/app/subjects/${data.subject.code}`}>{data.folder.name}</Link>
              <ChevronRight className="ic" />
            </>
          )}
          <span aria-current="page">{data.title}</span>
        </nav>

        <header className="dp-head">
          <FileIcon format={data.format} size="lg" />
          <div className="dp-head-main">
            <div className="dp-tags">
              <Link to={`/app/subjects/${data.subject.code}`} className="subj-chip" style={{ ['--tc' as string]: tone.c, ['--tt' as string]: tone.t }}>
                {data.subject.code}
              </Link>
              <Link className="badge badge-gray" to={`/app/library?type=${data.type}`}>
                {DOCUMENT_TYPE_LABELS[data.type].vi}
              </Link>
              <FileBadge format={data.format} bytes={data.fileBytes} linkUrl={data.linkUrl} />
            </div>
            <h1 className="t-h1 dp-title">{data.title}</h1>
            <div className="dp-meta">
              <a href="#reviews" className="dp-rating">
                <Stars value={data.ratingAvg} />
                <b>{data.ratingAvg.toFixed(1)}</b>
                <span>{fmtInt(data.ratingCount)} đánh giá</span>
              </a>
              <span>
                <Download className="ic ic-sm" />
                <b>{fmtInt(data.downloads)}</b> lượt tải
              </span>
              <span>
                <Eye className="ic ic-sm" />
                <b>{fmtInt(data.views)}</b> lượt xem
              </span>
              <span>
                <CalendarDays className="ic ic-sm" />
                Đăng {fmtDate(data.createdAt)}
              </span>
            </div>
          </div>
        </header>

        <div className="dp-layout">
          <div className="dp-main">
            {isGithub ? (
              <>
                <GithubViewer gh={gh} />
                <GithubGetPanel doc={data} gh={gh} />
              </>
            ) : isLink ? (
              <LinkViewer doc={data} onOpen={startDownload} />
            ) : fileEmbedUrl(data) ? (
              <FileViewer doc={data} embedUrl={fileEmbedUrl(data)!} onDownload={startDownload} />
            ) : (
              <Viewer doc={data} onExpand={() => setFullscreen(true)} onDownload={startDownload} downloading={dlState === 'progress'} />
            )}

            <section className="panel panel-pad dp-about">
              <h2 className="t-h3">Về tài liệu này</h2>
              <RichText className="dp-desc" text={data.description} />
              {data.tags.length > 0 && (
                <>
                  <h3 className="t-h4" style={{ marginTop: 22 }}>
                    Thẻ
                  </h3>
                  <div className="row-wrap" style={{ marginTop: 10 }}>
                    {data.tags.map((t) => (
                      <Link key={t} className="tag" to={`/app/library?q=${encodeURIComponent(t)}`}>
                        <Hash className="ic ic-xs" />
                        {t}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="panel panel-pad">
              <h2 className="t-h3">Thông tin môn học</h2>
              <dl className="facts">
                <div>
                  <dt>Trường</dt>
                  <dd>
                    <Link to={`/app/library?universityId=${data.university.id}`}>{data.university.name}</Link>
                    <span>{data.university.nameVi}</span>
                  </dd>
                </div>
                <div>
                  <dt>Môn học</dt>
                  <dd>
                    <Link to={`/app/subjects/${data.subject.code}`}>{data.subject.nameVi}</Link>
                    <span>
                      {data.subject.code}, {data.subject.credits} tín chỉ
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Năm học</dt>
                  <dd>
                    <Link to={`/app/library?year=${data.year}`}>Năm {data.year}</Link>
                  </dd>
                </div>
                <div>
                  <dt>Học kỳ</dt>
                  <dd>
                    {data.term ? <span>{data.term.name}</span> : <Link to={`/app/library?semester=${data.semester}`}>{semesterVi(data.semester)}</Link>}
                    {data.period && <span>{data.period}</span>}
                  </dd>
                </div>
                {data.lecturer && (
                  <div>
                    <dt>Giảng viên</dt>
                    <dd>{data.lecturer}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="panel" id="reviews">
              <div className="panel-head">
                <h2 className="t-h3">Đánh giá</h2>
                <span className="t-small">{fmtInt(data.ratingCount)} lượt chấm</span>
              </div>
              <div className="rv-summary">
                <div className="rv-score">
                  <b>{data.ratingAvg.toFixed(1)}</b>
                  <Stars value={data.ratingAvg} />
                  <span>{fmtInt(data.ratingCount)} lượt chấm</span>
                </div>
                <div className="rv-bars">
                  {dist.map((n, i) => (
                    <div key={i} className="rv-bar">
                      <span>{5 - i}</span>
                      <Star className="ic ic-xs" />
                      <i>
                        <em style={{ width: `${Math.round((n / maxDist) * 100)}%` }} />
                      </i>
                      <span className="n">{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              {!isMine && !myReview && user && (
                <form className={cn('rv-form', (rating > 0 || comment) && 'expanded')} onSubmit={submitReview} noValidate>
                  <div className="rv-form-top">
                    <Avatar name={user.name} src={user.avatarUrl} size="md" />
                    <div>
                      <b>Chấm điểm tài liệu này</b>
                      <div className="star-input" role="radiogroup" aria-label="Số sao" onMouseLeave={() => setHover(0)}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <label key={n} className={(hover || rating) >= n ? 'on' : undefined} onMouseEnter={() => setHover(n)}>
                            <input type="radio" name="rv-r" value={n} checked={rating === n} onChange={() => setRating(n)} />
                            <span className="sr-only">{n} sao</span>
                            <svg viewBox="0 0 24 24" aria-hidden>
                              <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
                            </svg>
                          </label>
                        ))}
                        <span className="star-label">{STAR_LABELS[hover || rating]}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rv-form-more">
                    <div className={cn('field', reviewError && 'invalid')}>
                      <label className="sr-only" htmlFor="rv-text">
                        Nhận xét
                      </label>
                      <textarea
                        className="textarea"
                        id="rv-text"
                        maxLength={600}
                        placeholder="Phần nào hữu ích nhất? Có chỗ nào thiếu hay chưa rõ?"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <span className="hint">Ít nhất 10 ký tự. Đánh giá công khai và hiện tên bạn.</span>
                      <span className="error-text">{reviewError}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setRating(0);
                          setComment('');
                          setReviewError('');
                        }}
                      >
                        Huỷ
                      </button>
                      <button type="submit" className={cn('btn btn-primary btn-sm', createReview.isPending && 'is-loading')}>
                        Đăng đánh giá
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {data.reviews.length === 0 ? (
                <p className="t-small" style={{ padding: '18px 22px' }}>
                  Chưa có nhận xét nào. Bạn có thể là người đầu tiên.
                </p>
              ) : (
                <ul className="rv-list">
                  {data.reviews.map((rv) => (
                    <li key={rv.id} className="rv">
                      <Avatar name={rv.user.name} src={rv.user.avatarUrl} size="md" />
                      <div className="rv-main">
                        <div className="rv-top">
                          <b>{rv.user.name}</b>
                          <span className="t-xs">
                            {rv.user.university?.code}
                            {rv.user.year ? `, năm ${rv.user.year}` : ''}
                          </span>
                          <span className="spacer" />
                          <span className="t-xs">{timeAgo(rv.createdAt)}</span>
                        </div>
                        <Stars value={rv.score} small />
                        <RichText as="p" text={rv.comment} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="dp-side">
            <div className="panel panel-pad dp-actions">
              {isGithub && gh.primary ? (
                <button
                  type="button"
                  className={cn('btn btn-primary btn-lg btn-block dl-btn', ghBusy && 'is-progress')}
                  style={{ ['--p' as string]: ghBusy ? `${Math.round((gh.job?.share ?? 0) * 100)}%` : '0%' }}
                  onClick={gh.primary.run}
                  disabled={Boolean(gh.job)}
                >
                  <span className="dl-fill" />
                  <span className="dl-label">
                    <Download className="ic ic-sm" />
                    {ghBusy ? `Đang gom tệp… ${Math.round((gh.job?.share ?? 0) * 100)}%` : gh.primary.label}
                    {!ghBusy && gh.primary.sub && <small>{gh.primary.sub}</small>}
                  </span>
                </button>
              ) : (
              <button
                type="button"
                className={cn('btn btn-primary btn-lg btn-block dl-btn', dlState === 'progress' && 'is-progress', dlState === 'done' && 'is-done')}
                style={{ ['--p' as string]: dlState === 'progress' ? '70%' : dlState === 'done' ? '100%' : '0%' }}
                onClick={startDownload}
                disabled={dlState === 'progress'}
              >
                <span className="dl-fill" />
                <span className="dl-label">
                  {isLink ? <ExternalLink className="ic ic-sm" /> : <Download className="ic ic-sm" />}
                  {isLink ? (dlState === 'done' ? 'Đã mở' : 'Mở liên kết') : dlState === 'done' ? 'Đã tải' : `Tải ${data.format}`}
                  {!isLink && <small>{(data.fileBytes / 1024 / 1024).toFixed(1)} MB</small>}
                </span>
              </button>
              )}
              <div className="dp-act-row">
                <button
                  type="button"
                  className={cn('btn btn-secondary', data.isBookmarked && 'is-on')}
                  aria-pressed={Boolean(data.isBookmarked)}
                  onClick={() => toggleBookmark.mutate(data.id)}
                >
                  <BookmarkIcon className="ic ic-sm" />
                  <span>{data.isBookmarked ? 'Đã lưu' : 'Lưu'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(window.location.href);
                    toast.success('Đã sao chép liên kết', 'Dán vào nhóm lớp để chia sẻ.');
                  }}
                >
                  <Link2 className="ic ic-sm" />
                  Chia sẻ
                </button>
              </div>
              <dl className="file-facts">
                <div>
                  <dt>Định dạng</dt>
                  <dd>
                    <FileBadge format={data.format} bytes={data.fileBytes} linkUrl={data.linkUrl} />
                  </dd>
                </div>
                {isGithub && gh.target && (
                  <>
                    <div>
                      <dt>Repo</dt>
                      <dd>
                        <a className="link-inline" href={`https://github.com/${gh.target.owner}/${gh.target.repo}`} target="_blank" rel="noopener noreferrer">
                          {gh.target.owner}/{gh.target.repo}
                        </a>
                      </dd>
                    </div>
                    {gh.ref && gh.target.kind !== 'release' && (
                      <div>
                        <dt>Nhánh</dt>
                        <dd className="dd-mono">{gh.ref}</dd>
                      </div>
                    )}
                  </>
                )}
                {!isLink && !isGithub && data.pages ? (
                  <div>
                    <dt>{label}</dt>
                    <dd>{data.pages}</dd>
                  </div>
                ) : null}
                {data.term && (
                  <div>
                    <dt>Kỳ học</dt>
                    <dd>{data.term.name}</dd>
                  </div>
                )}
                <div>
                  <dt>Ngôn ngữ</dt>
                  <dd>{data.language === 'Vietnamese' ? 'Tiếng Việt' : data.language}</dd>
                </div>
                <div>
                  <dt>Ngày đăng</dt>
                  <dd>{fmtDate(data.createdAt)}</dd>
                </div>
                <div>
                  <dt>Giấy phép</dt>
                  <dd>Dùng cho học tập cá nhân</dd>
                </div>
              </dl>
              <button type="button" className="dp-report" onClick={() => toast.info('Đã nhận báo cáo', 'Kiểm duyệt sẽ xem lại tài liệu trong vòng 24 giờ.')}>
                <Flag className="ic ic-xs" />
                Báo cáo tài liệu
              </button>
            </div>

            <div className="panel panel-pad contributor">
              <p className="ct-label">Người chia sẻ</p>
              <div className="ct-top">
                <Avatar name={data.uploader.name} src={data.uploader.avatarUrl} size="lg" />
                <div>
                  <span className="t-h4">{data.uploader.name}</span>
                  <span>{data.uploader.university?.code ?? 'Sinh viên'}</span>
                </div>
              </div>
              <ul className="ct-facts">
                {data.uploader.university && (
                  <li>
                    <Building2 className="ic ic-sm" />
                    {data.uploader.university.name}
                  </li>
                )}
                {data.uploader.major && (
                  <li>
                    <GraduationCap className="ic ic-sm" />
                    {data.uploader.major.name}
                  </li>
                )}
                {data.uploader.year && (
                  <li>
                    <CalendarDays className="ic ic-sm" />
                    Sinh viên năm {data.uploader.year}
                  </li>
                )}
              </ul>
              <div className="ct-stats">
                <div>
                  <b>{data.uploader.uploadCount ?? data.moreFromUploader.length + 1}</b>
                  <span>tài liệu</span>
                </div>
                <div>
                  <b>{data.ratingAvg.toFixed(1)}</b>
                  <span>điểm TB</span>
                </div>
                <div>
                  <b>{fmtInt(data.downloads)}</b>
                  <span>lượt tải</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {data.moreFromUploader.length > 0 && (
          <section className="dp-section">
            <SectionHead title={`Thêm từ ${data.uploader.name}`} description="Những tài liệu khác cùng người chia sẻ." />
            <div className="grid-docs grid-4">
              {data.moreFromUploader.slice(0, 4).map((d) => (
                <DocCard key={d.id} doc={d} onToggleBookmark={(x) => toggleBookmark.mutate(x)} onPreview={setPreview} />
              ))}
            </div>
          </section>
        )}

        {data.related.length > 0 && (
          <section className="dp-section">
            <SectionHead
              title="Tài liệu liên quan"
              description={`Tài liệu khác cho ${data.subject.nameVi} và các môn gần.`}
              link={
                <Link className="link" to={`/app/library?subjectId=${data.subject.id}`}>
                  Xem tất cả {data.subject.code}
                  <ChevronRight className="ic ic-sm" />
                </Link>
              }
            />
            <div className="grid-docs grid-4">
              {data.related.slice(0, 4).map((d) => (
                <DocCard key={d.id} doc={d} onToggleBookmark={(x) => toggleBookmark.mutate(x)} onPreview={setPreview} />
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="dp-mobilebar">
        <button
          type="button"
          className={cn('btn btn-secondary btn-icon', data.isBookmarked && 'is-on')}
          aria-pressed={Boolean(data.isBookmarked)}
          aria-label="Lưu tài liệu"
          onClick={() => toggleBookmark.mutate(data.id)}
        >
          <BookmarkIcon className="ic ic-sm" />
        </button>
        <button type="button" className="btn btn-primary dl-btn" style={{ flex: 1 }} onClick={startDownload} disabled={Boolean(gh.job)}>
          <span className="dl-fill" />
          <span className="dl-label">
            {isLink ? <ExternalLink className="ic ic-sm" /> : <Download className="ic ic-sm" />}
            {isGithub ? (ghBusy ? `Đang gom tệp… ${Math.round((gh.job?.share ?? 0) * 100)}%` : (gh.primary?.label ?? 'Tải xuống')) : isLink ? 'Mở liên kết' : 'Tải xuống'}
          </span>
        </button>
      </div>

      <QuickPreview
        doc={fullscreen ? data : preview}
        onClose={() => {
          setFullscreen(false);
          setPreview(null);
        }}
        onToggleBookmark={(x) => toggleBookmark.mutate(x)}
        onDownload={(d) => (d.id === data.id ? startDownload() : download.mutate(d.id, { onSuccess: ({ fileUrl }) => window.open(fileUrl, '_blank', 'noopener') }))}
        downloading={download.isPending}
      />
    </>
  );
}
