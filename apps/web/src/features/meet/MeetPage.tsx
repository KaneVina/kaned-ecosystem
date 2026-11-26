import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban, CalendarCheck2, CalendarDays, CalendarPlus, Check, CircleHelp, Clock3, Clock4, Download, Eraser, KeyRound, Link2, Lock, LogOut, MapPin, MoreHorizontal,
  Paintbrush, PencilLine, RotateCcw, Save, Sparkles, SquareDashedMousePointer, Trash2, Undo2, UserRound, Users, X,
} from 'lucide-react';
import {
  countSlots, dayLabel, fmtDur, fmtMin, gridRows, heatOf, nextDateFor, suggestTimes, validMeetRange,
  type MeetCell, type MeetEventDto, type MeetParticipantDto, type MeetSlots, type MeetStateDto, type MeetSuggestion,
} from '@kaned/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Wordmark } from '@/components/ui/Wordmark';
import { Skeleton } from '@/components/ui/Feedback';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtRelative } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { meetApi, meetLink, meetToken } from './api';
import { calendarLinks, colsOf, daysSummary, has, hoursSummary, sameMap, setCells, sizeOf, toMap, toSlots, whenText, type SlotMap } from './model';
import { ShareLink } from './Share';
import { TimeGrid, heatColor, type CellState, type GridOverlay, type PaintTool } from './TimeGrid';
import './meet.css';

type Tab = 'mine' | 'group' | 'people';
type Cell = { day: string; m: number };

/** The public page behind the link: no account needed, a name is enough. */
export default function MeetPage() {
  const { slug = '' } = useParams();
  const { user, initialising } = useAuth();
  const qc = useQueryClient();
  const qk = useMemo(() => ['meet', 's', slug, user?.id ?? 'guest'], [slug, user?.id]);
  const q = useQuery({
    queryKey: qk,
    queryFn: () => meetApi.state(slug),
    enabled: !initialising && Boolean(slug),
    staleTime: Infinity,
    retry: (n, e) => toApiError(e).status !== 404 && n < 2,
  });
  const apply = useCallback((s: MeetStateDto) => qc.setQueryData(qk, s), [qc, qk]);

  if (initialising || q.isLoading) return <Shell><div className="mt-wrap"><Skeleton style={{ height: 150, borderRadius: 18 }} /><Skeleton style={{ height: 460, borderRadius: 18, marginTop: 18 }} /></div></Shell>;
  if (q.isError || !q.data) {
    const e = toApiError(q.error);
    return (
      <Shell>
        <div className="mt-gone">
          <span className="mt-gone-ic"><CalendarDays className="ic" /></span>
          <h1>{e.status === 404 ? 'Không tìm thấy sự kiện' : 'Chưa mở được sự kiện'}</h1>
          <p>{e.status === 404 ? 'Link có thể sai, hoặc sự kiện đã bị xoá hay hết hạn. Hỏi lại trưởng nhóm link mới.' : e.message}</p>
          {e.status !== 404 && <Button onClick={() => q.refetch()}>Thử lại</Button>}
        </div>
      </Shell>
    );
  }
  return <Live key={slug} slug={slug} state={q.data} apply={apply} />;
}

function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-page">
      <header className="mt-top">
        <Link to="/" className="mt-top-brand" aria-label="Kaned"><Wordmark /></Link>
        <span className="mt-top-tool">Hẹn họp nhóm</span>
        <div className="mt-top-right">{right}</div>
      </header>
      {children}
    </div>
  );
}

/* ───────────────────────────── live state ───────────────────────────── */

function usePoll(slug: string, version: number, onState: (s: MeetStateDto) => void) {
  const v = useRef(version);
  v.current = Math.max(v.current, version);
  const cb = useRef(onState);
  cb.current = onState;
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let stop = false;
    let busy = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop || busy) return;
      busy = true;
      clearTimeout(t);
      try {
        const r = await meetApi.poll(slug, v.current);
        if (r.changed && r.v > v.current - 1) {
          v.current = r.v;
          cb.current(r.state);
        }
        setOnline(true);
      } catch {
        setOnline(false);
      } finally {
        busy = false;
        if (!stop) t = setTimeout(tick, document.hidden ? 15000 : 2500);
      }
    };
    t = setTimeout(tick, 2500);
    const wake = () => !document.hidden && void tick();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      stop = true;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [slug]);
  return online;
}

const DRAFT = (slug: string) => `meet:paint:${slug}`;
const slotsKey = (s: MeetSlots) => JSON.stringify(Object.keys(s).sort().map((k) => [k, s[k]]));

function Live({ slug, state, apply }: { slug: string; state: MeetStateDto; apply: (s: MeetStateDto) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { event: ev, participants, isOwner } = state;
  const me = participants.find((p) => p.id === state.me?.id) ?? null;
  const [tab, setTab] = useState<Tab>('mine');
  const [activity, setActivity] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const prev = useRef(state);

  // What changed since the last state: light up the cells, say who did it.
  const onState = useCallback(
    (s: MeetStateDto) => {
      const old = prev.current;
      prev.current = s;
      apply(s);
      const a = heatOf(old.participants);
      const b = heatOf(s.participants);
      const changed = new Set<string>();
      for (const k of new Set([...a.keys(), ...b.keys()])) {
        const x = a.get(k);
        const y = b.get(k);
        if ((x?.free ?? 0) !== (y?.free ?? 0) || (x?.busy ?? 0) !== (y?.busy ?? 0)) changed.add(k);
      }
      if (changed.size) {
        setPulse(changed);
        setTimeout(() => setPulse(new Set()), 1600);
      }
      const before = new Map(old.participants.map((p) => [p.id, p]));
      const fresh = s.participants.filter((p) => p.id !== s.me?.id && (!before.has(p.id) || before.get(p.id)!.savedAt !== p.savedAt));
      if (fresh.length) {
        const p = fresh[0]!;
        const verb = !before.has(p.id) && !p.savedAt ? 'vừa vào' : 'vừa cập nhật lịch';
        setActivity(`${p.name} ${verb}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`);
      }
      if (old.event.status !== s.event.status && !s.isOwner) {
        if (s.event.final) toast.success('Trưởng nhóm đã chốt giờ họp', whenText(s.event.final.day, s.event.final.start, s.event.final.end));
        else toast.info('Trưởng nhóm đã mở lại để chọn giờ khác');
      }
    },
    [apply, toast],
  );
  useEffect(() => {
    if (!activity) return;
    const t = setTimeout(() => setActivity(null), 6000);
    return () => clearTimeout(t);
  }, [activity]);
  const online = usePoll(slug, ev.version, onState);
  const local = useCallback((s: MeetStateDto) => {
    prev.current = s;
    apply(s);
  }, [apply]);

  const cols = useMemo(() => colsOf(ev.days), [ev.days]);
  const rows = useMemo(() => gridRows(ev.days, ev.slotMin), [ev.days, ev.slotMin]);
  const blocked = useMemo(() => toMap(ev.blocked), [ev.blocked]);
  const lockedOf = useCallback((d: string, m: number) => has(blocked, d, m), [blocked]);
  const answered = participants.filter((p) => countSlots(p.free) || countSlots(p.busy));

  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverSug, setHoverSug] = useState<number | null>(null);
  const [cell, setCell] = useState<Cell | null>(null);
  const [picked, setPicked] = useState<Cell | null>(null);
  const [justFinal, setJustFinal] = useState(false);
  const [dur, setDur] = useState(ev.durationMin);
  useEffect(() => setDur(ev.durationMin), [ev.durationMin]);
  const sugs = useMemo(() => (ev.status === 'OPEN' ? suggestTimes(ev, participants, { durationMin: dur, limit: 3 }) : []), [ev, participants, dur]);

  const finalAt = async (c: { day: string; start: number; end: number }) => {
    try {
      await meetApi.finalize(ev.id, c);
      setJustFinal(true);
      setPicked(null);
      local({ ...state, event: { ...ev, status: 'FINAL', final: { ...c, note: '', at: Date.now() } } });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error(toApiError(e).message);
    }
  };
  const detail = <CellDetail state={state} dur={dur} cell={picked ?? cell} pinned={Boolean(picked)} onUnpin={() => setPicked(null)} onFinal={finalAt} />;

  const live = (
    <div className={cn('mt-live', !online && 'is-off')} aria-live="polite">
      <span className="mt-live-dot" />
      <span className="mt-live-t">{online ? (activity ?? 'Trực tiếp') : 'Mất kết nối, đang thử lại…'}</span>
      <span className="mt-live-n"><Users className="ic ic-xs" />{participants.length}</span>
    </div>
  );

  return (
    <Shell right={<>{live}<InviteButton ev={ev} /></>}>
      <div className="mt-wrap">
        <EventHead state={state} />
        {ev.status === 'FINAL' && ev.final && (
          <FinalBanner state={state} justFinal={justFinal} onReopen={async () => {
            try {
              await meetApi.reopen(ev.id);
              setJustFinal(false);
              local({ ...state, event: { ...ev, status: 'OPEN', final: null, version: ev.version } });
              toast.info('Đã mở lại, chọn giờ khác');
            } catch (e) {
              toast.error(toApiError(e).message);
            }
          }} />
        )}
        {ev.status === 'OPEN' && (
          <Suggestions
            state={state}
            list={sugs}
            dur={dur}
            setDur={setDur}
            hover={hoverSug}
            setHover={setHoverSug}
            onFinal={async (s) => {
              try {
                await meetApi.finalize(ev.id, { day: s.day, start: s.start, end: s.end });
                setJustFinal(true);
                setTimeout(() => setJustFinal(false), 12000);
                local({ ...state, event: { ...ev, status: 'FINAL', final: { day: s.day, start: s.start, end: s.end, note: '', at: Date.now() } } });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } catch (e) {
                toast.error(toApiError(e).message);
              }
            }}
          />
        )}

        <nav className="mt-tabs" role="tablist" aria-label="Khu vực">
          <button type="button" role="tab" aria-selected={tab === 'mine'} className={cn(tab === 'mine' && 'is-on')} onClick={() => setTab('mine')}><Paintbrush className="ic ic-sm" /> Lịch của tôi</button>
          <button type="button" role="tab" aria-selected={tab === 'group'} className={cn(tab === 'group' && 'is-on')} onClick={() => setTab('group')}><CalendarDays className="ic ic-sm" /> Cả nhóm</button>
          <button type="button" role="tab" aria-selected={tab === 'people'} className={cn(tab === 'people' && 'is-on')} onClick={() => setTab('people')}><Users className="ic ic-sm" /> Thành viên <small>{answered.length}/{participants.length}</small></button>
        </nav>

        <div className="mt-stage" data-tab={tab}>
          <section className="mt-pane mt-pane-mine" aria-label="Lịch của tôi">
            {me ? (
              <MyCalendar key={me.id} slug={slug} state={state} me={me} cols={cols} rows={rows} lockedOf={lockedOf} onSaved={(s) => { local(s); setTab((t) => (t === 'mine' && window.innerWidth < 900 ? 'group' : t)); }} onLeft={local} />
            ) : (
              <JoinGate slug={slug} defaultName={user?.name ?? ''} ev={ev} onJoined={(s) => { local(s); setTab('mine'); }} />
            )}
          </section>

          <section className="mt-pane mt-pane-group" aria-label="Lịch cả nhóm">
            <div className="mt-card mt-grid-card">
              <div className="mt-card-head">
                <div>
                  <h2>Lịch cả nhóm</h2>
                  <p>{answered.length ? `${answered.length} người đã tô · ô càng đậm càng nhiều người rảnh` : 'Chưa ai tô lịch'}</p>
                </div>
                <HeatLegend total={answered.length} />
              </div>
              {focusId && (
                <div className="mt-focusbar">
                  <span><UserRound className="ic ic-sm" /> Đang xem lịch của <b>{participants.find((p) => p.id === focusId)?.name}</b></span>
                  <button type="button" className="mt-textbtn" onClick={() => setFocusId(null)}>Xem cả nhóm</button>
                </div>
              )}
              <GroupGrid state={state} sugs={sugs} cols={cols} rows={rows} lockedOf={lockedOf} focusId={focusId} hoverSug={hoverSug} pulse={pulse} cell={picked} setCell={setCell} setPicked={setPicked} />
            </div>
            {picked && <div className="mt-inline-detail">{detail}</div>}
          </section>

          <aside className="mt-pane mt-pane-people" aria-label="Chi tiết và thành viên">
            <div className="mt-side-detail">{detail}</div>
            <Members state={state} focusId={focusId} setFocusId={(id) => { setFocusId(id); if (id && window.innerWidth < 900) setTab('group'); }} onKick={async (p) => {
              try {
                await meetApi.kick(ev.id, p.id);
                local({ ...state, participants: participants.filter((x) => x.id !== p.id) });
                toast.success(`Đã xoá ${p.name} khỏi sự kiện`);
              } catch (e) {
                toast.error(toApiError(e).message);
              }
            }} />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

/* ───────────────────────────── header ───────────────────────────── */

function InviteButton({ ev }: { ev: MeetEventDto }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}><Link2 className="ic ic-sm" /> <span className="mt-hide-sm">Mời thành viên</span></button>
      <Modal open={open} onClose={() => setOpen(false)} title="Mời thành viên" description="Gửi link vào nhóm chat. Ai có link đều tô được lịch, không cần tài khoản." size="sm">
        <ShareLink slug={ev.slug} title={ev.title} />
      </Modal>
    </>
  );
}

function EventHead({ state }: { state: MeetStateDto }) {
  const ev = state.event;
  const blockedN = countSlots(ev.blocked);
  return (
    <header className="mt-hero">
      <div className="mt-hero-main">
        <div className="mt-hero-tags">
          <span className={cn('mt-status', ev.status === 'FINAL' ? 'is-final' : 'is-open')}>{ev.status === 'FINAL' ? <><Check className="ic ic-xs" /> Đã chốt giờ</> : <><span className="mt-status-dot" /> Đang lấy giờ rảnh</>}</span>
          <span className="mt-hero-owner">Tạo bởi <b>{ev.ownerName}</b></span>
        </div>
        <h1>{ev.title}</h1>
        {ev.description && <p className="mt-hero-desc">{ev.description}</p>}
        <ul className="mt-facts is-row">
          <li><CalendarDays className="ic ic-sm" /><span>{daysSummary(ev.days)}</span></li>
          <li><Clock3 className="ic ic-sm" /><span>{hoursSummary(ev.days)} · họp {fmtDur(ev.durationMin)}</span></li>
          {ev.location && <li><MapPin className="ic ic-sm" /><span>{ev.location}</span></li>}
          {blockedN > 0 && <li><Lock className="ic ic-sm" /><span>{ev.blockedLabel}: {fmtDur(blockedN * ev.slotMin)} bị chặn</span></li>}
        </ul>
      </div>
      {state.isOwner && (
        <div className="mt-hero-side">
          <span className="mt-lead-tag"><KeyRound className="ic ic-xs" /> Bạn là trưởng nhóm</span>
          <Link className="btn btn-ghost btn-sm" to={`/app/tools/meet/${ev.id}/edit`}><PencilLine className="ic ic-sm" /> Sửa</Link>
          <Link className="btn btn-ghost btn-sm" to="/app/tools/meet">Sự kiện của tôi</Link>
        </div>
      )}
    </header>
  );
}

function FinalBanner({ state, justFinal, onReopen }: { state: MeetStateDto; justFinal: boolean; onReopen: () => void }) {
  const ev = state.event;
  const f = ev.final!;
  const l = dayLabel(f.day);
  const date = l.date ?? (() => {
    const [, m, d] = nextDateFor(f.day).split('-');
    return `${d}/${m}`;
  })();
  const { google, ics } = calendarLinks(ev, f.day, f.start, f.end);
  const icsHref = useMemo(() => URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), [ics]);
  useEffect(() => () => URL.revokeObjectURL(icsHref), [icsHref]);
  const slots: number[] = [];
  for (let m = f.start; m < f.end; m += ev.slotMin) slots.push(m);
  const answered = state.participants.filter((p) => countSlots(p.free) || countSlots(p.busy));
  const can = answered.filter((p) => slots.every((m) => p.free[f.day]?.includes(m)));
  const cant = answered.filter((p) => !can.includes(p));
  return (
    <section className={cn('mt-final', justFinal && 'is-new')} aria-live="polite">
      <div className="mt-final-ic"><CalendarCheck2 className="ic" /></div>
      <div className="mt-final-main">
        <small>Giờ họp đã chốt</small>
        <h2>{l.long}{l.date ? `, ${l.date}` : ''} · {fmtMin(f.start)} – {fmtMin(f.end)}</h2>
        <p>
          {l.date ? '' : `Buổi gần nhất: ${l.long} ${date}. `}
          {ev.location && <>Tại {ev.location}. </>}
          {answered.length > 0 && <>{can.length}/{answered.length} người rảnh giờ này{cant.length ? ` · vắng: ${cant.map((p) => p.name).join(', ')}` : ''}.</>}
        </p>
        {f.note && <p className="mt-final-note">{f.note}</p>}
      </div>
      <div className="mt-final-act">
        <a className="btn btn-primary btn-sm" href={google} target="_blank" rel="noopener"><CalendarPlus className="ic ic-sm" /> Google Calendar</a>
        <a className="btn btn-secondary btn-sm" href={icsHref} download={`${ev.slug}.ics`}><Download className="ic ic-sm" /> Tải .ics</a>
        {state.isOwner && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReopen}>{justFinal ? <><Undo2 className="ic ic-sm" /> Hoàn tác</> : <><RotateCcw className="ic ic-sm" /> Đổi giờ</>}</button>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────────── suggestions ───────────────────────────── */

function Suggestions({ state, list, dur, setDur, hover, setHover, onFinal }: { state: MeetStateDto; list: MeetSuggestion[]; dur: number; setDur: (m: number) => void; hover: number | null; setHover: (i: number | null) => void; onFinal: (s: MeetSuggestion) => Promise<void> }) {
  const ev = state.event;
  const longest = Math.max(...ev.days.map((d) => d.end - d.start));
  const durs = [...new Set([ev.durationMin, 30, 60, 90, 120, 180])].filter((m) => m % ev.slotMin === 0 && m >= ev.slotMin && m <= longest).sort((a, b) => a - b);
  const byId = new Map(state.participants.map((p) => [p.id, p]));
  const answered = state.participants.filter((p) => countSlots(p.free) || countSlots(p.busy)).length;
  const [saving, setSaving] = useState<number | null>(null);

  return (
    <section className="mt-sug" aria-label="Giờ đề xuất">
      <div className="mt-sug-head">
        <div>
          <h2><Sparkles className="ic ic-sm" /> Kaned đề xuất</h2>
          <p>
            {!answered
              ? 'Khi có người tô lịch, Kaned sẽ tìm giờ nhiều người rảnh nhất.'
              : list[0] && !list[0].free.length
                ? `Chưa ai rảnh trọn ${fmtDur(dur)}: đây là các khung nhiều người rảnh nhất. Thử thời lượng ngắn hơn.`
                : `Đã xét mọi khung ${fmtDur(dur)} trong lịch, dựa trên ${answered} người đã tô.`}
          </p>
        </div>
        {durs.length > 1 && (
          <div className="mt-seg is-sm" role="group" aria-label="Thời lượng họp">
            {durs.map((m) => <button key={m} type="button" className={cn(dur === m && 'is-on')} onClick={() => setDur(m)}>{fmtDur(m).replace(' phút', '′').replace(' giờ', 'h').replace(/ /g, '')}</button>)}
          </div>
        )}
      </div>
      {list.length ? (
        <ol className="mt-sug-list">
          {list.map((s, i) => {
            const flex = s.flexEnd - s.flexStart > s.end - s.start;
            const part = s.free.length === 0;
            const pct = part ? s.warmth : answered ? s.free.length / answered : 0;
            return (
              <li key={`${s.day}${s.start}`} className={cn('mt-sug-card', i === 0 && 'is-top', hover === i && 'is-hover', s.full && 'is-full')} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <div className="mt-sug-rank">{i + 1}</div>
                <div className="mt-sug-body">
                  <div className="mt-sug-when">
                    <b>{dayLabel(s.day).long}{dayLabel(s.day).date ? ` ${dayLabel(s.day).date}` : ''}</b>
                    <span>{fmtMin(s.start)} – {fmtMin(s.end)}</span>
                  </div>
                  {flex && <p className="mt-sug-flex">Linh hoạt từ {fmtMin(s.flexStart)} đến {fmtMin(s.flexEnd)}</p>}
                  <div className="mt-sug-meter" aria-label={`${s.free.length}/${answered} người rảnh`}>
                    <span style={{ width: `${pct * 100}%` }} />
                  </div>
                  <div className="mt-sug-who">
                    {part ? (
                      <span className="mt-sug-count is-part">Không ai rảnh trọn khung · trung bình {Math.round(s.warmth * 100)}% rảnh</span>
                    ) : (
                      <>
                        <Stack ids={s.free} byId={byId} />
                        <span className="mt-sug-count">{s.full ? <><Check className="ic ic-xs" /> Cả nhóm rảnh</> : `${s.free.length}/${answered} người rảnh`}</span>
                      </>
                    )}
                  </div>
                  {!part && (s.busy.length > 0 || s.missing.length > 0) && (
                    <p className="mt-sug-miss">
                      {s.busy.length > 0 && <span className="is-busy"><Ban className="ic ic-xs" /> Bận: {s.busy.map((id) => `${byId.get(id)?.name}${byId.get(id)?.busyNote ? ` (${byId.get(id)?.busyNote})` : ''}`).join(', ')}</span>}
                      {s.missing.length > 0 && <span>Chưa rảnh: {s.missing.map((id) => byId.get(id)?.name).join(', ')}</span>}
                    </p>
                  )}
                </div>
                {state.isOwner ? (
                  <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} loading={saving === i} icon={<CalendarCheck2 className="ic ic-sm" />} onClick={async () => { setSaving(i); await onFinal(s); setSaving(null); }}>
                    Chốt
                  </Button>
                ) : (
                  i === 0 && <span className="mt-sug-wait">Chờ trưởng nhóm chốt</span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-sug-empty">{answered ? `Không còn khung ${fmtDur(dur)} nào liền mạch ngoài giờ bị chặn. Thử thời lượng ngắn hơn.` : <><CircleHelp className="ic ic-sm" /> Mời mọi người mở link và tô giờ rảnh.</>}</p>
      )}
    </section>
  );
}

function Stack({ ids, byId, max = 5 }: { ids: string[]; byId: Map<string, MeetParticipantDto>; max?: number }) {
  return (
    <span className="mt-stack">
      {ids.slice(0, max).map((id) => <Avatar key={id} name={byId.get(id)?.name ?? '?'} size="xs" />)}
      {ids.length > max && <span className="mt-stack-more">+{ids.length - max}</span>}
    </span>
  );
}

function HeatLegend({ total }: { total: number }) {
  const steps = Math.min(Math.max(total, 1), 6);
  return (
    <div className="mt-legend" aria-label="Chú thích">
      <span>0</span>
      <span className="mt-legend-bar">
        {Array.from({ length: steps + 1 }, (_, i) => <i key={i} style={{ background: heatColor(i / steps) }} />)}
      </span>
      <span>{total || 'N'} rảnh</span>
      <span className="mt-legend-k is-busy" title="Có người chắc chắn bận" />
      <span className="mt-legend-k is-lock" title="Trưởng nhóm chặn" />
    </div>
  );
}

/* ───────────────────────────── group grid ───────────────────────────── */

function GroupGrid({ state, sugs, cols, rows, lockedOf, focusId, hoverSug, pulse, cell, setCell, setPicked }: {
  state: MeetStateDto; sugs: MeetSuggestion[]; cols: ReturnType<typeof colsOf>; rows: number[]; lockedOf: (d: string, m: number) => boolean; focusId: string | null; hoverSug: number | null; pulse: Set<string>; cell: Cell | null; setCell: (c: Cell | null) => void; setPicked: (f: (c: Cell | null) => Cell | null) => void;
}) {
  const ev = state.event;
  const answered = useMemo(() => state.participants.filter((p) => countSlots(p.free) || countSlots(p.busy)), [state.participants]);
  const heat = useMemo(() => heatOf(answered), [answered]);
  const focus = useMemo(() => {
    const p = state.participants.find((x) => x.id === focusId);
    if (!p) return null;
    const set = (s: MeetSlots) => new Set(Object.entries(s).flatMap(([d, l]) => l.map((m) => `${d}|${m}`)));
    return { free: set(p.free), busy: set(p.busy) };
  }, [focusId, state.participants]);
  const overlays: GridOverlay[] = [];
  if (ev.final) overlays.push({ day: ev.final.day, start: ev.final.start, end: ev.final.end, kind: 'final', label: <><Check className="ic ic-xs" /> Đã chốt</> });
  if (!focus) {
    const h = hoverSug != null ? sugs[hoverSug] : undefined;
    // The stretch the same people stay free: any start inside it works.
    if (h && h.flexEnd - h.flexStart > h.end - h.start) overlays.push({ day: h.day, start: h.flexStart, end: h.flexEnd, kind: 'flex' });
    sugs.forEach((s, i) => overlays.push({ day: s.day, start: s.start, end: s.end, kind: hoverSug === i ? 'hover' : 'suggest', label: i + 1 }));
  }
  return (
    <div className="mt-gridwrap">
      <TimeGrid
        label="Lịch rảnh cả nhóm"
        variant="heat"
        cols={cols}
        rows={rows}
        slotMin={ev.slotMin}
        heat={heat}
        total={answered.length}
        lockedOf={lockedOf}
        focus={focus}
        overlays={overlays}
        pulse={pulse}
        selected={cell}
        onHover={setCell}
        onPick={(c) => setPicked((cur) => (cur && cur.day === c.day && cur.m === c.m ? null : c))}
      />
    </div>
  );
}

/* ───────────────────────────── cell detail ───────────────────────────── */

function CellDetail({ state, dur, cell, pinned, onUnpin, onFinal }: { state: MeetStateDto; dur: number; cell: Cell | null; pinned: boolean; onUnpin: () => void; onFinal: (c: { day: string; start: number; end: number }) => Promise<void> }) {
  const ev = state.event;
  const [saving, setSaving] = useState(false);
  if (!cell) {
    return (
      <div className="mt-card mt-detail is-empty">
        <span className="mt-detail-ic"><CircleHelp className="ic" /></span>
        <p><b>Ai rảnh lúc nào?</b>Rê chuột hoặc chạm vào một ô trên lịch nhóm để xem ai rảnh, ai bận và vì sao.</p>
      </div>
    );
  }
  const l = dayLabel(cell.day);
  const locked = ev.blocked[cell.day]?.includes(cell.m);
  const answered = state.participants.filter((p) => countSlots(p.free) || countSlots(p.busy));
  const pending = state.participants.filter((p) => !answered.includes(p));
  const free = answered.filter((p) => p.free[cell.day]?.includes(cell.m));
  const busy = answered.filter((p) => p.busy[cell.day]?.includes(cell.m));
  const no = answered.filter((p) => !free.includes(p) && !busy.includes(p));
  const end = cell.m + dur;
  const canFinal = state.isOwner && ev.status === 'OPEN' && validMeetRange(ev, cell.day, cell.m, end);
  return (
    <div className="mt-card mt-detail">
      <div className="mt-detail-head">
        <div>
          <b>{l.long}{l.date ? ` ${l.date}` : ''}</b>
          <span>{fmtMin(cell.m)} – {fmtMin(cell.m + ev.slotMin)}</span>
        </div>
        {pinned && <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onUnpin} aria-label="Bỏ chọn ô"><X className="ic ic-sm" /></button>}
      </div>
      {locked ? (
        <p className="mt-detail-lock"><Lock className="ic ic-sm" /> Trưởng nhóm đã chặn giờ này: <b>{ev.blockedLabel || 'không thể họp'}</b></p>
      ) : (
        <>
          <div className="mt-detail-meter"><span style={{ width: `${answered.length ? (free.length / answered.length) * 100 : 0}%` }} /></div>
          <p className="mt-detail-sum"><b>{free.length}</b>/{answered.length} người rảnh{busy.length ? ` · ${busy.length} chắc chắn bận` : ''}</p>
          <Group title="Rảnh" tone="free" people={free} />
          <Group title="Chắc chắn bận" tone="busy" people={busy} note />
          <Group title="Không chọn giờ này" tone="no" people={no} />
          {pending.length > 0 && <Group title="Chưa tô lịch" tone="pending" people={pending} />}
          {canFinal && (
            <Button block size="sm" loading={saving} icon={<CalendarCheck2 className="ic ic-sm" />} onClick={async () => { setSaving(true); await onFinal({ day: cell.day, start: cell.m, end }); setSaving(false); }}>
              Chốt {fmtMin(cell.m)} – {fmtMin(end)}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, tone, people, note }: { title: string; tone: 'free' | 'busy' | 'no' | 'pending'; people: MeetParticipantDto[]; note?: boolean }) {
  if (!people.length) return null;
  return (
    <div className={cn('mt-group', `is-${tone}`)}>
      <h4>{title} <span>{people.length}</span></h4>
      <ul>
        {people.map((p) => (
          <li key={p.id}>
            <Avatar name={p.name} size="xs" />
            <span>{p.name}</span>
            {note && p.busyNote && <em>{p.busyNote}</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────────── members ───────────────────────────── */

function Members({ state, focusId, setFocusId, onKick }: { state: MeetStateDto; focusId: string | null; setFocusId: (id: string | null) => void; onKick: (p: MeetParticipantDto) => Promise<void> }) {
  const ev = state.event;
  const [kick, setKick] = useState<MeetParticipantDto | null>(null);
  const [busy, setBusy] = useState(false);
  const list = [...state.participants].sort((a, b) => Number(Boolean(b.savedAt)) - Number(Boolean(a.savedAt)) || (b.savedAt ?? 0) - (a.savedAt ?? 0));
  return (
    <div className="mt-card mt-people">
      <div className="mt-card-head">
        <div>
          <h2>Thành viên</h2>
          <p>{state.participants.length ? 'Chạm vào tên để xem lịch người đó' : 'Chưa ai tham gia'}</p>
        </div>
      </div>
      {list.length > 0 && (
        <ul className="mt-people-list">
          {list.map((p) => {
            const f = countSlots(p.free);
            const b = countSlots(p.busy);
            const mine = p.id === state.me?.id;
            return (
              <li key={p.id} className={cn(focusId === p.id && 'is-on', !p.savedAt && 'is-pending')}>
                <button type="button" className="mt-person" onClick={() => setFocusId(focusId === p.id ? null : p.id)} aria-pressed={focusId === p.id}>
                  <Avatar name={p.name} size="sm" />
                  <span className="mt-person-main">
                    <span className="mt-person-name">
                      <span className="mt-person-n">{p.name}</span>
                      {p.isOwner && <span className="mt-tag is-lead">Trưởng nhóm</span>}
                      {mine && <span className="mt-tag">Bạn</span>}
                      {p.savedAt && <time className="mt-person-time">{fmtRelative(new Date(p.savedAt).toISOString())}</time>}
                    </span>
                    <span className="mt-person-sub">
                      {f || b ? (
                        <>
                          {f > 0 && <span className="is-free">Rảnh {fmtDur(f * ev.slotMin)}</span>}
                          {b > 0 && <span className="is-busy">Bận {fmtDur(b * ev.slotMin)}{p.busyNote ? ` · ${p.busyNote}` : ''}</span>}
                        </>
                      ) : (
                        <span>Chưa tô lịch</span>
                      )}
                    </span>
                  </span>
                </button>
                {state.isOwner && !mine && (
                  <button type="button" className="mt-person-x" onClick={() => setKick(p)} aria-label={`Xoá ${p.name}`} title="Xoá khỏi sự kiện"><X className="ic ic-xs" /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={Boolean(kick)}
        onClose={() => !busy && setKick(null)}
        title={`Xoá ${kick?.name ?? ''} khỏi sự kiện?`}
        description="Lịch người này đã tô sẽ bị xoá. Họ vẫn có thể vào lại bằng link."
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setKick(null)} disabled={busy}>Huỷ</Button><Button variant="danger" loading={busy} onClick={async () => { setBusy(true); await onKick(kick!); setBusy(false); setKick(null); }}>Xoá</Button></>}
      />
    </div>
  );
}

/* ───────────────────────────── join ───────────────────────────── */

function JoinGate({ slug, defaultName, ev, onJoined }: { slug: string; defaultName: string; ev: MeetEventDto; onJoined: (s: MeetStateDto) => void }) {
  const [name, setName] = useState(defaultName);
  const [pin, setPin] = useState('');
  const [wantPin, setWantPin] = useState(false);
  const [need, setNeed] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [back, setBack] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr('Nhập tên để mọi người biết bạn là ai.');
    if ((wantPin || need) && pin && !/^\d{4}$/.test(pin)) return setErr('Mã PIN gồm đúng 4 chữ số.');
    setBusy(true);
    setErr('');
    try {
      onJoined(await meetApi.join(slug, name.trim(), wantPin || need ? pin || undefined : undefined));
    } catch (x) {
      const a = toApiError(x);
      if (a.code === 'PIN_REQUIRED' || a.code === 'PIN_WRONG') setNeed(true);
      setErr(a.message);
    } finally {
      setBusy(false);
    }
  };
  if (ev.status === 'FINAL' && !back) {
    return (
      <div className="mt-card mt-join is-final">
        <span className="mt-join-lock"><Lock className="ic" /></span>
        <h2>Đã chốt giờ họp</h2>
        <p>Trưởng nhóm đã chọn giờ nên không cần tô lịch nữa. Xem giờ chốt ở trên và thêm vào lịch của bạn.</p>
        <button type="button" className="mt-textbtn" onClick={() => setBack(true)}>Bạn đã tô lịch trước đó? Mở lại lịch của bạn</button>
      </div>
    );
  }
  return (
    <div className="mt-card mt-join">
      <div className="mt-join-art" aria-hidden>
        {Array.from({ length: 21 }, (_, i) => <i key={i} style={{ background: heatColor([0, .2, .5, .9, .6, .3, 0][i % 7]! * ((i % 3) + 1) / 3) }} />)}
      </div>
      <h2>Bạn là ai?</h2>
      <p>Nhập tên để tô giờ rảnh của bạn. Không cần đăng ký, mọi người trong nhóm sẽ thấy tên này.</p>
      <form onSubmit={submit} className="mt-join-form">
        <Input icon={<UserRound className="ic" />} value={name} onChange={(e) => { setName(e.target.value); setNeed(false); setErr(''); }} maxLength={40} placeholder="Tên của bạn, ví dụ Minh Anh" autoFocus={!window.matchMedia('(pointer: coarse)').matches} aria-label="Tên của bạn" />
        {need ? (
          <Input icon={<KeyRound className="ic" />} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Mã PIN 4 số của bạn" aria-label="Mã PIN" autoFocus />
        ) : (
          <>
            <label className="mt-check">
              <input type="checkbox" checked={wantPin} onChange={(e) => setWantPin(e.target.checked)} />
              <span>Đặt mã PIN để sửa lịch trên máy khác <small>(không bắt buộc)</small></span>
            </label>
            {wantPin && <Input icon={<KeyRound className="ic" />} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="4 chữ số" aria-label="Mã PIN mới" />}
          </>
        )}
        {err && <p className="mt-err" role="alert">{err}</p>}
        <Button type="submit" size="lg" block loading={busy} icon={<Paintbrush className="ic" />}>Vào tô lịch</Button>
      </form>
      <p className="mt-join-foot">Chỉ xem? Lịch cả nhóm{ev.status === 'OPEN' ? ' và giờ đề xuất' : ''} luôn hiện, không cần nhập tên.</p>
    </div>
  );
}

/* ───────────────────────────── my calendar ───────────────────────────── */

function MyCalendar({ slug, state, me, cols, rows, lockedOf, onSaved, onLeft }: {
  slug: string; state: MeetStateDto; me: MeetParticipantDto; cols: ReturnType<typeof colsOf>; rows: number[]; lockedOf: (d: string, m: number) => boolean; onSaved: (s: MeetStateDto) => void; onLeft: (s: MeetStateDto) => void;
}) {
  const ev = state.event;
  const toast = useToast();
  const server = useMemo(() => ({ free: toMap(me.free), busy: toMap(me.busy), note: me.busyNote }), [me.free, me.busy, me.busyNote]);
  const [free, setFree] = useState<SlotMap>(() => restore(slug, 'free') ?? server.free);
  const [busy, setBusy] = useState<SlotMap>(() => restore(slug, 'busy') ?? server.busy);
  const [note, setNote] = useState<string>(() => restoreNote(slug) ?? (me.busyNote || ev.blockedLabel || 'Lịch học'));
  const [tool, setTool] = useState<PaintTool>('free');
  const hist = useRef<Array<{ free: SlotMap; busy: SlotMap }>>([]);
  const [, bump] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);
  const [mark, setMark] = useState<{ day: string; m: number } | null>(null);
  const [quick, setQuick] = useState(false);
  const locked = ev.status === 'FINAL';
  const busyN = sizeOf(busy);
  const noteNow = busyN ? note.trim() : '';
  const dirty = !sameMap(free, server.free) || !sameMap(busy, server.busy) || (busyN > 0 && noteNow !== (server.note || ''));

  // Unsaved painting survives a refresh; it is cleared once saved.
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(DRAFT(slug), JSON.stringify({ free: toSlots(free), busy: toSlots(busy), note }));
      else localStorage.removeItem(DRAFT(slug));
    } catch {
      /* ignore */
    }
  }, [dirty, free, busy, note, slug]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // Someone else (another tab, the leader removing a slot) changed my answers while I had nothing pending.
  const serverKey = slotsKey(me.free) + slotsKey(me.busy);
  const lastKey = useRef(serverKey);
  useEffect(() => {
    if (lastKey.current === serverKey) return;
    lastKey.current = serverKey;
    if (!dirtyRef.current) {
      setFree(server.free);
      setBusy(server.busy);
    }
  }, [serverKey, server]);

  // The leader picked the time: answers are frozen, so unsaved painting goes.
  useEffect(() => {
    if (!locked) return;
    setConfirm(false);
    setRangeMode(false);
    if (dirtyRef.current) {
      setFree(server.free);
      setBusy(server.busy);
      setNote(server.note || ev.blockedLabel || 'Lịch học');
      hist.current = [];
      toast.info('Lịch đã khoá', 'Trưởng nhóm vừa chốt giờ, phần bạn tô chưa lưu đã được bỏ.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const stateOf = useCallback((d: string, m: number): CellState => (has(busy, d, m) ? 'busy' : has(free, d, m) ? 'free' : null), [free, busy]);
  const paint = useCallback((cells: Array<[string, number]>, to: CellState) => {
    hist.current = [...hist.current.slice(-49), { free, busy }];
    bump((n) => n + 1);
    if (to === 'free') {
      setFree(setCells(free, cells, true));
      setBusy(setCells(busy, cells, false));
    } else if (to === 'busy') {
      setBusy(setCells(busy, cells, true));
      setFree(setCells(free, cells, false));
    } else {
      setFree(setCells(free, cells, false));
      setBusy(setCells(busy, cells, false));
    }
  }, [free, busy]);
  const undo = useCallback(() => {
    const h = hist.current.pop();
    if (!h) return;
    setFree(h.free);
    setBusy(h.busy);
    bump((n) => n + 1);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).closest('input,textarea')) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [undo]);

  const reset = () => {
    hist.current = [...hist.current, { free, busy }];
    setFree(server.free);
    setBusy(server.busy);
    setNote(server.note || ev.blockedLabel || 'Lịch học');
  };
  const save = async () => {
    setSaving(true);
    try {
      const s = await meetApi.save(slug, toSlots(free), toSlots(busy), noteNow);
      localStorage.removeItem(DRAFT(slug));
      hist.current = [];
      setConfirm(false);
      onSaved(s);
      toast.success('Đã lưu lịch của bạn', 'Lịch cả nhóm đã cập nhật cho mọi người.');
    } catch (e) {
      toast.error('Chưa lưu được', toApiError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const freeN = sizeOf(free);
  const daysOf = (m: SlotMap) => [...m].filter(([, s]) => s.size).length;
  const forget = () => {
    meetToken.clear(slug);
    localStorage.removeItem(DRAFT(slug));
    onLeft({ ...state, me: null });
  };

  return (
    <div className={cn('mt-card mt-grid-card mt-mine', dirty && 'is-dirty')}>
      <div className="mt-card-head">
        <div>
          <h2>Lịch của tôi</h2>
          <p className="mt-me">
            <Avatar name={me.name} size="xs" /> <b>{me.name}</b>
            {me.savedAt ? <span>· lưu {fmtRelative(new Date(me.savedAt).toISOString())}</span> : <span>· chưa lưu</span>}
          </p>
        </div>
        <div className="mt-menu">
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Tuỳ chọn" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><MoreHorizontal className="ic ic-sm" /></button>
          {menu && (
            <>
              <div className="mt-menu-scrim" onClick={() => setMenu(false)} />
              <div className="mt-menu-pop" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setPinOpen(true); }}><KeyRound className="ic ic-sm" /> {state.me?.hasPin ? 'Đổi mã PIN' : 'Đặt mã PIN'}</button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); forget(); }}><LogOut className="ic ic-sm" /> Không phải {me.name}?</button>
                {!locked && <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(false); setLeaveOpen(true); }}><Trash2 className="ic ic-sm" /> Xoá câu trả lời của tôi</button>}
              </div>
            </>
          )}
        </div>
      </div>

      {locked ? (
        <div className="mt-locked" role="status">
          <Lock className="ic ic-sm" />
          <p>
            <b>Lịch đã khoá vì trưởng nhóm đã chốt giờ họp.</b>
            {state.isOwner ? ' Bấm "Đổi giờ" ở trên để mở lại cho mọi người sửa.' : ' Nếu cần đổi, nhắn trưởng nhóm mở lại.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-toolbar" role="toolbar" aria-label="Công cụ tô">
            <div className="mt-seg">
              <button type="button" className={cn('is-free-t', tool === 'free' && 'is-on')} onClick={() => setTool('free')} aria-pressed={tool === 'free'}><span className="mt-sw is-free" /> Rảnh</button>
              <button type="button" className={cn('is-busy-t', tool === 'busy' && 'is-on')} onClick={() => setTool('busy')} aria-pressed={tool === 'busy'}><span className="mt-sw is-busy" /> Chắc chắn bận</button>
              <button type="button" className={cn(tool === 'erase' && 'is-on')} onClick={() => setTool('erase')} aria-pressed={tool === 'erase'}><Eraser className="ic ic-sm" /> Xoá</button>
            </div>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={undo} disabled={!hist.current.length} aria-label="Hoàn tác" title="Hoàn tác (Ctrl+Z)"><Undo2 className="ic ic-sm" /></button>
          </div>
          <div className="mt-toolbar2">
            <button type="button" className={cn('mt-mode', rangeMode && 'is-on')} onClick={() => setRangeMode((v) => !v)} aria-pressed={rangeMode} title="Chạm ô bắt đầu rồi chạm ô kết thúc để tô cả vùng">
              <SquareDashedMousePointer className="ic ic-sm" /> Chọn 2 điểm
            </button>
            <button type="button" className={cn('mt-mode', quick && 'is-on')} onClick={() => setQuick((v) => !v)} aria-expanded={quick}>
              <Clock4 className="ic ic-sm" /> Nhập giờ
            </button>
          </div>
          {quick && <QuickFill ev={ev} tool={tool} lockedOf={lockedOf} onFill={(cells, to) => paint(cells, to)} />}
          {tool === 'busy' && (
            <div className="mt-note">
              <label htmlFor="mt-note">Lý do bận</label>
              <input id="mt-note" className="input input-sm" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Lịch học, đi làm thêm…" />
              <div className="mt-note-chips">
                {['Lịch học', 'Đi làm', 'Việc riêng'].map((x) => <button key={x} type="button" className={cn('mt-chip is-sm', note === x && 'is-on')} onClick={() => setNote(x)}>{x}</button>)}
              </div>
            </div>
          )}
          <p className={cn('mt-hint', (mark || rangeMode) && 'is-range')} aria-live="polite">
            {mark ? (
              <>
                <b>Ô bắt đầu: {dayLabel(mark.day).short}{dayLabel(mark.day).date ? ` ${dayLabel(mark.day).date}` : ''} {fmtMin(mark.m)}.</b>{' '}
                {rangeMode ? 'Chạm ô kết thúc để tô cả vùng.' : 'Nháy đúp hoặc Shift + click ô kết thúc để tô cả vùng.'} Chạm lại ô bắt đầu hoặc bấm Esc để huỷ.
              </>
            ) : rangeMode ? (
              'Chạm ô bắt đầu, rồi chạm ô kết thúc: mọi ô ở giữa sẽ được tô.'
            ) : (
              <>
                <span className="mt-hide-touch">Kéo để tô một vùng. Vùng dài: bấm ô đầu rồi <kbd>Shift</kbd> + click ô cuối, hoặc nháy đúp ô đầu và nháy đúp ô cuối. Bấm tên thứ để tô cả ngày.</span>
                <span className="mt-show-touch">Chạm để chọn một ô, giữ rồi kéo để tô nhiều ô. Vùng dài: bật "Chọn 2 điểm" hoặc "Nhập giờ".</span>
              </>
            )}
          </p>
        </>
      )}
      <div className="mt-gridwrap">
        <TimeGrid label="Lịch của tôi" variant="paint" cols={cols} rows={rows} slotMin={ev.slotMin} tool={tool} stateOf={stateOf} onPaint={paint} lockedOf={lockedOf} readOnly={locked} rangeMode={rangeMode} onMark={setMark} />
      </div>

      {!locked && (
      <div className={cn('mt-savebar', dirty && 'is-on')}>
        <div className="mt-savebar-t">
          {dirty ? <><b>Chưa lưu</b><span>Rảnh {fmtDur(freeN * ev.slotMin)}{busyN ? ` · bận ${fmtDur(busyN * ev.slotMin)}` : ''}</span></> : <><Check className="ic ic-sm" /><span>{me.savedAt ? 'Đã lưu, mọi người đang thấy lịch này' : 'Tô giờ rảnh rồi bấm Lưu'}</span></>}
        </div>
        {dirty && <button type="button" className="btn btn-ghost btn-sm" onClick={reset} aria-label="Bỏ thay đổi" title="Bỏ thay đổi"><RotateCcw className="ic ic-sm" /><span className="mt-hide-sm">Bỏ thay đổi</span></button>}
        <Button size="sm" icon={<Save className="ic ic-sm" />} disabled={!dirty} onClick={() => setConfirm(true)}>Lưu lịch</Button>
      </div>
      )}

      <Modal
        open={confirm}
        onClose={() => !saving && setConfirm(false)}
        title="Lưu lịch của bạn?"
        description="Lịch cả nhóm và giờ đề xuất sẽ cập nhật ngay cho mọi người."
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)} disabled={saving}>Tô tiếp</Button><Button loading={saving} onClick={save} icon={<Check className="ic ic-sm" />}>Xác nhận lưu</Button></>}
      >
        <dl className="mt-confirm">
          <div><dt><span className="mt-sw is-free" /> Rảnh</dt><dd>{freeN ? `${fmtDur(freeN * ev.slotMin)} trong ${daysOf(free)} ngày` : 'Chưa chọn giờ nào'}</dd></div>
          <div><dt><span className="mt-sw is-busy" /> Chắc chắn bận</dt><dd>{busyN ? `${fmtDur(busyN * ev.slotMin)}${noteNow ? ` · ${noteNow}` : ''}` : 'Không có'}</dd></div>
        </dl>
        {!freeN && <p className="mt-warn">Bạn chưa tô giờ rảnh nào. Kaned sẽ coi như bạn không rảnh lúc nào.</p>}
      </Modal>
      <PinModal open={pinOpen} onClose={() => setPinOpen(false)} slug={slug} name={me.name} hasPin={Boolean(state.me?.hasPin)} onDone={() => onLeft({ ...state, me: state.me ? { ...state.me, hasPin: true } : null })} />
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Xoá câu trả lời của bạn?"
        description={`Tên "${me.name}" và lịch bạn đã tô sẽ bị xoá khỏi sự kiện.`}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setLeaveOpen(false)}>Huỷ</Button><Button variant="danger" onClick={async () => {
          try {
            await meetApi.leave(slug);
            localStorage.removeItem(DRAFT(slug));
            setLeaveOpen(false);
            onLeft({ ...state, me: null, participants: state.participants.filter((p) => p.id !== me.id) });
          } catch (e) {
            toast.error(toApiError(e).message);
          }
        }}>Xoá</Button></>}
      />
    </div>
  );
}

/** "From 18:00 to 20:00 on these days": paint a long stretch without dragging. */
function QuickFill({ ev, tool, lockedOf, onFill }: { ev: MeetEventDto; tool: PaintTool; lockedOf: (d: string, m: number) => boolean; onFill: (cells: Array<[string, number]>, to: CellState) => void }) {
  const days = useMemo(() => colsOf(ev.days), [ev.days]);
  const lo = Math.min(...ev.days.map((d) => d.start));
  const hi = Math.max(...ev.days.map((d) => d.end));
  const times: number[] = [];
  for (let m = lo; m <= hi; m += ev.slotMin) times.push(m);
  const [from, setFrom] = useState(() => Math.max(lo, Math.min(hi - ev.slotMin, 18 * 60 - (18 * 60 - lo) % ev.slotMin)));
  const [to, setTo] = useState(() => Math.min(hi, from + 2 * 60));
  const [pick, setPick] = useState<string[]>([]);
  const target = pick.length ? pick : days.map((d) => d.key);
  const cells: Array<[string, number]> = [];
  for (const d of days) {
    if (!target.includes(d.key)) continue;
    for (let m = from; m < to; m += ev.slotMin) if (m >= d.start && m + ev.slotMin <= d.end && !lockedOf(d.key, m)) cells.push([d.key, m]);
  }
  const label = tool === 'busy' ? 'Tô bận' : tool === 'erase' ? 'Xoá' : 'Tô rảnh';
  return (
    <div className="mt-quickfill">
      <div className="mt-quickfill-row">
        <label>Từ <select className="input input-sm mt-time" value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (to <= v) setTo(Math.min(hi, v + ev.slotMin)); }}>{times.slice(0, -1).map((m) => <option key={m} value={m}>{fmtMin(m)}</option>)}</select></label>
        <label>đến <select className="input input-sm mt-time" value={to} onChange={(e) => setTo(Number(e.target.value))}>{times.filter((m) => m > from).map((m) => <option key={m} value={m}>{m === 1440 ? '24:00' : fmtMin(m)}</option>)}</select></label>
      </div>
      <div className="mt-quickfill-days" role="group" aria-label="Ngày áp dụng">
        <button type="button" className={cn('mt-chip is-sm', !pick.length && 'is-on')} onClick={() => setPick([])}>Mọi ngày</button>
        {days.map((d) => (
          <button key={d.key} type="button" className={cn('mt-chip is-sm', pick.includes(d.key) && 'is-on')} onClick={() => setPick((x) => (x.includes(d.key) ? x.filter((k) => k !== d.key) : [...x, d.key]))}>
            {d.head}{d.sub?.includes('/') ? ` ${d.sub}` : ''}
          </button>
        ))}
      </div>
      <Button size="sm" variant={tool === 'erase' ? 'secondary' : 'primary'} disabled={!cells.length} onClick={() => onFill(cells, tool === 'erase' ? null : tool)}>
        {label} {fmtMin(from)}–{fmtMin(to)} · {cells.length} ô
      </Button>
    </div>
  );
}

function restore(slug: string, which: 'free' | 'busy'): SlotMap | null {
  try {
    const raw = localStorage.getItem(DRAFT(slug));
    if (!raw) return null;
    return toMap((JSON.parse(raw) as { free: MeetSlots; busy: MeetSlots })[which]);
  } catch {
    return null;
  }
}
function restoreNote(slug: string): string | null {
  try {
    const raw = localStorage.getItem(DRAFT(slug));
    return raw ? ((JSON.parse(raw) as { note?: string }).note ?? null) : null;
  } catch {
    return null;
  }
}

function PinModal({ open, onClose, slug, name, hasPin, onDone }: { open: boolean; onClose: () => void; slug: string; name: string; hasPin: boolean; onDone: () => void }) {
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setPin('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hasPin ? 'Đổi mã PIN' : 'Đặt mã PIN'}
      description={`Trên máy khác, nhập tên "${name}" cùng mã này để sửa lịch của bạn.`}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button loading={busy} disabled={!/^\d{4}$/.test(pin)} onClick={async () => {
        setBusy(true);
        try {
          await meetApi.setPin(slug, pin);
          toast.success('Đã đặt mã PIN');
          onDone();
          onClose();
        } catch (e) {
          toast.error(toApiError(e).message);
        } finally {
          setBusy(false);
        }
      }}>Lưu mã</Button></>}
    >
      <Input icon={<KeyRound className="ic" />} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="4 chữ số" autoFocus aria-label="Mã PIN" />
    </Modal>
  );
}
