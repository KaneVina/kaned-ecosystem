import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookMarked, ChevronRight, CloudUpload, Library, Lock, Sparkles } from 'lucide-react';
import type { DocumentSummaryDto } from '@kaned/shared';
import { DocCard, DocCardSkeleton } from '@/components/library/DocCard';
import { QuickPreview } from '@/components/library/QuickPreview';
import { SectionHead } from '@/components/ui/Panel';
import { Typewriter } from '@/components/ui/Typewriter';
import { CountUp } from '@/components/ui/CountUp';
import { Progress } from '@/components/ui/Feedback';
import { FileIcon } from '@/components/ui/FileBadge';
import { TOOLS } from '@/components/layout/AppShell';
import { subjectTone } from '@/components/paper/profiles';
import { useDocuments, useDownload, useSavedDocuments, useToggleBookmark } from '@/features/library/queries';
import { useGradeSummary, usePlanner } from '@/features/grades/queries';
import { useAuth } from '@/providers/AuthProvider';
import { fmtToday, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

const GREETINGS = ['hôm nay học gì?', 'ôn môn nào trước?', 'tìm đề thi cũ nhé?', 'GPA kỳ này lên nào!'];

export function DashboardPage() {
  const { user } = useAuth();
  const { data: gpa } = useGradeSummary();
  const { data: plan } = usePlanner(user?.majorId ?? undefined);
  const { data: saved } = useSavedDocuments();
  const toggleBookmark = useToggleBookmark();
  const download = useDownload();
  const [preview, setPreview] = useState<DocumentSummaryDto | null>(null);

  const nextIds = useMemo(() => (plan?.suggestion ?? []).map((s) => s.subjectId), [plan]);
  const { data: forNext, isLoading: loadingNext } = useDocuments(
    { subjectId: nextIds, sort: 'downloads', pageSize: 8 },
    { enabled: nextIds.length > 0 },
  );
  const { data: trending, isLoading: loadingTrending } = useDocuments({ sort: 'downloads', pageSize: 8 });
  const docs = (nextIds.length && forNext?.items.length ? forNext.items : trending?.items) ?? [];
  const docsLoading = nextIds.length ? loadingNext : loadingTrending;

  const firstName = user?.name.trim().split(/\s+/).slice(-1)[0] ?? 'bạn';
  const summary = plan?.summary;
  const blocked = summary?.blocked ?? [];

  return (
    <>
      <div className="page-head dash-head">
        <div className="container">
          <p className="dash-date">{fmtToday()}</p>
          <div className="ph-row">
            <div>
              <h1 className="t-display dash-hi" aria-label={`Chào ${firstName}, hôm nay học gì?`}>
                <span aria-hidden>
                  Chào <span className="hi-name">{firstName}</span>,{' '}
                </span>
                <Typewriter phrases={GREETINGS} startDelayMs={350} />
              </h1>
              <p className="ph-desc">
                {user?.major
                  ? `${user.major.name}${user.university ? ` · ${user.university.name}` : ''}${user.year ? ` · năm ${user.year}` : ''}`
                  : 'Thêm trường và ngành vào hồ sơ để Kaned gợi ý đúng môn của bạn.'}
              </p>
            </div>
            <div className="ph-actions">
              <Link to="/app/subjects" className="btn btn-secondary">
                Nhập điểm
              </Link>
              <Link to="/app/library" className="btn btn-primary">
                <Library className="ic ic-sm" />
                Mở thư viện
              </Link>
            </div>
          </div>

          <div className="sw-stats dash-stats">
            <div className="sw-stat sw-progress">
              <span className="sw-stat-l">Tiến độ chương trình</span>
              <b>
                <CountUp value={summary?.progressPercent ?? 0} />
                <small>%</small>
              </b>
              <Progress value={summary?.progressPercent ?? 0} tone="green" />
              <span className="sw-stat-s">
                {summary ? `${summary.earnedCredits}/${summary.totalCredits} tín chỉ đã qua` : 'Chọn ngành để xem tiến độ'}
              </span>
            </div>
            <Link to="/app/tools/gpa" className="sw-stat sw-stat-btn st-available">
              <span className="sw-stat-l">GPA hệ 4</span>
              <b>{gpa?.gradedCount ? <CountUp value={gpa.gpa4} decimals={2} /> : '—'}</b>
              <span className="sw-stat-s">{gpa?.gradedCount ? gpa.classification.vi : 'Chưa có điểm'}</span>
            </Link>
            <Link to="/app/subjects" className="sw-stat sw-stat-btn st-passed">
              <span className="sw-stat-l">Học được kỳ tới</span>
              <b>{summary ? <CountUp value={summary.available.length} /> : '—'}</b>
              <span className="sw-stat-s">{summary ? `${summary.availableCredits} tín chỉ đủ điều kiện` : '—'}</span>
            </Link>
            <Link to="/app/subjects" className="sw-stat sw-stat-btn st-blocked">
              <span className="sw-stat-l">Đang bị chặn</span>
              <b>{summary ? <CountUp value={summary.blocked.length} /> : '—'}</b>
              <span className="sw-stat-s">Thiếu điều kiện tiên quyết</span>
            </Link>
            <Link to="/app/saved" className="sw-stat sw-stat-btn st-in_progress">
              <span className="sw-stat-l">Đã lưu</span>
              <b><CountUp value={saved?.length ?? 0} /></b>
              <span className="sw-stat-s">tài liệu để đọc lại</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="container">
        {/* What to study next */}
        {plan && (
          <section className="section dash-next">
            <SectionHead
              title="Kỳ tới bạn học được"
              description="Gợi ý từ điểm bạn đã nhập và điều kiện tiên quyết của chương trình: môn học lại trước, rồi đến môn mở khoá nhiều môn sau nhất."
              link={
                <Link className="link" to="/app/subjects">
                  Xem cả lộ trình
                  <ChevronRight className="ic ic-sm" />
                </Link>
              }
            />
            <div className="dash-next-grid">
              <div className="dash-plan">
                {plan.suggestion.length ? (
                  <>
                    <ol>
                      {plan.suggestion.map((s, i) => {
                        const tone = subjectTone(s.code);
                        return (
                          <li key={s.subjectId}>
                            <Link to={`/app/subjects/${s.code}`} style={{ ['--tc' as string]: tone.c, ['--tt' as string]: tone.t }}>
                              <span className="dash-n">{i + 1}</span>
                              <span className="subj-chip">{s.code}</span>
                              <span className="dash-plan-name">{s.nameVi ?? s.name}</span>
                              {s.status === 'failed' && <span className="badge badge-red">Học lại</span>}
                              {s.unlocks.length > 0 && <span className="dash-unlocks">mở {s.unlocks.length} môn</span>}
                              <span className="dash-cr">{s.credits} TC</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                    <p className="dash-plan-total">
                      <Sparkles className="ic ic-sm" />
                      Tổng {plan.suggestion.reduce((n, s) => n + s.credits, 0)} tín chỉ, trong giới hạn 18 tín chỉ một kỳ.
                    </p>
                  </>
                ) : (
                  <p className="t-small">Không còn môn nào đủ điều kiện — có thể bạn cần qua các môn đang bị chặn trước.</p>
                )}
              </div>

              <div className="dash-blocked">
                <h3>
                  <Lock className="ic ic-sm" />
                  Đang bị chặn
                </h3>
                {blocked.length ? (
                  <ul>
                    {blocked.slice(0, 5).map((b) => {
                      const missing = b.checks.filter((c) => !c.ok);
                      return (
                        <li key={b.subjectId}>
                          <Link to={`/app/subjects/${b.code}`}>
                            <b>{b.code}</b>
                            <span>{missing[0]?.text}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="t-small">Không có môn nào bị chặn. Tốt lắm!</p>
                )}
                {blocked.length > 5 && (
                  <Link to="/app/subjects" className="link">
                    Xem thêm {blocked.length - 5} môn
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Documents for those subjects */}
        <section className="section">
          <SectionHead
            title={nextIds.length && forNext?.items.length ? 'Tài liệu cho các môn kỳ tới' : 'Được tải nhiều tuần này'}
            description={
              nextIds.length && forNext?.items.length
                ? 'Đề thi, slide và ghi chép của đúng những môn bạn sắp học.'
                : 'Những tài liệu sinh viên tải nhiều nhất gần đây.'
            }
            link={
              <Link className="link" to="/app/library">
                Mở thư viện
                <ChevronRight className="ic ic-sm" />
              </Link>
            }
          />
          <div className="grid-docs grid-4">
            {docsLoading
              ? Array.from({ length: 4 }, (_, i) => <DocCardSkeleton key={i} />)
              : docs.slice(0, 8).map((d) => (
                  <DocCard key={d.id} doc={d} onToggleBookmark={(id) => toggleBookmark.mutate(id)} onPreview={setPreview} />
                ))}
          </div>
        </section>

        {/* Ecosystem */}
        <section className="section dash-eco">
          <SectionHead
            title="Hệ sinh thái Kaned"
            description="Thư viện chỉ là một module. Mỗi module dùng chung tài khoản và dữ liệu học tập của bạn."
          />
          <div className="dash-tools">
            <Link to="/app/library" className="dash-tool">
              <span className="tool-ic tone-violet">
                <Library className="ic" />
              </span>
              <b>Thư viện học liệu</b>
              <small>Đề thi, slide, ghi chép — lọc theo trường, môn, học kỳ.</small>
              <ArrowRight className="ic ic-sm dash-tool-go" />
            </Link>
            {TOOLS.map((t) =>
              t.to ? (
                <Link key={t.label} to={t.to} className="dash-tool">
                  <span className={cn('tool-ic', `tone-${t.tone}`)}>
                    <t.icon className="ic" />
                  </span>
                  <b>{t.label}</b>
                  <small>{t.description}</small>
                  <ArrowRight className="ic ic-sm dash-tool-go" />
                </Link>
              ) : (
                <div key={t.label} className="dash-tool is-soon">
                  <span className={cn('tool-ic', `tone-${t.tone}`)}>
                    <t.icon className="ic" />
                  </span>
                  <b>
                    {t.label} <span className="badge badge-gray">Sắp có</span>
                  </b>
                  <small>{t.description}</small>
                </div>
              ),
            )}
          </div>
        </section>

        {/* Saved */}
        <section className="section dash-saved-sec">
          <div className="dash-two">
            <div className="panel">
              <div className="panel-head">
                <h2 className="t-h4">
                  <BookMarked className="ic ic-sm" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6, color: 'var(--violet)' }} />
                  Đã lưu gần đây
                </h2>
                <Link className="link" to="/app/saved">
                  Xem tất cả
                </Link>
              </div>
              {saved?.length ? (
                <ul className="dash-saved">
                  {saved.slice(0, 5).map((d) => (
                    <li key={d.id}>
                      <Link to={`/app/library/${d.id}`}>
                        <FileIcon format={d.format} size="sm" />
                        <span>
                          <b>{d.title}</b>
                          <small>
                            {d.subject.code} · {d.uploader.name} · {timeAgo(d.createdAt)}
                          </small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-small" style={{ padding: '18px 22px' }}>
                  Bấm biểu tượng đánh dấu trên tài liệu để dành đọc lại ở đây.
                </p>
              )}
            </div>
            <div className="panel panel-pad dash-share">
              <span className="tool-ic tone-violet">
                <CloudUpload className="ic" />
              </span>
              <h2 className="t-h3">Có tài liệu hay?</h2>
              <p>Mỗi tài liệu bạn chia sẻ giúp một lớp khác khỏi phải hỏi khắp nhóm. Mất khoảng hai phút.</p>
              <Link to="/app/upload" className="btn btn-primary">
                Chia sẻ tài liệu
              </Link>
            </div>
          </div>
        </section>
      </div>

      <QuickPreview
        doc={preview ? (docs.find((d) => d.id === preview.id) ?? preview) : null}
        onClose={() => setPreview(null)}
        onToggleBookmark={(id) => toggleBookmark.mutate(id)}
        onDownload={(d) => download.mutate(d.id, { onSuccess: ({ fileUrl }) => window.open(fileUrl, '_blank', 'noopener') })}
        downloading={download.isPending}
      />
    </>
  );
}
