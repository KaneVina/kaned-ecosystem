import { dayLabel, fmtDur, fmtMin, nextDateFor, sortDays, type MeetDay, type MeetEventDto, type MeetSlots } from '@kaned/shared';
import type { GridCol } from './TimeGrid';

/** Painted cells while editing: day → set of slot minutes. */
export type SlotMap = Map<string, Set<number>>;

export const toMap = (s: MeetSlots | undefined): SlotMap => new Map(Object.entries(s ?? {}).map(([d, l]) => [d, new Set(l)]));
export const toSlots = (m: SlotMap): MeetSlots => {
  const out: MeetSlots = {};
  for (const [d, set] of m) if (set.size) out[d] = [...set].sort((a, b) => a - b);
  return out;
};
export const has = (m: SlotMap, d: string, t: number) => m.get(d)?.has(t) ?? false;
export const sizeOf = (m: SlotMap) => [...m.values()].reduce((n, s) => n + s.size, 0);
export function setCells(m: SlotMap, cells: Array<[string, number]>, on: boolean): SlotMap {
  const next = new Map([...m].map(([d, s]) => [d, new Set(s)]));
  for (const [d, t] of cells) {
    const s = next.get(d) ?? new Set<number>();
    if (on) s.add(t);
    else s.delete(t);
    next.set(d, s);
  }
  return next;
}
/** Same cells, whatever order the days were added in (Postgres returns JSON keys in its own order). */
export function sameMap(a: SlotMap, b: SlotMap): boolean {
  const x = toSlots(a);
  const y = toSlots(b);
  const kx = Object.keys(x);
  if (kx.length !== Object.keys(y).length) return false;
  return kx.every((d) => {
    const l = x[d]!;
    const r = y[d];
    return Boolean(r) && r!.length === l.length && [...r!].sort((p, q) => p - q).every((m, i) => m === l[i]);
  });
}

export function colsOf(days: MeetDay[]): GridCol[] {
  return sortDays(days).map((d) => {
    const l = dayLabel(d.key);
    return { key: d.key, head: l.short, sub: l.date ?? l.long.replace(/^Thứ /, ''), start: d.start, end: d.end };
  });
}

export function daysSummary(days: MeetDay[]): string {
  if (!days.length) return 'Chưa chọn ngày';
  const s = sortDays(days);
  const labels = s.map((d) => {
    const l = dayLabel(d.key);
    return l.date ? `${l.short} ${l.date}` : l.short;
  });
  return labels.join(', ');
}

export function hoursSummary(days: MeetDay[]): string {
  if (!days.length) return '';
  const same = days.every((d) => d.start === days[0]!.start && d.end === days[0]!.end);
  if (same) return `${fmtMin(days[0]!.start)}–${fmtMin(days[0]!.end)}`;
  const lo = Math.min(...days.map((d) => d.start));
  const hi = Math.max(...days.map((d) => d.end));
  return `${fmtMin(lo)}–${fmtMin(hi)} (mỗi ngày một khung)`;
}

export const whenText = (day: string, start: number, end: number) => {
  const l = dayLabel(day);
  return `${l.long}${l.date ? `, ${l.date}` : ''} · ${fmtMin(start)}–${fmtMin(end)}`;
};

/** Google Calendar and .ics for the final time (weekly events use the next such weekday). */
export function calendarLinks(e: Pick<MeetEventDto, 'title' | 'description' | 'location' | 'slug'>, day: string, start: number, end: number) {
  const date = nextDateFor(day).replace(/-/g, '');
  const t = (m: number) => `${date}T${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
  const details = `${e.description ? `${e.description}\n\n` : ''}${location.origin}/m/${e.slug}`;
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${t(start)}/${t(end)}`, ctz: 'Asia/Ho_Chi_Minh', details, location: e.location || '' })}`;
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kaned//Hen hop nhom//VI',
    'BEGIN:VEVENT',
    `UID:${e.slug}-${day}-${start}@kaned`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;TZID=Asia/Ho_Chi_Minh:${t(start)}`,
    `DTEND;TZID=Asia/Ho_Chi_Minh:${t(end)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(details)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
  return { google, ics };
}

export const TIME_OPTIONS = (step: number) => {
  const out: number[] = [];
  for (let m = 0; m <= 24 * 60; m += step) out.push(m);
  return out;
};

export { fmtDur, fmtMin };
