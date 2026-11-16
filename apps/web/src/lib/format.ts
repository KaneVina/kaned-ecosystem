import { FILE_FORMAT_COLORS, type FileFormat } from '@kaned/shared';

export const fmtInt = (n: number) => Math.round(n).toLocaleString('vi-VN');

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export function fmtBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const MONTHS_VI = [
  'tháng 1', 'tháng 2', 'tháng 3', 'tháng 4', 'tháng 5', 'tháng 6',
  'tháng 7', 'tháng 8', 'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12',
];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_VI[d.getMonth()]} ${d.getFullYear()}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'hôm nay';
  if (days === 1) return 'hôm qua';
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
  return fmtDate(iso);
}

export const formatColor = (format: FileFormat) => FILE_FORMAT_COLORS[format] ?? '#807D93';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const picked = parts.length > 1 ? parts.slice(-2) : parts;
  return picked.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

/** Deterministic avatar colour so the same person is always the same colour. */
const AVATAR_COLORS = ['#4433B4', '#13857A', '#C8455F', '#2F68C8', '#C7821C', '#2F8645', '#8E3F8B', '#4F6075'];
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** "Thứ Hai, 15 tháng 11 2026" */
export function fmtToday(date = new Date()): string {
  const weekdays = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return `${weekdays[date.getDay()]}, ${date.getDate()} ${MONTHS_VI[date.getMonth()]} ${date.getFullYear()}`;
}

/** Compact age for card footers: "hôm nay", "3 ngày", "2 tuần", "12/10". */
export function timeShort(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return 'hôm nay';
  if (days < 7) return `${days} ngày`;
  if (days < 35) return `${Math.floor(days / 7)} tuần`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** The last two words of a Vietnamese name: "Trần Bảo Ngọc" → "Bảo Ngọc". */
export const shortName = (name: string) => name.trim().split(/\s+/).slice(-2).join(' ');

export const semesterVi = (s: 'S1' | 'S2' | 'SUMMER') => (s === 'SUMMER' ? 'Học kỳ hè' : s === 'S2' ? 'Học kỳ 2' : 'Học kỳ 1');

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:05" */
export function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "16/11/2026 14:05" */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${fmtClock(iso)}`;
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "hôm qua, 21:40", "12/11/2026" */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'chưa bao giờ';
  const d = new Date(iso);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay || s < 6 * 3600) return `${Math.floor(s / 3600)} giờ trước`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `hôm qua, ${fmtClock(iso)}`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} ngày trước`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 45 → "45 giây", 754 → "12 phút", 4980 → "1 giờ 23 phút" */
export function fmtDuration(seconds: number, opts: { short?: boolean } = {}): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return opts.short ? `${s}s` : `${s} giây`;
  const m = Math.round(s / 60);
  if (m < 60) return opts.short ? `${m}p` : `${m} phút`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (opts.short) return rest ? `${h}g${pad(rest)}` : `${h}g`;
  return rest ? `${h} giờ ${rest} phút` : `${h} giờ`;
}
