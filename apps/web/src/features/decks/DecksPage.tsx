import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  CircleCheckBig,
  Clock,
  Flame,
  LayoutGrid,
  Layers,
  List,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
} from 'lucide-react';
import { foldVi, STAFF_ROLES, type DeckSummaryDto } from '@kaned/shared';
import { PageHead } from '@/components/ui/Panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { CountUp } from '@/components/ui/CountUp';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/cn';
import { fmtDateTime, fmtInt, fmtRelative, timeAgo } from '@/lib/format';
import { useDecks } from './api';
import { fmtScore, summaryCounts, useStudySettings } from './model';
import { BigSearch } from './parts';
import './decks.css';

type Show = 'all' | 'studying' | 'new' | 'due';
type Sort = 'recent' | 'progress' | 'due' | 'size' | 'updated' | 'name';
type View = 'grid' | 'list';

const SORTS: Array<{ v: Sort; label: string }> = [
  { v: 'recent', label: 'Học gần đây' },
  { v: 'due', label: 'Cần ôn nhiều nhất' },
  { v: 'progress', label: 'Tiến độ thấp nhất' },
  { v: 'size', label: 'Nhiều câu nhất' },
  { v: 'updated', label: 'Mới cập nhật' },
  { v: 'name', label: 'Mã môn A–Z' },
];

const PREFS_KEY = 'kaned.decks.list';
function usePrefs() {
  const [prefs, setPrefs] = useState<{ sort: Sort; view: View }>(() => {
    try {
      return { sort: 'recent', view: 'grid', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
    } catch {
      return { sort: 'recent', view: 'grid' };
    }
  });
  const set = (p: Partial<typeof prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  return [prefs, set] as const;
}

const DAY = 86_400_000;
const vnDay = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
const studied = (d: DeckSummaryDto) => Boolean(d.progress && d.progress.seen > 0);
/** Questions to go over again: wrong, guessed or forgotten, plus reviews falling due today. */
const dueOf = (d: DeckSummaryDto, srs: boolean) => (d.progress ? summaryCounts(d.progress, srs).bad + (srs ? (d.progress.dueToday ?? 0) : 0) : 0);
const knownPct = (d: DeckSummaryDto, srs: boolean) => (d.progress && d.questionCount ? (summaryCounts(d.progress, srs).ok / d.questionCount) * 100 : 0);
/** Changed since the learner last studied it, or published in the last week and not opened yet. */
const isFresh = (d: DeckSummaryDto) => {
  const upd = new Date(d.updatedAt).getTime();
  if (Date.now() - upd > 7 * DAY) return false;
  return !d.progress || new Date(d.progress.updatedAt).getTime() < upd;
};

/** Days in a row with study, ending today (or yesterday, so the streak survives until tonight). */
function streakOf(days: Set<string>) {
  let n = 0;
  let t = Date.now();
  if (!days.has(vnDay(t))) t -= DAY;
  while (days.has(vnDay(t))) {
    n++;
    t -= DAY;
  }
  return n;
}

/** Wraps the parts of `text` that match the search words in <mark>, ignoring accents. */
function Hl({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const chars = [...text];
  const folded = chars.map((c) => foldVi(c)[0] ?? c).join('');
  const on = new Array(chars.length).fill(false);
  for (const t of terms) {
    let i = folded.indexOf(t);
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) on[k] = true;
      i = folded.indexOf(t, i + t.length);
    }
  }
  const out: ReactNode[] = [];
  let i = 0;
  while (i < chars.length) {
    let j = i;
    while (j < chars.length && on[j] === on[i]) j++;
    const s = chars.slice(i, j).join('');
    out.push(on[i] ? <mark key={i}>{s}</mark> : s);
    i = j;
  }
  return <>{out}</>;
}

export function DecksPage() {
  const { user } = useAuth();
  const { data = [], isLoading, isError, refetch } = useDecks();
  const [settings] = useStudySettings();
  const srs = settings.srs;
  const [q, setQ] = useState('');
  const [uni, setUni] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [prefs, setPrefs] = usePrefs();
  const staff = user && STAFF_ROLES.includes(user.role);
  const hints = useMemo(() => [...new Set(data.map((d) => `“${d.subject.code}”`))].slice(0, 4).concat('“ôn thi cuối kỳ”'), [data]);
  const terms = useMemo(() => foldVi(q.trim()).split(/\s+/).filter(Boolean), [q]);

  const universities = useMemo(() => {
    const map = new Map<string, DeckSummaryDto['subject']['university']>();
    for (const d of data) map.set(d.subject.university.id, d.subject.university);
    return [...map.values()];
  }, [data]);

  const matched = useMemo(
    () =>
      data.filter((d) => {
        if (uni && d.subject.university.id !== uni) return false;
        const hay = foldVi(`${d.title} ${d.subject.code} ${d.subject.nameVi} ${d.description ?? ''}`);
        return terms.every((t) => hay.includes(t));
      }),
    [data, terms, uni],
  );

  const counts = useMemo(
    () => ({
      all: matched.length,
      studying: matched.filter(studied).length,
      new: matched.filter((d) => !studied(d)).length,
      due: matched.filter((d) => dueOf(d, srs) > 0).length,
    }),
    [matched, srs],
  );

  const list = useMemo(() => {
    const keep = matched.filter((d) =>
      show === 'studying' ? studied(d) : show === 'new' ? !studied(d) : show === 'due' ? dueOf(d, srs) > 0 : true,
    );
    const by: Record<Sort, (a: DeckSummaryDto, b: DeckSummaryDto) => number> = {
      recent: (a, b) => (b.progress?.updatedAt ?? '').localeCompare(a.progress?.updatedAt ?? '') || a.subject.code.localeCompare(b.subject.code),
      due: (a, b) => dueOf(b, srs) - dueOf(a, srs),
      progress: (a, b) => Number(studied(b)) - Number(studied(a)) || knownPct(a, srs) - knownPct(b, srs),
      size: (a, b) => b.questionCount - a.questionCount,
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      name: (a, b) => a.subject.code.localeCompare(b.subject.code) || a.title.localeCompare(b.title),
    };
    return [...keep].sort(by[prefs.sort]);
  }, [matched, show, prefs.sort, srs]);

  const grouped = show === 'all' && !q && prefs.sort === 'recent';
  const studying = grouped ? list.filter(studied) : [];
  const others = grouped ? list.filter((d) => !studied(d)) : list;

  const filterChips: Array<{ v: Show; label: string }> = [
    { v: 'all', label: 'Tất cả' },
    { v: 'studying', label: 'Đang học' },
    { v: 'due', label: 'Cần ôn' },
    { v: 'new', label: 'Chưa học' },
  ];

  const grid = (items: DeckSummaryDto[], offset = 0) => (
    <div className={prefs.view === 'grid' ? 'dk-deck-grid' : 'dk-deck-rows'}>
      {items.map((d, i) =>
        prefs.view === 'grid' ? (
          <DeckCard key={d.id} d={d} srs={srs} terms={terms} i={offset + i} />
        ) : (
          <DeckRow key={d.id} d={d} srs={srs} terms={terms} i={offset + i} />
        ),
      )}
    </div>
  );

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Thẻ ghi nhớ' }]}
        title="Thẻ ghi nhớ"
        description="Bộ đề ôn thi theo từng môn: luyện trắc nghiệm biết ngay đúng sai, lật thẻ, thi thử có tính giờ và mẹo nhớ. Tiến độ được lưu vào tài khoản của bạn."
        actions={
          staff ? (
            <Link className="btn btn-secondary btn-sm" to="/admin/decks">
              Quản lý bộ đề
            </Link>
          ) : undefined
        }
      >
        <BigSearch id="dk-q" value={q} onChange={setQ} label="Tìm bộ đề" placeholder="Tìm theo mã môn, tên môn hoặc tên bộ đề" hints={hints} />
      </PageHead>
      <div className="container dk-body">
        {isLoading ? (
          <>
            <Skeleton style={{ height: 150, borderRadius: 16, marginBottom: 30 }} />
            <div className="dk-deck-grid">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} style={{ height: 250, borderRadius: 14 }} />
              ))}
            </div>
          </>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data.length ? (
          <EmptyState
            title="Chưa có bộ đề nào"
            description={staff ? 'Nhập bộ đề đầu tiên ở trang quản trị bằng file .md theo định dạng của Kaned.' : 'Bộ đề ôn thi sẽ xuất hiện ở đây khi được thêm vào.'}
            action={
              staff ? (
                <Link className="btn btn-primary" to="/admin/decks">
                  Nhập bộ đề
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <Today decks={data} srs={srs} name={user?.name ?? ''} onShowDue={() => setShow('due')} />

            <div className="dk-toolbar" role="toolbar" aria-label="Lọc và sắp xếp bộ đề">
              <div className="dk-chips" role="radiogroup" aria-label="Hiện">
                {filterChips.map((c) => (
                  <button
                    key={c.v}
                    type="button"
                    role="radio"
                    aria-checked={show === c.v}
                    className={cn('dk-chip', show === c.v && 'is-on', c.v === 'due' && counts.due > 0 && 'is-due')}
                    onClick={() => setShow(c.v)}
                  >
                    {c.label}
                    <span>{fmtInt(counts[c.v])}</span>
                  </button>
                ))}
              </div>
              <span className="spacer" />
              {universities.length > 1 && (
                <select className="select select-sm" value={uni} onChange={(e) => setUni(e.target.value)} aria-label="Trường">
                  <option value="">Mọi trường</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
                </select>
              )}
              <select className="select select-sm" value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value as Sort })} aria-label="Sắp xếp">
                {SORTS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="seg dk-view" role="radiogroup" aria-label="Kiểu xem">
                <button type="button" role="radio" aria-checked={prefs.view === 'grid'} className={cn(prefs.view === 'grid' && 'is-on')} onClick={() => setPrefs({ view: 'grid' })} title="Dạng thẻ">
                  <LayoutGrid className="ic ic-sm" />
                </button>
                <button type="button" role="radio" aria-checked={prefs.view === 'list'} className={cn(prefs.view === 'list' && 'is-on')} onClick={() => setPrefs({ view: 'list' })} title="Dạng danh sách">
                  <List className="ic ic-sm" />
                </button>
              </div>
            </div>

            {!list.length ? (
              <div className="dk-none">
                <p>
                  {q
                    ? `Không có bộ đề nào khớp “${q.trim()}”${show !== 'all' ? ' trong mục này' : ''}.`
                    : show === 'due'
                      ? 'Không còn câu nào cần ôn. Làm tốt lắm.'
                      : show === 'studying'
                        ? 'Bạn chưa bắt đầu bộ đề nào.'
                        : 'Bạn đã mở hết các bộ đề.'}
                </p>
                {(q || show !== 'all' || uni) && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setQ('');
                      setShow('all');
                      setUni('');
                    }}
                  >
                    Bỏ lọc
                  </button>
                )}
              </div>
            ) : grouped ? (
              <>
                {studying.length > 0 && (
                  <section className="dk-section dk-section-first">
                    <h2 className="t-h3 dk-list-h">Đang học</h2>
                    {grid(studying)}
                  </section>
                )}
                {others.length > 0 && (
                  <section className={cn('dk-section', !studying.length && 'dk-section-first')}>
                    <h2 className="t-h3 dk-list-h">{studying.length ? 'Bộ đề khác' : 'Tất cả bộ đề'}</h2>
                    {grid(others, studying.length)}
                  </section>
                )}
              </>
            ) : (
              <section className="dk-section dk-section-first">
                <h2 className="t-h3 dk-list-h">{q ? `${fmtInt(list.length)} bộ đề khớp “${q.trim()}”` : `${fmtInt(list.length)} bộ đề`}</h2>
                {grid(list)}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────── today ─────────────────────────────── */

function Today({ decks, srs, name, onShowDue }: { decks: DeckSummaryDto[]; srs: boolean; name: string; onShowDue: () => void }) {
  const mine = decks.filter(studied);
  const s = useMemo(() => {
    const days = new Set(mine.flatMap((d) => d.progress?.days ?? []));
    const total = mine.reduce((n, d) => n + d.questionCount, 0);
    const known = mine.reduce((n, d) => n + summaryCounts(d.progress!, srs).ok, 0);
    const due = mine.reduce((n, d) => n + dueOf(d, srs), 0);
    const scores = mine.map((d) => d.progress?.bestScore).filter((x): x is number => x != null);
    const last = [...mine].sort((a, b) => b.progress!.updatedAt.localeCompare(a.progress!.updatedAt))[0];
    const mostDue = [...mine].sort((a, b) => dueOf(b, srs) - dueOf(a, srs))[0];
    const week = Array.from({ length: 14 }, (_, i) => {
      const t = Date.now() - (13 - i) * DAY;
      const key = vnDay(t);
      return { key, on: days.has(key), today: i === 13, dow: new Date(t + 7 * 3600_000).getUTCDay() };
    });
    return { streak: streakOf(days), total, known, due, best: scores.length ? Math.max(...scores) : null, last, mostDue, week, todayDone: days.has(vnDay(Date.now())) };
  }, [mine, srs]);

  const first = name.trim().split(/\s+/).slice(-1)[0] || 'bạn';
  if (!mine.length) {
    return (
      <section className="dk-today is-empty">
        <div className="dk-today-main">
          <span className="dk-today-kicker">
            <Sparkles className="ic ic-xs" />
            Bắt đầu
          </span>
          <h2>Chào {first}, chọn một môn để bắt đầu ôn</h2>
          <p>Mỗi câu bạn làm được lưu lại. Câu sai sẽ quay lại đúng lúc bạn sắp quên, để bạn nhớ lâu mà không phải học lại từ đầu.</p>
        </div>
      </section>
    );
  }

  const pct = s.total ? Math.round((s.known / s.total) * 100) : 0;
  const dow = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return (
    <section className="dk-today" aria-label="Hôm nay">
      <div className="dk-today-main">
        <span className="dk-today-kicker">
          <CalendarCheck className="ic ic-xs" />
          {s.todayDone ? 'Hôm nay bạn đã học' : 'Hôm nay'}
        </span>
        <h2>
          {s.due > 0
            ? `${first} ơi, có ${fmtInt(s.due)} câu đang chờ bạn ôn`
            : s.todayDone
              ? `Tốt lắm ${first}, hôm nay không còn câu nào phải ôn`
              : `Chào ${first}, học tiếp từ chỗ bạn dừng nhé`}
        </h2>
        <div className="dk-today-actions">
          {s.last && (
            <Link className="btn btn-primary" to={`/app/flashcards/${s.last.id}/practice`}>
              <Play className="ic ic-sm" />
              Học tiếp {s.last.subject.code}
            </Link>
          )}
          {s.due > 0 && s.mostDue && (
            <button type="button" className="btn btn-secondary" onClick={onShowDue}>
              <RotateCcw className="ic ic-sm" />
              Xem bộ đề cần ôn
            </button>
          )}
        </div>
        <div className="dk-week" aria-label={`Ngày học trong 14 ngày qua: ${s.week.filter((w) => w.on).length} ngày`}>
          {s.week.map((w, i) => (
            <span
              key={w.key}
              className={cn('dk-week-d', w.on && 'is-on', w.today && 'is-today')}
              style={{ '--i': i } as CSSProperties}
              title={`${w.key.split('-').reverse().join('/')}${w.on ? ' · có học' : ''}`}
            >
              <i />
              <small>{w.today ? 'Nay' : dow[w.dow]}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="dk-today-stats">
        <Stat icon={<Flame className="ic" />} tone="flame" value={s.streak} label="ngày liên tiếp" hint={s.streak ? 'Học mỗi ngày để giữ chuỗi' : 'Học hôm nay để bắt đầu chuỗi'} />
        <Stat icon={<CircleCheckBig className="ic" />} tone="good" value={s.known} label={`câu đã thuộc · ${pct}%`} hint={`Trên ${fmtInt(s.total)} câu của ${mine.length} bộ đề đang học`} />
        <Stat icon={<RotateCcw className="ic" />} tone={s.due ? 'bad' : 'muted'} value={s.due} label="câu cần ôn" hint="Câu sai, câu đoán và câu đến hạn ôn hôm nay" />
        <Stat
          icon={<Trophy className="ic" />}
          tone="gold"
          value={0}
          text={s.best != null ? fmtScore(s.best) : '–'}
          label={s.best != null ? 'điểm thi thử cao nhất' : 'chưa thi thử'}
          hint="Điểm cao nhất trên thang 10 ở các bộ đề"
        />
      </div>
    </section>
  );
}

function Stat({ icon, tone, value, label, hint, text }: { icon: ReactNode; tone: string; value: number; label: string; hint: string; text?: string }) {
  return (
    <div className={cn('dk-tstat', `is-${tone}`)} title={hint}>
      <span className="dk-tstat-ic">{icon}</span>
      <b>
        {text ?? <CountUp value={value} />}
      </b>
      <small>{label}</small>
    </div>
  );
}

/* ─────────────────────────────── cards ─────────────────────────────── */

/** Bar that grows from empty once it is on screen. */
function GrowBar({ ok, bad }: { ok: number; bad: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <div className="dk-bar" role="img" aria-label={`${Math.round(ok)}% đã thuộc, ${Math.round(bad)}% cần ôn`}>
      <i className="is-ok" style={{ width: on ? `${ok}%` : 0 }} />
      <i className="is-bad" style={{ width: on ? `${bad}%` : 0 }} />
    </div>
  );
}

function useCardFacts(d: DeckSummaryDto, srs: boolean) {
  const p = d.progress;
  const k = p ? summaryCounts(p, srs) : { ok: 0, bad: 0 };
  return {
    p,
    okp: d.questionCount ? (k.ok / d.questionCount) * 100 : 0,
    badp: d.questionCount ? (k.bad / d.questionCount) * 100 : 0,
    due: dueOf(d, srs),
    bad: k.bad,
    fresh: isFresh(d),
    started: studied(d),
  };
}

const QUICK = [
  { mode: 'practice', label: 'Luyện tập', Icon: CircleCheckBig },
  { mode: 'flip', label: 'Lật thẻ', Icon: Layers },
  { mode: 'exam', label: 'Thi thử', Icon: Timer },
] as const;

/**
 * What the deck covers, as an exam ticket: an FE stub for multiple choice and
 * a PE stub for the practical exam, joined by a perforation when both exist.
 * Counted from the deck's own questions.
 */
function ExamTags({ d }: { d: DeckSummaryDto }) {
  const pe = d.peCount ?? 0;
  const fe = Math.max(0, d.questionCount - pe);
  if (!fe && !pe) return null;
  const label = [fe ? `${fmtInt(fe)} câu trắc nghiệm FE` : '', pe ? `${fmtInt(pe)} câu thi thực hành PE` : ''].filter(Boolean).join(', ');
  return (
    <span className={cn('dk-ticket', fe > 0 && pe > 0 && 'is-both')} title={label} aria-label={label}>
      {fe > 0 && (
        <span className="dk-stub is-fe">
          FE
          {pe > 0 && <small>{fmtInt(fe)}</small>}
        </span>
      )}
      {pe > 0 && (
        <span className="dk-stub is-pe">
          PE
          <small>{fmtInt(pe)}</small>
        </span>
      )}
    </span>
  );
}

function DeckCard({ d, srs, terms, i }: { d: DeckSummaryDto; srs: boolean; terms: string[]; i: number }) {
  const f = useCardFacts(d, srs);
  return (
    <article className="dk-deck" style={{ ['--uni' as string]: d.subject.university.color, '--i': Math.min(i, 12) } as CSSProperties}>
      <div className="dk-deck-top">
        <span className="dk-code">
          <Hl text={d.subject.code} terms={terms} />
        </span>
        <span className="dk-uni">{d.subject.university.code}</span>
        {d.status === 'DRAFT' && <span className="badge badge-amber">Bản nháp</span>}
        <ExamTags d={d} />
      </div>
      <h3>
        <Link to={`/app/flashcards/${d.id}`} className="dk-deck-link">
          <Hl text={d.title} terms={terms} />
        </Link>
      </h3>
      <p className="dk-deck-subj">
        <Hl text={d.subject.nameVi} terms={terms} />
      </p>
      <div className="dk-deck-facts">
        <span>
          <Layers className="ic ic-xs" />
          {fmtInt(d.questionCount)} câu
        </span>
        {d.chapterCount > 0 && <span>{fmtInt(d.chapterCount)} chương</span>}
        {d.tipCount > 0 && <span>{fmtInt(d.tipCount)} mẹo</span>}
        {f.p?.bestScore != null && (
          <span className="dk-best" title={`Thi thử ${f.p.exams} lần`}>
            <Trophy className="ic ic-xs" />
            {fmtScore(f.p.bestScore)}/10
          </span>
        )}
      </div>
      <p className="dk-deck-upd" title={fmtDateTime(d.updatedAt)}>
        <Clock className="ic ic-xs" />
        Cập nhật {fmtRelative(d.updatedAt)}
      </p>

      <div className="dk-deck-prog">
        {f.due > 0 && (
          <span className="dk-due">
            <RotateCcw className="ic ic-xs" />
            {fmtInt(f.due)} câu cần ôn
          </span>
        )}
        <GrowBar ok={f.okp} bad={f.badp} />
        <div className="dk-deck-foot">
          <span>{f.started ? `${Math.round(f.okp)}% đã thuộc${f.bad ? ` · ${fmtInt(f.bad)} sai` : ''}` : 'Chưa học'}</span>
          <b>
            {f.started ? 'Học tiếp' : 'Bắt đầu'}
            <ArrowRight className="ic ic-xs dk-go" />
          </b>
        </div>
        {f.started && <small className="dk-deck-when">Học lần cuối {timeAgo(f.p!.updatedAt)}</small>}
      </div>

      <nav className="dk-quick" aria-label={`Mở nhanh ${d.subject.code}`}>
        {QUICK.map((m) => (
          <Link key={m.mode} to={`/app/flashcards/${d.id}/${m.mode}`}>
            <m.Icon className="ic ic-xs" />
            {m.label}
          </Link>
        ))}
      </nav>
    </article>
  );
}

function DeckRow({ d, srs, terms, i }: { d: DeckSummaryDto; srs: boolean; terms: string[]; i: number }) {
  const f = useCardFacts(d, srs);
  return (
    <article className="dk-drow" style={{ ['--uni' as string]: d.subject.university.color, '--i': Math.min(i, 12) } as CSSProperties}>
      <span className="dk-code">
        <Hl text={d.subject.code} terms={terms} />
      </span>
      <div className="dk-drow-main">
        <Link to={`/app/flashcards/${d.id}`} className="dk-deck-link">
          <b className="clamp-1">
            <Hl text={d.title} terms={terms} />
          </b>
        </Link>
        <small className="clamp-1">
          {fmtInt(d.questionCount)} câu · cập nhật {fmtRelative(d.updatedAt)}
          {f.started ? ` · học ${timeAgo(f.p!.updatedAt)}` : ''}
        </small>
      </div>
      <div className="dk-drow-tags">
        <ExamTags d={d} />
        {f.due > 0 && <span className="dk-due">{fmtInt(f.due)} cần ôn</span>}
      </div>
      <div className="dk-drow-prog">
        <GrowBar ok={f.okp} bad={f.badp} />
        <small>{f.started ? `${Math.round(f.okp)}%` : 'Chưa học'}</small>
      </div>
      <nav className="dk-drow-quick" aria-label={`Mở nhanh ${d.subject.code}`}>
        {QUICK.map((m) => (
          <Link key={m.mode} to={`/app/flashcards/${d.id}/${m.mode}`} title={m.label} aria-label={m.label}>
            <m.Icon className="ic ic-sm" />
          </Link>
        ))}
      </nav>
    </article>
  );
}
