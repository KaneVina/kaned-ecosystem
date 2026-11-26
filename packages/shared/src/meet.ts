import { z } from 'zod';

/**
 * Hẹn họp nhóm: a leader proposes days and hours, everyone paints when they are free,
 * the group's heat map shows the overlap and Kaned picks the best meeting times.
 *
 * Times are wall-clock minutes from midnight in Vietnam (no time zone maths: a study
 * group meets in one place). A day is either a weekday ("mon"…"sun", a usual week) or
 * a date ("2026-12-01").
 */

export const MEET_WEEKDAYS = [
  { key: 'mon', short: 'T2', long: 'Thứ Hai' },
  { key: 'tue', short: 'T3', long: 'Thứ Ba' },
  { key: 'wed', short: 'T4', long: 'Thứ Tư' },
  { key: 'thu', short: 'T5', long: 'Thứ Năm' },
  { key: 'fri', short: 'T6', long: 'Thứ Sáu' },
  { key: 'sat', short: 'T7', long: 'Thứ Bảy' },
  { key: 'sun', short: 'CN', long: 'Chủ nhật' },
] as const;
export type MeetWeekday = (typeof MEET_WEEKDAYS)[number]['key'];

export const MEET_SLOT_OPTIONS = [15, 30, 60] as const;
export const MEET_MAX_DAYS = 14;
export const MEET_MAX_PARTICIPANTS = 150;
export const MEET_RETENTION_DAYS = 60;

const DAY_KEY = /^(mon|tue|wed|thu|fri|sat|sun|\d{4}-\d{2}-\d{2})$/;
export const meetDayKey = z.string().regex(DAY_KEY, 'Ngày không hợp lệ.');
const minute = z.number().int().min(0).max(1440);

export const meetDaySchema = z
  .object({ key: meetDayKey, start: minute, end: minute })
  .refine((d) => d.end > d.start, { message: 'Giờ kết thúc phải sau giờ bắt đầu.' });
export type MeetDay = z.infer<typeof meetDaySchema>;

/** Painted cells: day key → slot start minutes. */
export const meetSlotsSchema = z.record(meetDayKey, z.array(minute).max(96)).default({});
export type MeetSlots = Record<string, number[]>;

export const meetEventInputSchema = z
  .object({
    title: z.string().trim().min(3, 'Tên sự kiện tối thiểu 3 ký tự.').max(120),
    description: z.string().trim().max(2000).optional().default(''),
    location: z.string().trim().max(200).optional().default(''),
    mode: z.enum(['WEEKLY', 'DATES']),
    days: z.array(meetDaySchema).min(1, 'Chọn ít nhất một ngày.').max(MEET_MAX_DAYS),
    slotMin: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
    durationMin: z.number().int().min(15).max(480).default(60),
    /** Times nobody can meet (the class timetable), set by the leader. */
    blocked: meetSlotsSchema,
    blockedLabel: z.string().trim().max(60).optional().default('Lịch học'),
  })
  .superRefine((v, ctx) => {
    const keys = v.days.map((d) => d.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Một ngày được chọn hai lần.', path: ['days'] });
    const weekly = keys.every((k) => /^[a-z]{3}$/.test(k));
    const dated = keys.every((k) => /^\d{4}/.test(k));
    if ((v.mode === 'WEEKLY' && !weekly) || (v.mode === 'DATES' && !dated)) ctx.addIssue({ code: 'custom', message: 'Ngày không khớp kiểu lịch.', path: ['days'] });
    if (v.durationMin % v.slotMin) ctx.addIssue({ code: 'custom', message: 'Thời lượng họp phải chia hết cho độ dài ô.', path: ['durationMin'] });
    for (const d of v.days) {
      if (d.start % v.slotMin || d.end % v.slotMin) ctx.addIssue({ code: 'custom', message: 'Giờ phải khớp với độ dài ô.', path: ['days'] });
    }
  });
export type MeetEventInput = z.input<typeof meetEventInputSchema>;

export const meetJoinSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên của bạn.').max(40),
  pin: z.string().regex(/^\d{4}$/, 'Mã PIN gồm 4 số.').optional(),
});
export const meetAvailabilitySchema = z.object({
  free: meetSlotsSchema,
  /** Times this person surely cannot make (their own classes…). */
  busy: meetSlotsSchema,
  busyNote: z.string().trim().max(80).optional().default(''),
});
export const meetFinalSchema = z.object({
  day: meetDayKey,
  start: minute,
  end: minute,
  note: z.string().trim().max(300).optional().default(''),
});

export type MeetStatus = 'OPEN' | 'FINAL';

export interface MeetEventDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  location: string;
  mode: 'WEEKLY' | 'DATES';
  days: MeetDay[];
  slotMin: number;
  durationMin: number;
  blocked: MeetSlots;
  blockedLabel: string;
  status: MeetStatus;
  final: { day: string; start: number; end: number; note: string; at: number } | null;
  ownerName: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
export interface MeetParticipantDto {
  id: string;
  name: string;
  free: MeetSlots;
  busy: MeetSlots;
  busyNote: string;
  isOwner: boolean;
  savedAt: number | null;
  joinedAt: number;
}
export interface MeetStateDto {
  event: MeetEventDto;
  participants: MeetParticipantDto[];
  me: { id: string; name: string; hasPin: boolean } | null;
  isOwner: boolean;
}
export interface MeetListItem {
  id: string;
  slug: string;
  title: string;
  status: MeetStatus;
  mode: 'WEEKLY' | 'DATES';
  days: MeetDay[];
  durationMin: number;
  final: MeetEventDto['final'];
  participants: number;
  responded: number;
  updatedAt: number;
  expiresAt: number;
}

/* ───────────────────────────── time helpers ───────────────────────────── */

export const fmtMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const fmtDur = (min: number) => (min < 60 ? `${min} phút` : min % 60 ? `${Math.floor(min / 60)} giờ ${min % 60} phút` : `${min / 60} giờ`);

const WD_BY_KEY = new Map(MEET_WEEKDAYS.map((w) => [w.key as string, w]));
const JS_DAY_TO_KEY: MeetWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** "T3", "Thứ Ba" and, for dates, "02/12". */
export function dayLabel(key: string): { short: string; long: string; date: string | null } {
  const w = WD_BY_KEY.get(key);
  if (w) return { short: w.short, long: w.long, date: null };
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wk = WD_BY_KEY.get(JS_DAY_TO_KEY[dt.getUTCDay()]!)!;
  return { short: wk.short, long: wk.long, date: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` };
}

/** Weekdays in calendar order, dates ascending. */
export function sortDays<T extends { key: string }>(days: T[]): T[] {
  const order = (k: string) => {
    const i = MEET_WEEKDAYS.findIndex((w) => w.key === k);
    return i >= 0 ? `0${i}` : `1${k}`;
  };
  return [...days].sort((a, b) => (order(a.key) < order(b.key) ? -1 : 1));
}

/** Slot starts of one day, blocked ones included. */
export function daySlots(day: MeetDay, slotMin: number): number[] {
  const out: number[] = [];
  for (let m = day.start; m + slotMin <= day.end; m += slotMin) out.push(m);
  return out;
}

/** The rows of a grid that holds every day: from the earliest start to the latest end. */
export function gridRows(days: MeetDay[], slotMin: number): number[] {
  if (!days.length) return [];
  const lo = Math.min(...days.map((d) => d.start));
  const hi = Math.max(...days.map((d) => d.end));
  const out: number[] = [];
  for (let m = lo; m + slotMin <= hi; m += slotMin) out.push(m);
  return out;
}

export const slotSet = (s: MeetSlots | undefined, day: string) => new Set(s?.[day] ?? []);
export const countSlots = (s: MeetSlots | undefined) => Object.values(s ?? {}).reduce((n, a) => n + a.length, 0);

/** Keeps only slots that exist in the event and are not blocked; sorted and de-duplicated. */
export function cleanSlots(s: MeetSlots, days: MeetDay[], slotMin: number, blocked: MeetSlots = {}): MeetSlots {
  const out: MeetSlots = {};
  for (const d of days) {
    const valid = new Set(daySlots(d, slotMin));
    const bl = slotSet(blocked, d.key);
    const keep = [...new Set(s[d.key] ?? [])].filter((m) => valid.has(m) && !bl.has(m)).sort((a, b) => a - b);
    if (keep.length) out[d.key] = keep;
  }
  return out;
}

/** The next real date for a weekday (today counts), as YYYY-MM-DD in Vietnam. */
export function nextDateFor(key: string, now = new Date()): string {
  if (/^\d{4}/.test(key)) return key;
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const today = vn.getUTCDay();
  const target = JS_DAY_TO_KEY.indexOf(key as MeetWeekday);
  const add = (target - today + 7) % 7;
  const d = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + add));
  return d.toISOString().slice(0, 10);
}

/* ───────────────────────────── heat & suggestions ───────────────────────────── */

/**
 * People as bit sets: one bit per participant, 32 per word. AND across the slots of a meeting
 * gives exactly who is free for all of it; popcount gives how many.
 */
const popcount = (x: number) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};
const bitsOf = (words: Uint32Array) => {
  let n = 0;
  for (const w of words) n += popcount(w);
  return n;
};

export interface MeetCell {
  free: number;
  busy: number;
}

/** How many are free / surely busy in each cell: `${day}|${minute}` → counts. */
export function heatOf(participants: Array<Pick<MeetParticipantDto, 'free' | 'busy'>>): Map<string, MeetCell> {
  const m = new Map<string, MeetCell>();
  for (const p of participants) {
    for (const [day, list] of Object.entries(p.free)) for (const t of list) {
      const k = `${day}|${t}`;
      const c = m.get(k) ?? { free: 0, busy: 0 };
      c.free++;
      m.set(k, c);
    }
    for (const [day, list] of Object.entries(p.busy)) for (const t of list) {
      const k = `${day}|${t}`;
      const c = m.get(k) ?? { free: 0, busy: 0 };
      c.busy++;
      m.set(k, c);
    }
  }
  return m;
}

export interface MeetSuggestion {
  day: string;
  start: number;
  end: number;
  /** Ids free for the whole meeting. */
  free: string[];
  /** Ids who marked part of it as surely busy. */
  busy: string[];
  /** Ids neither free for all of it nor busy (partly free, or no answer there). */
  missing: string[];
  /** Everyone who has answered is free. */
  full: boolean;
  /** The same people stay free from flexStart to flexEnd: any start inside works. */
  flexStart: number;
  flexEnd: number;
  /** Average share of people free across the slots (breaks ties). */
  warmth: number;
}

/**
 * Every possible meeting window (each day, each start, `duration` long, no blocked slot inside)
 * is scored exactly; nothing is sampled, so the best window is never missed. Order:
 *   1. most people free for the whole meeting
 *   2. fewest people who said they surely cannot come
 *   3. most people free on average across it (half-free beats empty)
 *   4. the longest stretch the same people stay free (easy to shift)
 *   5. earlier in the week, then earlier in the day
 * Neighbouring windows with the same people are merged into one suggestion with a flexible
 * range, and suggestions never overlap.
 */
export function suggestTimes(
  event: Pick<MeetEventDto, 'days' | 'slotMin' | 'durationMin' | 'blocked'>,
  participants: Array<Pick<MeetParticipantDto, 'id' | 'free' | 'busy'>>,
  opts: { durationMin?: number; limit?: number } = {},
): MeetSuggestion[] {
  const people = participants.filter((p) => countSlots(p.free) || countSlots(p.busy));
  if (!people.length) return [];
  const slotMin = event.slotMin;
  const k = Math.max(1, Math.round((opts.durationMin ?? event.durationMin) / slotMin));
  const limit = opts.limit ?? 3;
  const W = Math.ceil(people.length / 32);
  const ids = people.map((p) => p.id);

  type Cand = { day: string; di: number; i: number; start: number; set: Uint32Array; busy: Uint32Array; n: number; nb: number; warmth: number; run: number };
  const cands: Cand[] = [];
  // Windows nobody can attend in full: offered only when there is nothing better, warmest first.
  const partial: Cand[] = [];
  const days = sortDays(event.days);

  days.forEach((day, di) => {
    const blocked = slotSet(event.blocked, day.key);
    const slots = daySlots(day, slotMin);
    const free = slots.map(() => new Uint32Array(W));
    const busy = slots.map(() => new Uint32Array(W));
    people.forEach((p, pi) => {
      const f = slotSet(p.free, day.key);
      const b = slotSet(p.busy, day.key);
      slots.forEach((m, si) => {
        if (f.has(m)) free[si]![pi >>> 5]! |= 1 << (pi & 31);
        if (b.has(m)) busy[si]![pi >>> 5]! |= 1 << (pi & 31);
      });
    });
    for (let i = 0; i + k <= slots.length; i++) {
      let ok = true;
      for (let j = i; j < i + k; j++) if (blocked.has(slots[j]!)) ok = false;
      if (!ok) continue;
      const set = new Uint32Array(W).fill(0xffffffff);
      const bs = new Uint32Array(W);
      let sum = 0;
      for (let j = i; j < i + k; j++) {
        for (let w = 0; w < W; w++) {
          set[w]! &= free[j]![w]!;
          bs[w]! |= busy[j]![w]!;
        }
        sum += bitsOf(free[j]!);
      }
      // the last word only has people.length % 32 real bits
      const extra = W * 32 - people.length;
      if (extra) set[W - 1]! &= 0xffffffff >>> extra;
      const n = bitsOf(set);
      if (!n) {
        if (sum) partial.push({ day: day.key, di, i, start: slots[i]!, set, busy: bs, n, nb: bitsOf(bs), warmth: sum / k / people.length, run: 0 });
        continue;
      }
      cands.push({ day: day.key, di, i, start: slots[i]!, set, busy: bs, n, nb: bitsOf(bs), warmth: sum / k / people.length, run: 0 });
    }
  });

  if (!cands.length) {
    partial.sort((x, y) => y.warmth - x.warmth || x.nb - y.nb || x.di - y.di || x.start - y.start);
    const out: Cand[] = [];
    for (const c of partial) {
      if (out.length >= limit) break;
      if (!out.some((p) => p.day === c.day && c.start < p.start + k * slotMin && p.start < c.start + k * slotMin)) out.push(c);
    }
    const has = (s: Uint32Array, i: number) => (s[i >>> 5]! >>> (i & 31)) & 1;
    return out.map((c) => ({
      day: c.day,
      start: c.start,
      end: c.start + k * slotMin,
      free: [],
      busy: ids.filter((_, i) => has(c.busy, i)),
      missing: ids.filter((_, i) => !has(c.busy, i)),
      full: false,
      flexStart: c.start,
      flexEnd: c.start + k * slotMin,
      warmth: c.warmth,
    }));
  }

  // How far the same people stay free: merge neighbours with an identical set.
  const same = (a: Uint32Array, b: Uint32Array) => a.every((v, w) => v === b[w]);
  const byDay = new Map<string, Cand[]>();
  for (const c of cands) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);
  const flex = new Map<Cand, { a: number; b: number }>();
  for (const list of byDay.values()) {
    let s = 0;
    for (let e = 1; e <= list.length; e++) {
      const prev = list[e - 1]!;
      const cur = list[e];
      if (cur && cur.i === prev.i + 1 && same(cur.set, prev.set)) continue;
      const a = list[s]!.start;
      const b = prev.start + k * slotMin;
      for (let x = s; x < e; x++) {
        list[x]!.run = b - a;
        flex.set(list[x]!, { a, b });
      }
      s = e;
    }
  }

  cands.sort((x, y) => y.n - x.n || x.nb - y.nb || y.warmth - x.warmth || y.run - x.run || x.di - y.di || x.start - y.start);

  const picked: Cand[] = [];
  for (const c of cands) {
    if (picked.length >= limit) break;
    const f = flex.get(c)!;
    const clash = picked.some((p) => {
      if (p.day !== c.day) return false;
      const pf = flex.get(p)!;
      // overlapping meeting, or the same flexible stretch offered twice
      return (c.start < p.start + k * slotMin && p.start < c.start + k * slotMin) || (pf.a === f.a && pf.b === f.b && same(p.set, c.set));
    });
    if (!clash) picked.push(c);
  }

  return picked.map((c) => {
    const f = flex.get(c)!;
    const has = (s: Uint32Array, i: number) => (s[i >>> 5]! >>> (i & 31)) & 1;
    const free: string[] = [];
    const busy: string[] = [];
    const missing: string[] = [];
    ids.forEach((id, i) => {
      if (has(c.set, i)) free.push(id);
      else if (has(c.busy, i)) busy.push(id);
      else missing.push(id);
    });
    return { day: c.day, start: c.start, end: c.start + k * slotMin, free, busy, missing, full: c.n === people.length, flexStart: f.a, flexEnd: f.b, warmth: c.warmth };
  });
}

/** Whether a final time fits the event: inside a day's window, aligned, nothing blocked. */
export function validMeetRange(event: Pick<MeetEventDto, 'days' | 'slotMin' | 'blocked'>, day: string, start: number, end: number): boolean {
  const d = event.days.find((x) => x.key === day);
  if (!d || end <= start || start < d.start || end > d.end) return false;
  if ((start - d.start) % event.slotMin || (end - d.start) % event.slotMin) return false;
  const bl = slotSet(event.blocked, day);
  for (let m = start; m < end; m += event.slotMin) if (bl.has(m)) return false;
  return true;
}
