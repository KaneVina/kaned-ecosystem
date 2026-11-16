import { z } from 'zod';
import type { SignInMethod } from './oauth.js';

/*
 * Activity: what signed-in people look at and for how long, so admins can see
 * who is online, when someone was last here and what they used.
 *
 * Only pages inside the app are counted, and only while the tab is visible and
 * the person is not idle. No keystrokes, form contents or screen recordings.
 */

/** "Online" = the app checked in within this many seconds. */
export const ONLINE_WINDOW_SECONDS = 120;
/** How often an open, visible tab checks in. */
export const PING_EVERY_SECONDS = 30;
/** No input for this long and the time stops counting. */
export const IDLE_AFTER_SECONDS = 5 * 60;

export const TRACKED_KINDS = ['page', 'document', 'subject'] as const;
export type TrackedKind = (typeof TRACKED_KINDS)[number];

export const startViewSchema = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  path: z.string().max(300).regex(/^\/\S*$/),
  kind: z.enum(TRACKED_KINDS),
  entityId: z.string().max(120).optional().nullable(),
});
export type StartViewInput = z.infer<typeof startViewSchema>;

export interface StartViewDto {
  viewId: string;
  /** Sealed; sent back with every check-in so a beacon needs no auth header. */
  token: string;
}

export const USER_EVENT_TYPES = [
  'sign_up',
  'sign_in',
  'sign_out',
  'password_change',
  'provider_link',
  'provider_unlink',
  'search',
  'download',
  'upload',
  'bookmark',
  'review',
  'signed_out_by_admin',
] as const;
export type UserEventType = (typeof USER_EVENT_TYPES)[number];

export const USER_EVENT_LABELS: Record<UserEventType, string> = {
  sign_up: 'Tạo tài khoản',
  sign_in: 'Đăng nhập',
  sign_out: 'Đăng xuất',
  password_change: 'Đổi mật khẩu',
  provider_link: 'Liên kết tài khoản',
  provider_unlink: 'Bỏ liên kết tài khoản',
  search: 'Tìm kiếm',
  download: 'Tải tài liệu',
  upload: 'Đăng tài liệu',
  bookmark: 'Lưu tài liệu',
  review: 'Đánh giá tài liệu',
  signed_out_by_admin: 'Bị quản trị viên đăng xuất',
};

export const ACTIVITY_FILTERS = ['online', 'today', 'week', 'idle30', 'never'] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];
export const ACTIVITY_FILTER_LABELS: Record<ActivityFilter, string> = {
  online: 'Đang online',
  today: 'Hoạt động hôm nay',
  week: 'Hoạt động 7 ngày qua',
  idle30: 'Vắng hơn 30 ngày',
  never: 'Chưa từng hoạt động',
};

export const userViewsQuerySchema = z.object({
  kind: z.enum(TRACKED_KINDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export type UserViewsQuery = z.infer<typeof userViewsQuerySchema>;

export const userEventsQuerySchema = z.object({
  type: z.enum(USER_EVENT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export type UserEventsQuery = z.infer<typeof userEventsQuerySchema>;

export interface DeviceDto {
  browser: string | null;
  os: string | null;
  device: string | null;
}

export interface CurrentViewDto {
  path: string;
  kind: TrackedKind;
  entityId: string | null;
  label: string;
  since: string;
}

export interface ActivitySessionDto extends DeviceDto {
  id: string;
  startedAt: string;
  lastSeenAt: string;
  activeSeconds: number;
  pageCount: number;
  ip: string | null;
  online: boolean;
}

export interface PageViewDto {
  id: string;
  sessionId: string;
  path: string;
  kind: TrackedKind;
  entityId: string | null;
  label: string;
  startedAt: string;
  seconds: number;
  /** Still open in a tab that checked in recently. */
  live: boolean;
}

export interface TopDocumentDto {
  documentId: string;
  title: string;
  subjectCode: string | null;
  views: number;
  seconds: number;
  lastViewedAt: string;
}

export interface UserEventDto {
  id: string;
  type: UserEventType;
  data: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface OnlineUserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  university: { code: string; color: string } | null;
  lastSeenAt: string;
  /** Active time in the current visit. */
  sessionSeconds: number;
  device: DeviceDto | null;
  current: CurrentViewDto | null;
}

export interface UserActivityStatsDto {
  online: boolean;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  activeSecondsToday: number;
  activeSeconds7d: number;
  activeSeconds30d: number;
  activeSecondsAll: number;
  sessions30d: number;
  avgSessionSeconds30d: number;
  documentsViewed30d: number;
  downloads30d: number;
  searches30d: number;
  uploads: number;
}

export interface AdminUserDetailDto {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    bio: string | null;
    role: import('./domain.js').Role;
    year: number | null;
    university: { id: string; code: string; name: string; color: string } | null;
    major: { id: string; name: string } | null;
    signInMethods: SignInMethod[];
    createdAt: string;
  };
  stats: UserActivityStatsDto;
  /** Active seconds per day for the last 30 days, oldest first (Vietnam time). */
  daily: Array<{ date: string; seconds: number }>;
  /** Share of active time per hour of day over the last 30 days (0–23). */
  hours: number[];
  current: CurrentViewDto | null;
  lastDevice: (DeviceDto & { ip: string | null }) | null;
}
