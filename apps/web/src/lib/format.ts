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
