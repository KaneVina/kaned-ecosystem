import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, CircleCheckBig, Clock3, Eraser, Lock, MapPin, PartyPopper, Plus, RotateCcw, Sparkles, Users } from 'lucide-react';
import {
  MEET_MAX_DAYS, MEET_RETENTION_DAYS, MEET_WEEKDAYS, cleanSlots, dayLabel, fmtDur, fmtMin, gridRows, meetEventInputSchema, sortDays,
  type MeetDay, type MeetEventDto, type MeetEventInput,
} from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHead } from '@/components/ui/Panel';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { meetApi } from './api';
import { TIME_OPTIONS, colsOf, daysSummary, has, hoursSummary, setCells, sizeOf, toMap, toSlots, type SlotMap } from './model';
import { ShareLink } from './Share';
import { TimeGrid, type PaintTool } from './TimeGrid';
import './meet.css';

const DRAFT_KEY = 'meet:draft';
const DURATIONS = [30, 45, 60, 90, 120, 180];
const PLACES = ['Google Meet', 'Microsoft Teams', 'Discord', 'Thư viện', 'Phòng tự học'];

interface Draft {
  title: string;
  description: string;
  location: string;
  mode: 'WEEKLY' | 'DATES';
  weekdays: string[];
  dates: string[];
  start: number;
  end: number;
  custom: Record<string, { start: number; end: number }>;
  slotMin: 15 | 30 | 60;
  durationMin: number;
  blocked: Record<string, number[]>;
  blockedLabel: string;
}
const fresh = (): Draft => ({
  title: '',
  description: '',
  location: '',
  mode: 'WEEKLY',
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  dates: [],
  start: 18 * 60,
  end: 22 * 60,
  custom: {},
  slotMin: 30,
  durationMin: 60,
  blocked: {},
  blockedLabel: 'Lịch học',
});
const fromEvent = (e: MeetEventDto): Draft => {
  const keys = e.days.map((d) => d.key);
  const start = Math.min(...e.days.map((d) => d.start));
  const end = Math.max(...e.days.map((d) => d.end));
  const custom: Draft['custom'] = {};
  for (const d of e.days) if (d.start !== start || d.end !== end) custom[d.key] = { start: d.start, end: d.end };
  return {
    title: e.title,
    description: e.description,
    location: e.location,
    mode: e.mode,
    weekdays: e.mode === 'WEEKLY' ? keys : ['mon', 'tue', 'wed', 'thu', 'fri'],
    dates: e.mode === 'DATES' ? keys : [],
    start,
    end,
    custom,
    slotMin: e.slotMin as Draft['slotMin'],
    durationMin: e.durationMin,
    blocked: e.blocked,
    blockedLabel: e.blockedLabel,
  };
};

const todayIso = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Leader: describe the meeting, see the invitation take shape on the right, then get the link. */
export default function MeetCreatePage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const existing = useQuery({ queryKey: ['meet', 'own', id], queryFn: () => meetApi.get(id!), enabled: editing });
  if (editing && existing.isLoading) return <div className="container"><Skeleton style={{ height: 420, marginTop: 24 }} /></div>;
  if (editing && (existing.isError || !existing.data)) return <div className="container"><ErrorState description={(existing.error as Error | null)?.message} onRetry={() => existing.refetch()} /></div>;
  return <Editor key={id ?? 'new'} existing={existing.data} />;
}

function Editor({ existing }: { existing?: MeetEventDto }) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => {
    if (existing) return fromEvent(existing);
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? { ...fresh(), ...(JSON.parse(raw) as Partial<Draft>) } : fresh();
    } catch {
      return fresh();
    }
  });
  const [tool, setTool] = useState<PaintTool>('blocked');
  const [quick, setQuick] = useState({ start: 7 * 60 + 30, end: 9 * 60 + 50, days: [] as string[] });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<MeetEventDto | null>(null);
  const [err, setErr] = useState('');
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (existing || done) return;
    const t = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(d)), 250);
    return () => clearTimeout(t);
  }, [d, existing, done]);

  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const keys = d.mode === 'WEEKLY' ? MEET_WEEKDAYS.map((w) => w.key).filter((k) => d.weekdays.includes(k)) : [...d.dates].sort();
  const days: MeetDay[] = useMemo(
    () => sortDays(keys.map((k) => ({ key: k, start: d.custom[k]?.start ?? d.start, end: d.custom[k]?.end ?? d.end }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys.join(','), d.start, d.end, d.custom],
  );
  // Slots must line up with the cell size.
  const snap = (m: number) => Math.round(m / d.slotMin) * d.slotMin;
  const blocked = useMemo(() => cleanSlots(d.blocked, days.filter((x) => x.end > x.start), d.slotMin), [d.blocked, days, d.slotMin]);
  const blockedMap = useMemo(() => toMap(blocked), [blocked]);
  const blockedCount = sizeOf(blockedMap);
  const cols = colsOf(days.filter((x) => x.end > x.start));
  const rows = gridRows(days.filter((x) => x.end > x.start), d.slotMin);
  const slotsTotal = days.reduce((n, x) => n + Math.max(0, (x.end - x.start) / d.slotMin), 0);

  const input: MeetEventInput = {
    title: d.title,
    description: d.description,
    location: d.location,
    mode: d.mode,
    days,
    slotMin: d.slotMin,
    durationMin: d.durationMin,
    blocked,
    blockedLabel: d.blockedLabel,
  };
  const parsed = meetEventInputSchema.safeParse(input);
  const issues = parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.message))];
  const checks = [
    { ok: d.title.trim().length >= 3, label: 'Đặt tên sự kiện' },
    { ok: days.length > 0, label: 'Chọn ngày họp' },
    { ok: days.length > 0 && days.every((x) => x.end > x.start), label: 'Khung giờ mỗi ngày hợp lệ' },
    { ok: d.durationMin % d.slotMin === 0, label: 'Thời lượng khớp độ dài ô' },
  ];
  const ready = parsed.success;

  const toggleDay = (k: string) => patch({ weekdays: d.weekdays.includes(k) ? d.weekdays.filter((x) => x !== k) : [...d.weekdays, k] });
  const toggleDate = (k: string) => {
    if (d.dates.includes(k)) patch({ dates: d.dates.filter((x) => x !== k) });
    else if (d.dates.length < MEET_MAX_DAYS) patch({ dates: [...d.dates, k] });
    else toast.info(`Tối đa ${MEET_MAX_DAYS} ngày`);
  };
  const setDayTime = (k: string, which: 'start' | 'end', v: number) => {
    const cur = d.custom[k] ?? { start: d.start, end: d.end };
    patch({ custom: { ...d.custom, [k]: { ...cur, [which]: v } } });
  };
  const paintBlocked = (cells: Array<[string, number]>, to: string | null) => patch({ blocked: toSlots(setCells(blockedMap, cells, to === 'blocked')) });
  const addQuick = () => {
    const target = quick.days.length ? quick.days : keys;
    const cells: Array<[string, number]> = [];
    for (const k of target) for (let m = snap(quick.start); m < quick.end; m += d.slotMin) cells.push([k, m]);
    patch({ blocked: toSlots(setCells(blockedMap, cells, true)) });
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const out = existing ? await meetApi.update(existing.id, input) : await meetApi.create(input);
      void qc.invalidateQueries({ queryKey: ['meet', 'mine'] });
      setConfirm(false);
      if (existing) {
        toast.success('Đã cập nhật sự kiện');
        nav(`/m/${out.slug}`);
        return;
      }
      localStorage.removeItem(DRAFT_KEY);
      setDone(out);
      requestAnimationFrame(() => doneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (e) {
      setErr(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Công cụ' }, { label: 'Hẹn họp nhóm', to: '/app/tools/meet' }, { label: existing ? 'Sửa sự kiện' : 'Tạo sự kiện' }]}
        title={existing ? 'Sửa sự kiện hẹn họp' : 'Tạo lịch hẹn họp nhóm'}
        description="Chọn ngày và khung giờ có thể họp, chặn giờ học. Gửi link cho nhóm: không cần đăng nhập, mỗi người tô giờ rảnh, Kaned tìm giờ hợp nhất."
      />
      <div className="container mt-body">
        <div className={cn('mt-create', done && 'is-done')}>
          <div className="mt-form">
            <fieldset disabled={Boolean(done)} className="mt-fieldset">
              <section className="mt-card">
                <h2><span className="mt-n">1</span> Sự kiện</h2>
                <Field label="Tên sự kiện" required>
                  <Input value={d.title} onChange={(e) => patch({ title: e.target.value })} maxLength={120} placeholder="Họp nhóm SWP391 – chốt đề tài" autoFocus={!existing} />
                </Field>
                <Field label="Mô tả" hint="Mục tiêu buổi họp, việc cần chuẩn bị…">
                  <textarea className="textarea" rows={3} maxLength={2000} value={d.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Chốt đề tài, chia việc sprint 1. Mọi người đọc trước tài liệu yêu cầu." />
                </Field>
                <Field label="Địa điểm / hình thức">
                  <Input icon={<MapPin className="ic" />} value={d.location} onChange={(e) => patch({ location: e.target.value })} maxLength={200} placeholder="Google Meet, phòng tự học…" />
                </Field>
                <div className="mt-chips">
                  {PLACES.map((x) => (
                    <button key={x} type="button" className={cn('mt-chip', d.location === x && 'is-on')} onClick={() => patch({ location: d.location === x ? '' : x })}>{x}</button>
                  ))}
                </div>
              </section>

              <section className="mt-card">
                <h2><span className="mt-n">2</span> Ngày có thể họp</h2>
                <div className="mt-seg" role="tablist">
                  <button type="button" role="tab" aria-selected={d.mode === 'WEEKLY'} className={cn(d.mode === 'WEEKLY' && 'is-on')} onClick={() => patch({ mode: 'WEEKLY' })}><CalendarRange className="ic ic-sm" /> Ngày trong tuần</button>
                  <button type="button" role="tab" aria-selected={d.mode === 'DATES'} className={cn(d.mode === 'DATES' && 'is-on')} onClick={() => patch({ mode: 'DATES' })}><CalendarDays className="ic ic-sm" /> Ngày cụ thể</button>
                </div>
                {d.mode === 'WEEKLY' ? (
                  <>
                    <div className="mt-week" role="group" aria-label="Chọn thứ">
                      {MEET_WEEKDAYS.map((w) => (
                        <button key={w.key} type="button" aria-pressed={d.weekdays.includes(w.key)} className={cn('mt-wd', d.weekdays.includes(w.key) && 'is-on')} onClick={() => toggleDay(w.key)}>
                          <b>{w.short}</b><small>{w.long.replace('Thứ ', '')}</small>
                        </button>
                      ))}
                    </div>
                    <div className="mt-presets">
                      <button type="button" onClick={() => patch({ weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'] })}>T2 – T6</button>
                      <button type="button" onClick={() => patch({ weekdays: ['sat', 'sun'] })}>Cuối tuần</button>
                      <button type="button" onClick={() => patch({ weekdays: MEET_WEEKDAYS.map((w) => w.key) })}>Cả tuần</button>
                    </div>
                  </>
                ) : (
                  <MiniCalendar month={month} setMonth={setMonth} picked={d.dates} onToggle={toggleDate} />
                )}
              </section>

              <section className="mt-card">
                <h2><span className="mt-n">3</span> Khung giờ trong ngày</h2>
                <div className="mt-time-row">
                  <Field label="Từ"><TimeSelect value={d.start} step={d.slotMin} onChange={(v) => patch({ start: v })} /></Field>
                  <span className="mt-dash">–</span>
                  <Field label="Đến"><TimeSelect value={d.end} step={d.slotMin} onChange={(v) => patch({ end: v })} min={d.start + d.slotMin} /></Field>
                  <Field label="Độ dài mỗi ô">
                    <div className="mt-seg is-sm">
                      {([15, 30, 60] as const).map((s) => (
                        <button key={s} type="button" className={cn(d.slotMin === s && 'is-on')} onClick={() => patch({ slotMin: s, start: Math.round(d.start / s) * s, end: Math.round(d.end / s) * s, durationMin: Math.max(s, Math.round(d.durationMin / s) * s), custom: {} })}>{s}′</button>
                      ))}
                    </div>
                  </Field>
                </div>
                {days.length > 0 && (
                  <details className="mt-perday" open={Object.keys(d.custom).length > 0}>
                    <summary>Mỗi ngày một khung giờ khác <small>{Object.keys(d.custom).length ? `${Object.keys(d.custom).length} ngày đặt riêng` : 'không bắt buộc'}</small></summary>
                    <ul>
                      {days.map((x) => {
                        const l = dayLabel(x.key);
                        const own = Boolean(d.custom[x.key]);
                        return (
                          <li key={x.key} className={cn(own && 'is-own', x.end <= x.start && 'is-bad')}>
                            <span className="mt-perday-day"><b>{l.short}</b>{l.date ?? l.long}</span>
                            <TimeSelect value={x.start} step={d.slotMin} onChange={(v) => setDayTime(x.key, 'start', v)} />
                            <span className="mt-dash">–</span>
                            <TimeSelect value={x.end} step={d.slotMin} onChange={(v) => setDayTime(x.key, 'end', v)} />
                            {own && <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Dùng khung chung" aria-label="Dùng khung chung" onClick={() => { const c = { ...d.custom }; delete c[x.key]; patch({ custom: c }); }}><RotateCcw className="ic ic-sm" /></button>}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
                <Field label="Cuộc họp kéo dài">
                  <div className="mt-chips">
                    {DURATIONS.filter((m) => m % d.slotMin === 0).map((m) => (
                      <button key={m} type="button" className={cn('mt-chip', d.durationMin === m && 'is-on')} onClick={() => patch({ durationMin: m })}>{fmtDur(m)}</button>
                    ))}
                  </div>
                </Field>
              </section>

              <section className="mt-card">
                <h2><span className="mt-n">4</span> Giờ tuyệt đối không họp được <small className="mt-opt">không bắt buộc</small></h2>
                <p className="mt-sub">Tô những giờ cả nhóm đang có lịch học. Thành viên sẽ thấy các ô này bị khoá, Kaned không bao giờ đề xuất giờ trùng.</p>
                <div className="mt-quick">
                  <Field label="Nhãn"><Input value={d.blockedLabel} onChange={(e) => patch({ blockedLabel: e.target.value })} maxLength={60} placeholder="Lịch học" /></Field>
                  <Field label="Từ"><TimeSelect value={quick.start} step={5} onChange={(v) => setQuick((q) => ({ ...q, start: v }))} /></Field>
                  <Field label="Đến"><TimeSelect value={quick.end} step={5} onChange={(v) => setQuick((q) => ({ ...q, end: v }))} /></Field>
                  <div className="mt-quick-days">
                    {keys.map((k) => (
                      <button key={k} type="button" className={cn('mt-chip is-sm', quick.days.includes(k) && 'is-on')} onClick={() => setQuick((q) => ({ ...q, days: q.days.includes(k) ? q.days.filter((x) => x !== k) : [...q.days, k] }))}>
                        {dayLabel(k).short}{dayLabel(k).date ? ` ${dayLabel(k).date}` : ''}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" variant="secondary" icon={<Plus className="ic ic-sm" />} onClick={addQuick} disabled={!keys.length || quick.end <= quick.start}>
                    Chặn {quick.days.length ? `${quick.days.length} ngày` : 'mọi ngày'}
                  </Button>
                </div>
                {cols.length > 0 ? (
                  <>
                    <div className="mt-tools">
                      <div className="mt-seg is-sm">
                        <button type="button" className={cn(tool === 'blocked' && 'is-on')} onClick={() => setTool('blocked')}><Lock className="ic ic-sm" /> Tô giờ bận</button>
                        <button type="button" className={cn(tool === 'erase' && 'is-on')} onClick={() => setTool('erase')}><Eraser className="ic ic-sm" /> Xoá</button>
                      </div>
                      <span className="mt-tools-info">{blockedCount ? `${blockedCount} ô · ${fmtDur(blockedCount * d.slotMin)}` : 'Kéo chuột trên lưới để tô'}</span>
                      {blockedCount > 0 && <button type="button" className="mt-textbtn" onClick={() => patch({ blocked: {} })}>Xoá hết</button>}
                    </div>
                    <div className="mt-gridwrap">
                      <TimeGrid
                        label="Giờ không thể họp"
                        variant="paint"
                        cols={cols}
                        rows={rows}
                        slotMin={d.slotMin}
                        tool={tool}
                        stateOf={(day, m) => (has(blockedMap, day, m) ? 'blocked' : null)}
                        onPaint={paintBlocked}
                      />
                    </div>
                  </>
                ) : (
                  <p className="mt-empty-note">Chọn ngày và khung giờ ở trên để hiện lưới.</p>
                )}
              </section>
            </fieldset>

          </div>

          <aside className="mt-preview" aria-live="polite">
            <div className="mt-preview-tag">{done ? <><PartyPopper className="ic ic-sm" /> Đã tạo xong</> : <><span className="mt-live-dot" /> Xem trước trang mời · cập nhật trực tiếp</>}</div>
            {done && (
              <div className="mt-done" ref={doneRef}>
                <div className="mt-done-head"><span><Check className="ic" /></span><div><b>Link đã sẵn sàng</b><small>Ai có link đều điền được, không cần tài khoản.</small></div></div>
                <ShareLink slug={done.slug} title={done.title} />
                <div className="mt-done-btns">
                  <Link className="btn btn-primary" to={`/m/${done.slug}`}><Sparkles className="ic ic-sm" /> Mở trang sự kiện</Link>
                  <Button variant="secondary" onClick={() => { setDone(null); setD(fresh()); }}>Tạo sự kiện khác</Button>
                </div>
              </div>
            )}
            <article className="mt-invite">
              <header className="mt-invite-head">
                <span className="mt-invite-ic"><Users className="ic" /></span>
                <div>
                  <h3 className={cn(!d.title && 'is-ph')}>{d.title || 'Tên sự kiện'}</h3>
                  <p>Tạo bởi {user?.name ?? 'bạn'}</p>
                </div>
              </header>
              {d.description && <p className="mt-invite-desc">{d.description}</p>}
              <ul className="mt-facts">
                <li><CalendarDays className="ic ic-sm" /><span>{daysSummary(days)}</span></li>
                <li><Clock3 className="ic ic-sm" /><span>{hoursSummary(days) || '—'} · họp {fmtDur(d.durationMin)}</span></li>
                {d.location && <li><MapPin className="ic ic-sm" /><span>{d.location}</span></li>}
                {blockedCount > 0 && <li><Lock className="ic ic-sm" /><span>{d.blockedLabel || 'Giờ bận'}: {fmtDur(blockedCount * d.slotMin)} bị chặn</span></li>}
              </ul>
              {cols.length > 0 && (
                <div className="mt-mini">
                  <TimeGrid label="Xem trước lưới" variant="heat" dense cols={cols} rows={rows} slotMin={d.slotMin} heat={new Map()} total={0} lockedOf={(day, m) => has(blockedMap, day, m)} />
                </div>
              )}
              <p className="mt-invite-foot">{slotsTotal - blockedCount} ô có thể chọn · mỗi ô {d.slotMin} phút</p>
            </article>

            {!done && (
              <ul className="mt-checks">
                {checks.map((c) => (
                  <li key={c.label} className={cn(c.ok && 'is-ok')}><span>{c.ok ? <Check className="ic ic-xs" /> : null}</span>{c.label}</li>
                ))}
                <li className="mt-checks-note">Sự kiện tự xoá sau {MEET_RETENTION_DAYS} ngày không hoạt động.</li>
              </ul>
            )}
          </aside>
          {!done && (
            <div className="mt-submit">
              {err && <p className="mt-err" role="alert">{err}</p>}
              <Button size="lg" icon={<CircleCheckBig className="ic" />} disabled={!ready} onClick={() => setConfirm(true)}>
                {existing ? 'Lưu thay đổi' : 'Xác nhận hoàn thành'}
              </Button>
              {!ready && issues[0] && <small className="mt-why">{issues[0]}</small>}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        title={existing ? 'Lưu thay đổi?' : 'Xác nhận tạo sự kiện'}
        description={existing && (existing.mode !== d.mode || existing.slotMin !== d.slotMin) ? 'Bạn đổi kiểu ngày hoặc độ dài ô: lịch mọi người đã tô sẽ bị xoá để tô lại.' : undefined}
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Xem lại</Button><Button loading={busy} onClick={submit} icon={<Check className="ic ic-sm" />}>{existing ? 'Lưu' : 'Tạo và lấy link'}</Button></>}
      >
        <dl className="mt-confirm">
          <div><dt>Sự kiện</dt><dd>{d.title}</dd></div>
          <div><dt>Ngày</dt><dd>{daysSummary(days)}</dd></div>
          <div><dt>Khung giờ</dt><dd>{hoursSummary(days)}</dd></div>
          <div><dt>Thời lượng</dt><dd>{fmtDur(d.durationMin)}</dd></div>
          <div><dt>Giờ chặn</dt><dd>{blockedCount ? `${fmtDur(blockedCount * d.slotMin)} (${d.blockedLabel || 'giờ bận'})` : 'Không có'}</dd></div>
        </dl>
      </Modal>
    </>
  );
}

function TimeSelect({ value, step, onChange, min = 0 }: { value: number; step: number; onChange: (v: number) => void; min?: number }) {
  const opts = TIME_OPTIONS(step).filter((m) => m >= min || m === value);
  return (
    <select className="input mt-time" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {opts.map((m) => <option key={m} value={m}>{m === 1440 ? '24:00' : fmtMin(m)}</option>)}
    </select>
  );
}

/** A month to tick dates on (up to MEET_MAX_DAYS), past days disabled. */
function MiniCalendar({ month, setMonth, picked, onToggle }: { month: string; setMonth: (m: string) => void; picked: string[]; onToggle: (d: string) => void }) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayIso();
  const go = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  return (
    <div className="mt-cal">
      <div className="mt-cal-head">
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => go(-1)} disabled={month <= today.slice(0, 7)} aria-label="Tháng trước"><ChevronLeft className="ic ic-sm" /></button>
        <b>Tháng {m}, {y}</b>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => go(1)} aria-label="Tháng sau"><ChevronRight className="ic ic-sm" /></button>
      </div>
      <div className="mt-cal-grid">
        {MEET_WEEKDAYS.map((w) => <span key={w.key} className="mt-cal-wd">{w.short}</span>)}
        {cells.map((c, i) =>
          c ? (
            <button key={c} type="button" disabled={c < today} aria-pressed={picked.includes(c)} className={cn('mt-cal-d', picked.includes(c) && 'is-on', c === today && 'is-today')} onClick={() => onToggle(c)}>
              {Number(c.slice(8))}
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
      <p className="mt-cal-foot">{picked.length ? `Đã chọn ${picked.length} ngày` : 'Chạm vào các ngày có thể họp'}{picked.length >= MEET_MAX_DAYS ? ` (tối đa ${MEET_MAX_DAYS})` : ''}</p>
    </div>
  );
}
