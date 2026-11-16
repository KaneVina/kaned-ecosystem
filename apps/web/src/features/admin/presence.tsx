import { BookOpen, FileText, LayoutGrid, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { OAUTH_PROVIDER_LABELS, type DeviceDto, type OAuthProviderId, type TrackedKind } from '@kaned/shared';
import { fmtRelative } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Green dot + "Đang online", or when the person was last here. */
export function Presence({ online, lastSeenAt, compact }: { online: boolean; lastSeenAt: string | null; compact?: boolean }) {
  return (
    <span className={cn('pres', online && 'is-online', !lastSeenAt && 'is-never')} title={lastSeenAt ? new Date(lastSeenAt).toLocaleString('vi-VN') : undefined}>
      <i aria-hidden />
      {online ? 'Đang online' : lastSeenAt ? (compact ? fmtRelative(lastSeenAt) : `Hoạt động ${fmtRelative(lastSeenAt)}`) : 'Chưa hoạt động'}
    </span>
  );
}

export const KIND_ICON: Record<TrackedKind, LucideIcon> = { document: FileText, subject: BookOpen, page: LayoutGrid };
export const KIND_LABEL: Record<TrackedKind, string> = { document: 'Tài liệu', subject: 'Môn học', page: 'Trang' };

export function KindIcon({ kind }: { kind: TrackedKind }) {
  const Icon = KIND_ICON[kind] ?? LayoutGrid;
  return (
    <span className={cn('kind-ic', `k-${kind}`)} title={KIND_LABEL[kind]}>
      <Icon className="ic" />
    </span>
  );
}

const DEVICE_LABEL: Record<string, string> = { desktop: 'Máy tính', mobile: 'Điện thoại', tablet: 'Máy tính bảng' };
const DEVICE_ICON: Record<string, LucideIcon> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };

export function deviceText(d: DeviceDto | null | undefined) {
  if (!d) return 'Không rõ thiết bị';
  return [d.browser ?? 'Trình duyệt lạ', d.os, d.device ? DEVICE_LABEL[d.device] : null].filter(Boolean).join(' · ');
}

export function DeviceLine({ d }: { d: DeviceDto | null | undefined }) {
  const Icon = (d?.device && DEVICE_ICON[d.device]) || Monitor;
  return (
    <span className="device-line">
      <Icon className="ic" />
      {deviceText(d)}
    </span>
  );
}

export const methodLabel = (m: unknown) => (m === 'password' ? 'mật khẩu' : OAUTH_PROVIDER_LABELS[m as OAuthProviderId] ?? String(m ?? ''));
