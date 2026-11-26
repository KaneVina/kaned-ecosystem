import { z } from 'zod';
import { peConfigSchema, type PeStoredConfig } from './vecPe.js';
import { stripAskedTags } from './askedTags.js';
import { canShuffleOptions, type DeckQuestion } from './deck.js';

/**
 * VEC – Virtual Exam Center (Phòng thi ảo).
 *
 * Everything here is a pure function or a constant, so the API (which decides)
 * and the browser (which shows) read the same rules. Times are plain numbers
 * (ms since epoch); the business time zone is always UTC+7.
 */

/* ───────────────────────────── constants ───────────────────────────── */

export const VEC_KINDS = ['FE', 'PE'] as const;
export type VecKind = (typeof VEC_KINDS)[number];

export const VEC_TZ = 'Asia/Ho_Chi_Minh';
export const VEC_UTC_OFFSET_MIN = 7 * 60;

export const SESSION_STATUSES = ['SCHEDULED', 'LOBBY', 'LIVE', 'PAUSED', 'ENDED', 'CANCELLED', 'DELETING'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const ATTEMPT_STATES = ['LOBBY', 'IN_PROGRESS', 'SUSPENDED', 'SUBMITTED', 'AUTO_SUBMITTED', 'FORCE_SUBMITTED', 'VOIDED'] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];
/** A candidate in one of these states occupies their account (CAN-R1). */
export const ACTIVE_ATTEMPT_STATES: readonly AttemptState[] = ['LOBBY', 'IN_PROGRESS', 'SUSPENDED'];
export const FINISHED_ATTEMPT_STATES: readonly AttemptState[] = ['SUBMITTED', 'AUTO_SUBMITTED', 'FORCE_SUBMITTED'];
export const isActiveAttempt = (s: string) => (ACTIVE_ATTEMPT_STATES as readonly string[]).includes(s);
export const isFinishedAttempt = (s: string) => (FINISHED_ATTEMPT_STATES as readonly string[]).includes(s);

export const VIOLATION_TYPES = [
  'FULLSCREEN_EXIT',
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'LEAVE_EXAM_VIEW',
  'PAGE_RELOAD',
  'COPY_ATTEMPT',
  'SHORTCUT_BLOCKED',
  'PRINT_SCREEN',
  'DEVTOOLS_SUSPECT',
  'SECOND_CONNECTION',
  'IP_CHANGE',
  'DEVICE_CHANGE',
  'INACTIVE',
  'OFFLINE',
  'ONLINE',
  'TAMPER',
  'HEARTBEAT_MISSED',
] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const VIOLATION_LABEL: Record<ViolationType, string> = {
  FULLSCREEN_EXIT: 'Thoát toàn màn hình',
  TAB_HIDDEN: 'Chuyển sang tab khác',
  WINDOW_BLUR: 'Chuyển sang cửa sổ khác',
  LEAVE_EXAM_VIEW: 'Rời khỏi màn hình thi',
  PAGE_RELOAD: 'Tải lại trang',
  COPY_ATTEMPT: 'Sao chép nội dung đề',
  SHORTCUT_BLOCKED: 'Dùng phím tắt bị chặn',
  PRINT_SCREEN: 'Nhấn PrintScreen',
  DEVTOOLS_SUSPECT: 'Nghi mở công cụ nhà phát triển',
  SECOND_CONNECTION: 'Mở bài thi ở thiết bị khác',
  IP_CHANGE: 'Đổi địa chỉ IP',
  DEVICE_CHANGE: 'Đổi trình duyệt/thiết bị',
  INACTIVE: 'Không thao tác lâu',
  OFFLINE: 'Mất mạng',
  ONLINE: 'Có mạng lại',
  TAMPER: 'Can thiệp giao diện',
  HEARTBEAT_MISSED: 'Mất tín hiệu',
};

export const SEVERITIES = ['INFO', 'WARN', 'LOCK'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INTEGRITY_PRESETS = ['STRICT', 'STANDARD', 'RELAXED'] as const;
export type IntegrityPreset = (typeof INTEGRITY_PRESETS)[number];
export const PRESET_LABEL: Record<IntegrityPreset, string> = { STRICT: 'Nghiêm ngặt', STANDARD: 'Tiêu chuẩn', RELAXED: 'Thoải mái' };
export const PRESET_HINT: Record<IntegrityPreset, string> = {
  STRICT: 'Thoát toàn màn hình, đổi tab/cửa sổ, tải lại trang đều khóa bài ngay, chờ giảng viên duyệt.',
  STANDARD: 'Thoát toàn màn hình và tải lại trang khóa ngay; đổi tab/cửa sổ cảnh báo, lần thứ 3 thì khóa.',
  RELAXED: 'Thoát toàn màn hình cho 10 giây quay lại, quá hạn mới khóa; các hành vi còn lại chỉ ghi nhận.',
};

export const RETAKE_MODES = ['SELF_SERVICE', 'REQUEST', 'LECTURER_ONLY'] as const;
export type RetakeMode = (typeof RETAKE_MODES)[number];
export const RETAKE_SCORING = ['BEST', 'LAST', 'FIRST', 'AVERAGE'] as const;
export type RetakeScoring = (typeof RETAKE_SCORING)[number];
export const RETAKE_SCORING_LABEL: Record<RetakeScoring, string> = { BEST: 'Cao nhất', LAST: 'Lần cuối', FIRST: 'Lần đầu', AVERAGE: 'Trung bình' };
export const RETAKE_MODE_LABEL: Record<RetakeMode, string> = {
  SELF_SERVICE: 'Tự làm lại trong giới hạn',
  REQUEST: 'Cần giảng viên duyệt',
  LECTURER_ONLY: 'Chỉ giảng viên cấp lượt',
};

export const MAX_RETAKES = 20;
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 300;
/** Answers queued while offline are still accepted this long after the deadline. */
export const LATE_SYNC_GRACE_MS = 2 * 60_000;
export const HEARTBEAT_MS = 9_000;
export const DISCONNECT_AFTER_MS = 45_000;
export const MERGE_WINDOW_MS = 1_500;
export const MIN_START_LEAD_MS = 5 * 60_000;
export const MAX_START_LEAD_MS = 180 * 24 * 3600_000;

/* ───────────────────────────── settings ───────────────────────────── */

export const RESULT_RELEASE = ['NEVER', 'AFTER_SUBMIT', 'AFTER_END', 'MANUAL'] as const;
export type ResultRelease = (typeof RESULT_RELEASE)[number];

export const vecSettingsSchema = z.object({
  settingsVersion: z.literal(1).default(1),
  paper: z
    .object({
      chapters: z.array(z.number().int().min(0).max(999)).max(200).default([]),
      questionCount: z.number().int().min(1).max(2000).default(30),
      balanceByChapter: z.boolean().default(false),
      dedupeVariants: z.boolean().default(true),
      shuffleQuestions: z.boolean().default(true),
      shuffleOptions: z.boolean().default(true),
    })
    .default({}),
  scoring: z
    .object({
      passMark: z.number().min(0).max(10).default(5),
      multiAnswer: z.enum(['ALL_OR_NOTHING', 'PARTIAL']).default('ALL_OR_NOTHING'),
    })
    .default({}),
  timing: z
    .object({
      lobbyOpenMin: z.number().int().min(0).max(60).default(15),
      lateJoinMin: z.number().int().min(0).max(MAX_DURATION_MIN).default(10),
    })
    .default({}),
  retake: z
    .object({
      max: z.number().int().min(0).max(MAX_RETAKES).default(0),
      mode: z.enum(RETAKE_MODES).default('SELF_SERVICE'),
      scoring: z.enum(RETAKE_SCORING).default('BEST'),
      cooldownMin: z.number().int().min(0).max(60).default(0),
      minRemainingMin: z.number().int().min(0).max(MAX_DURATION_MIN).default(10),
      requireFullDuration: z.boolean().default(false),
      extendWindow: z.boolean().default(true),
    })
    .default({}),
  access: z
    .object({
      otp: z.boolean().default(false),
      requireStudentCode: z.boolean().default(true),
      lockProfileInfo: z.boolean().default(false),
    })
    .default({}),
  integrity: z
    .object({
      preset: z.enum(INTEGRITY_PRESETS).default('STRICT'),
      blockCopy: z.boolean().default(true),
      desktopOnly: z.boolean().default(true),
      allowUnsupportedFullscreen: z.boolean().default(false),
      watermark: z.boolean().default(true),
      onSessionEndWhileSuspended: z.enum(['GRADE_SAVED', 'VOID']).default('GRADE_SAVED'),
    })
    .default({}),
  results: z
    .object({
      score: z.enum(RESULT_RELEASE).default('AFTER_SUBMIT'),
      rightWrong: z.enum(RESULT_RELEASE).default('AFTER_END'),
      correctAnswers: z.enum(RESULT_RELEASE).default('AFTER_END'),
      explanations: z.enum(['NEVER', 'WITH_ANSWERS']).default('NEVER'),
    })
    .default({}),
  ui: z.object({ revealAnswerCount: z.boolean().default(true) }).default({}),
});
export type VecSettings = z.infer<typeof vecSettingsSchema>;
export const defaultVecSettings = (): VecSettings => vecSettingsSchema.parse({});

/* ───────────────────────────── inputs ───────────────────────────── */

const isoWithOffset = z
  .string()
  .refine((s) => /(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)), 'Thời gian phải có múi giờ (GMT+7).');

export const sessionInputSchema = z
  .object({
    kind: z.enum(VEC_KINDS).default('FE'),
    title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự.').max(160),
    description: z.string().trim().max(600).optional(),
    instructions: z.string().trim().max(4000).optional(),
    lecturerDisplay: z.string().trim().max(80).optional(),
    /** Source: a published deck, or temporary Markdown that is only kept as a snapshot. */
    deckId: z.string().min(1).max(64).optional(),
    markdown: z.string().max(950_000).optional(),
    subjectCode: z.string().trim().max(24).optional(),
    subjectName: z.string().trim().max(160).optional(),
    startsAt: isoWithOffset,
    durationMin: z.number().int().min(MIN_DURATION_MIN).max(MAX_DURATION_MIN),
    /** null = generate one when OTP is on; a 4–8 digit string = the lecturer's own. */
    otp: z.string().regex(/^\d{4,8}$/, 'OTP gồm 4–8 chữ số.').optional(),
    settings: vecSettingsSchema.default({}),
    /** PE rooms only: paper, materials and how solutions are submitted. */
    pe: peConfigSchema.optional(),
  })
  .refine((v) => (v.kind === 'PE' ? Boolean(v.pe) && !v.deckId && !v.markdown : Boolean(v.deckId) !== Boolean(v.markdown)), {
    message: 'Chọn một bộ đề hoặc tải file .md.',
    path: ['deckId'],
  });
export type SessionInput = z.infer<typeof sessionInputSchema>;

export const sessionPatchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(600).nullable().optional(),
  instructions: z.string().trim().max(4000).nullable().optional(),
  lecturerDisplay: z.string().trim().max(80).nullable().optional(),
  results: vecSettingsSchema.shape.results.removeDefault().optional(),
  retakeMax: z.number().int().min(0).max(MAX_RETAKES).optional(),
});
export type SessionPatch = z.infer<typeof sessionPatchSchema>;

export const roomCodeSchema = z.string().transform((s) => s.replace(/\D/g, '')).pipe(z.string().length(7).regex(/^[1-9]\d{6}$/));

export const candidateInfoSchema = z.object({
  fullName: z.string().trim().min(2, 'Nhập họ và tên.').max(80),
  email: z.string().trim().email('Email chưa hợp lệ.').max(160),
  studentCode: z.string().trim().max(20).optional().default(''),
  className: z.string().trim().max(40).optional().default(''),
  universityId: z.string().max(64).optional().default(''),
  universityName: z.string().trim().max(160).optional().default(''),
  majorName: z.string().trim().max(160).optional().default(''),
  term: z.string().trim().max(60).optional().default(''),
  accountName: z.string().trim().max(120).optional().default(''),
});
export type CandidateInfo = z.infer<typeof candidateInfoSchema>;

export const joinLookupSchema = z.object({ code: z.string().max(20) });
export const joinOtpSchema = z.object({ code: z.string().max(20), otp: z.string().regex(/^\d{4,8}$/) });
export const joinEnterSchema = z.object({
  ticket: z.string().min(10).max(4000),
  info: candidateInfoSchema,
  consent: z.literal(true, { errorMap: () => ({ message: 'Cần đồng ý với quy chế thi.' }) }),
});

export const answerItemSchema = z.object({
  qid: z.string().min(1).max(24),
  oids: z.array(z.string().min(3).max(12)).max(8),
  flagged: z.boolean().default(false),
  seq: z.number().int().min(1).max(1_000_000_000),
});
export const answersPutSchema = z.object({ items: z.array(answerItemSchema).min(1).max(50) });
export type AnswerItem = z.infer<typeof answerItemSchema>;

export const heartbeatSchema = z.object({
  fullscreen: z.boolean(),
  visible: z.boolean(),
  focused: z.boolean(),
  answered: z.number().int().min(0).max(5000).default(0),
  current: z.number().int().min(0).max(5000).default(0),
  connectionId: z.string().max(80).optional(),
  /** Event ids the client has already seen, so commands are not repeated. */
  ackMessage: z.number().int().min(0).optional(),
});
export const violationSchema = z.object({
  type: z.enum(VIOLATION_TYPES),
  data: z.record(z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).optional(),
});

export const MESSAGE_KINDS = ['ANNOUNCE', 'URGENT', 'REPLY', 'SYSTEM'] as const;
export const announceSchema = z.object({
  body: z.string().trim().min(1).max(500),
  urgent: z.boolean().default(false),
  attemptId: z.string().max(64).optional(),
});
export const extendTimeSchema = z.object({ minutes: z.number().int().min(1).max(120), attemptIds: z.array(z.string().max(64)).max(2000).optional() });
export const lockDecisionSchema = z.object({ reason: z.string().trim().min(3, 'Nhập lý do.').max(300) });
export const resumeSchema = z.object({ bonus: z.enum(['NONE', 'LOCKED_TIME', 'CUSTOM']).default('NONE'), bonusMin: z.number().int().min(1).max(120).optional() });
export const redoSchema = z.object({ countsTowardLimit: z.boolean().default(false), reason: z.string().trim().max(300).optional() });
export const removeSchema = z.object({ mode: z.enum(['GRADE_SAVED', 'VOID']), reason: z.string().trim().min(3).max(300) });
export const retakeGrantSchema = z.object({ delta: z.number().int().min(-MAX_RETAKES).max(MAX_RETAKES) });
export const unlockRequestSchema = z.object({ kind: z.enum(['UNLOCK', 'RETAKE']).default('UNLOCK'), reason: z.string().trim().max(300).default('') });
export const decideRequestSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });
export const retakeMaxSchema = z.object({ max: z.number().int().min(0).max(MAX_RETAKES) });
export const confirmCodeSchema = z.object({ confirm: z.string().max(20) });

/* ───────────────────────────── room code, time ───────────────────────────── */

export const formatRoomCode = (code: string) => (code.length === 7 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);
export const parseRoomCode = (input: string) => input.replace(/\D/g, '').slice(0, 7);
export const isRoomCode = (s: string) => /^[1-9]\d{6}$/.test(s);

const pad = (n: number) => String(n).padStart(2, '0');
/** Wall-clock parts in Vietnam, whatever the device's own zone is. */
export function vnParts(ts: number) {
  const d = new Date(ts + VEC_UTC_OFFSET_MIN * 60_000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
export const fmtVnTime = (ts: number) => {
  const p = vnParts(ts);
  return `${pad(p.h)}:${pad(p.mi)}`;
};
export const fmtVnDate = (ts: number) => {
  const p = vnParts(ts);
  return `${pad(p.d)}/${pad(p.mo)}/${p.y}`;
};
export const fmtVnFull = (ts: number) => `${fmtVnTime(ts)}, ${fmtVnDate(ts)} (GMT+7)`;
/** "2026-11-25" + "08:00" read as Vietnam time → ms. */
export function vnToMs(date: string, time: string) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (![y, mo, d, h, mi].every(Number.isFinite)) return NaN;
  return Date.UTC(y, mo - 1, d, h, mi) - VEC_UTC_OFFSET_MIN * 60_000;
}
export const vnToIso = (date: string, time: string) => {
  const ms = vnToMs(date, time);
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace('Z', '+00:00') : '';
};
export const fmtDuration = (sec: number) => {
  const m = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} phút`;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
};
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/** End of the last possible attempt: start + duration × (retakes + 1) when the window stretches. */
export function computeEndsAt(startsAt: number, durationMin: number, retakeMax: number, extendWindow: boolean) {
  return startsAt + durationMin * 60_000 * (extendWindow ? retakeMax + 1 : 1);
}

export interface SessionTimes {
  startsAt: number;
  endsAt: number;
  lobbyOpenMin: number;
  lateJoinMin: number;
  pausedAt: number | null;
  pausedTotalSec: number;
  statusOverride: 'PAUSED' | 'ENDED' | 'CANCELLED' | 'DELETING' | null;
}

/** Seconds the clock has been stopped, counting a pause still in progress. */
export const pausedSeconds = (s: Pick<SessionTimes, 'pausedAt' | 'pausedTotalSec'>, now: number) =>
  s.pausedTotalSec + (s.pausedAt ? Math.max(0, Math.floor((now - s.pausedAt) / 1000)) : 0);

/** When the session closes, pushed back by every pause. */
export const effectiveEndsAt = (s: SessionTimes, now: number) => s.endsAt + pausedSeconds(s, now) * 1000;

/** The status is computed from the clock, so no cron has to flip it (ADR-2). */
export function effectiveSessionStatus(now: number, s: SessionTimes): SessionStatus {
  if (s.statusOverride === 'DELETING') return 'DELETING';
  if (s.statusOverride === 'CANCELLED') return 'CANCELLED';
  if (s.statusOverride === 'ENDED') return 'ENDED';
  if (s.statusOverride === 'PAUSED') return 'PAUSED';
  if (now >= effectiveEndsAt(s, now)) return 'ENDED';
  if (now >= s.startsAt) return 'LIVE';
  if (now >= s.startsAt - s.lobbyOpenMin * 60_000) return 'LOBBY';
  return 'SCHEDULED';
}

export const lobbyOpensAt = (s: Pick<SessionTimes, 'startsAt' | 'lobbyOpenMin'>) => s.startsAt - s.lobbyOpenMin * 60_000;
export const joinClosesAt = (s: Pick<SessionTimes, 'startsAt' | 'lateJoinMin'>) => s.startsAt + s.lateJoinMin * 60_000;

export interface AttemptClock {
  deadlineAt: number;
  pausedBaseSec: number;
  timeBonusSec: number;
}

/** Deadline of the first attempt: the fixed window, stretched by pauses before it started. */
export function initialDeadline(session: SessionTimes, durationMin: number, attemptNo: number, startedAt: number, redo: boolean, now: number) {
  const paused = session.pausedTotalSec * 1000;
  if (attemptNo === 1 && !redo) return session.startsAt + durationMin * 60_000 + paused;
  return Math.min(startedAt + durationMin * 60_000, effectiveEndsAt(session, now));
}

/** What the candidate's clock counts down to, including pauses and bonus time. */
export function attemptDeadline(a: AttemptClock, s: Pick<SessionTimes, 'pausedAt' | 'pausedTotalSec'>, now: number) {
  const pausedSince = Math.max(0, pausedSeconds(s, now) - a.pausedBaseSec);
  return a.deadlineAt + (pausedSince + a.timeBonusSec) * 1000;
}

/* ───────────────────────────── paper building ───────────────────────────── */

/** Deterministic PRNG from a string seed, so reloading shows the same order. */
export function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h = Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleSeeded<T>(items: readonly T[], rnd: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface SnapshotQuestion {
  qid: string;
  chapter: number;
  kind: 'SINGLE' | 'MULTI';
  text: string;
  options: string[];
  answers: number[];
  canShuffle: boolean;
}

export const toSnapshot = (q: DeckQuestion): SnapshotQuestion => ({
  qid: q.id,
  chapter: q.chapter,
  kind: q.answers.length > 1 ? 'MULTI' : 'SINGLE',
  // `[SU26_B5]` tags say which past exams a question came from; a candidate must not see them.
  text: stripAskedTags(q.text),
  options: q.options,
  answers: q.answers,
  canShuffle: canShuffleOptions(q),
});

/**
 * Picks the questions for a session once, when it is created.
 * Variants like "12.1" are the same fact asked another way, so with dedupe on
 * only one of a family is drawn.
 */
export function pickQuestions(pool: DeckQuestion[], opts: VecSettings['paper'], rnd: () => number): DeckQuestion[] {
  let list = pool.filter((q) => !opts.chapters.length || opts.chapters.includes(q.chapter));
  if (opts.dedupeVariants) {
    const byFamily = new Map<string, DeckQuestion[]>();
    for (const q of list) {
      const fam = q.parent ?? q.id.split('.')[0]!;
      byFamily.set(fam, [...(byFamily.get(fam) ?? []), q]);
    }
    list = [...byFamily.values()].map((g) => g[Math.floor(rnd() * g.length)]!);
  }
  const want = Math.min(opts.questionCount, list.length);
  if (!opts.balanceByChapter) return shuffleSeeded(list, rnd).slice(0, want);

  const groups = new Map<number, DeckQuestion[]>();
  for (const q of list) groups.set(q.chapter, [...(groups.get(q.chapter) ?? []), q]);
  const total = list.length || 1;
  const quota = new Map<number, number>();
  let given = 0;
  for (const [ch, g] of groups) {
    const n = Math.floor((g.length / total) * want);
    quota.set(ch, n);
    given += n;
  }
  // Hand out what rounding left, largest groups first.
  const order = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([ch]) => ch);
  for (let i = 0; given < want; i++, given++) quota.set(order[i % order.length]!, (quota.get(order[i % order.length]!) ?? 0) + 1);
  const out: DeckQuestion[] = [];
  for (const [ch, g] of groups) out.push(...shuffleSeeded(g, rnd).slice(0, quota.get(ch) ?? 0));
  return shuffleSeeded(out, rnd);
}

export interface PaperOption {
  /** Index in the original question. The server keeps this; the browser only sees `oid`. */
  idx: number;
}
export interface PaperQuestion {
  qid: string;
  kind: 'SINGLE' | 'MULTI';
  options: PaperOption[];
}

/** The order this candidate sees: questions and (where allowed) options, stable for one seed. */
export function buildPaper(questions: SnapshotQuestion[], seed: string, shuffleQuestions: boolean, shuffleOptions: boolean): PaperQuestion[] {
  const rnd = seededRandom(`paper:${seed}`);
  const order = shuffleQuestions ? shuffleSeeded(questions, rnd) : questions;
  return order.map((q) => {
    const idx = q.options.map((_, i) => i);
    const opt = shuffleOptions && q.canShuffle ? shuffleSeeded(idx, seededRandom(`opts:${seed}:${q.qid}`)) : idx;
    return { qid: q.qid, kind: q.kind, options: opt.map((i) => ({ idx: i })) };
  });
}

/** A short code to tell papers apart; no I, O, 0 or 1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function paperCodeFrom(seed: string) {
  const rnd = seededRandom(`code:${seed}`);
  return Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)]).join('');
}

/* ───────────────────────────── grading ───────────────────────────── */

export const OPTION_KEYS = 'ABCDEFGH';

export const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x) => b.includes(x));

export interface GradeOutcome {
  correct: number;
  wrong: number;
  blank: number;
  total: number;
  score10: number;
  perQuestion: Record<string, 'RIGHT' | 'WRONG' | 'BLANK'>;
}

/**
 * Grades on the server only. A multiple-answer question is right when the chosen
 * set equals the correct set; with PARTIAL, picks earn or lose a share instead.
 */
export function gradeAttempt(
  questions: Array<Pick<SnapshotQuestion, 'qid' | 'answers'>>,
  chosen: Record<string, number[] | undefined>,
  multiAnswer: 'ALL_OR_NOTHING' | 'PARTIAL' = 'ALL_OR_NOTHING',
): GradeOutcome {
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let credit = 0;
  const perQuestion: GradeOutcome['perQuestion'] = {};
  for (const q of questions) {
    const pick = chosen[q.qid] ?? [];
    if (!pick.length) {
      blank++;
      perQuestion[q.qid] = 'BLANK';
      continue;
    }
    if (sameSet(pick, q.answers)) {
      correct++;
      credit += 1;
      perQuestion[q.qid] = 'RIGHT';
    } else {
      wrong++;
      perQuestion[q.qid] = 'WRONG';
      if (multiAnswer === 'PARTIAL' && q.answers.length > 1) {
        const right = pick.filter((i) => q.answers.includes(i)).length;
        const bad = pick.length - right;
        credit += Math.max(0, (right - bad) / q.answers.length);
      }
    }
  }
  const total = questions.length;
  const score10 = total ? Math.round((credit / total) * 10 * 100) / 100 : 0;
  return { correct, wrong, blank, total, score10, perQuestion };
}

export const gradeLabel = (score10: number) =>
  score10 >= 9 ? 'Xuất sắc' : score10 >= 8 ? 'Giỏi' : score10 >= 6.5 ? 'Khá' : score10 >= 5 ? 'Đạt' : 'Cần ôn thêm';

export interface ScoredAttempt {
  attemptNo: number;
  score10: number | null;
  submittedAt: number | null;
}

/** The score that counts for a candidate across attempts (RT-R9). */
export function countedScore(attempts: ScoredAttempt[], how: RetakeScoring): { score: number; attemptNo: number | null } | null {
  const done = attempts.filter((a) => a.score10 != null && a.submittedAt != null).sort((a, b) => a.attemptNo - b.attemptNo);
  if (!done.length) return null;
  if (how === 'FIRST') return { score: done[0]!.score10!, attemptNo: done[0]!.attemptNo };
  if (how === 'LAST') return { score: done[done.length - 1]!.score10!, attemptNo: done[done.length - 1]!.attemptNo };
  if (how === 'AVERAGE') {
    const avg = done.reduce((s, a) => s + a.score10!, 0) / done.length;
    return { score: Math.round(avg * 100) / 100, attemptNo: null };
  }
  const best = done.reduce((b, a) => (a.score10! > b.score10! ? a : b));
  return { score: best.score10!, attemptNo: best.attemptNo };
}

/* ───────────────────────────── retakes ───────────────────────────── */

export type RetakeBlock =
  | 'DISABLED'
  | 'NO_QUOTA'
  | 'COOLDOWN'
  | 'NOT_ENOUGH_TIME'
  | 'NEEDS_APPROVAL'
  | 'LECTURER_ONLY'
  | 'SESSION_ENDED'
  | 'ACTIVE_ATTEMPT';

export const RETAKE_BLOCK_TEXT: Record<RetakeBlock, string> = {
  DISABLED: 'Phiên này không cho làm lại.',
  NO_QUOTA: 'Bạn đã dùng hết số lượt làm bài.',
  COOLDOWN: 'Chưa hết thời gian nghỉ giữa các lượt.',
  NOT_ENOUGH_TIME: 'Giờ của phiên còn quá ít để bắt đầu lượt mới.',
  NEEDS_APPROVAL: 'Cần giảng viên duyệt yêu cầu làm lại.',
  LECTURER_ONLY: 'Giảng viên có thể cấp thêm lượt làm lại cho bạn.',
  SESSION_ENDED: 'Phiên thi đã kết thúc.',
  ACTIVE_ATTEMPT: 'Bạn đang có một lượt thi chưa hoàn tất.',
};

export interface RetakeContext {
  retake: VecSettings['retake'];
  durationMin: number;
  now: number;
  sessionEnded: boolean;
  sessionEndsAt: number;
  hasActiveAttempt: boolean;
  lastSubmittedAt: number | null;
  /** Retakes already used that count toward the limit. */
  retakesUsed: number;
  /** Extra (or revoked) retakes the lecturer gave this candidate. */
  extraRetakes: number;
  /** A REQUEST-mode request the lecturer has approved and not yet spent. */
  approved: boolean;
  hasFinishedAttempt: boolean;
}

export const retakeQuota = (r: Pick<RetakeContext, 'retake' | 'extraRetakes'>) =>
  r.retake.mode === 'LECTURER_ONLY' ? Math.max(0, r.extraRetakes) : Math.max(0, r.retake.max + r.extraRetakes);

/** One rule set for the button in the browser and the check in the API (RT-R1…R4). */
export function canStartRetake(c: RetakeContext): { ok: true } | { ok: false; reason: RetakeBlock } {
  if (c.sessionEnded || c.now >= c.sessionEndsAt) return { ok: false, reason: 'SESSION_ENDED' };
  if (c.hasActiveAttempt) return { ok: false, reason: 'ACTIVE_ATTEMPT' };
  if (!c.hasFinishedAttempt) return { ok: false, reason: 'ACTIVE_ATTEMPT' };
  const quota = retakeQuota(c);
  if (c.retake.max === 0 && c.extraRetakes <= 0) return { ok: false, reason: 'DISABLED' };
  if (c.retakesUsed >= quota) return { ok: false, reason: c.retake.mode === 'LECTURER_ONLY' ? 'LECTURER_ONLY' : 'NO_QUOTA' };
  if (c.retake.mode === 'REQUEST' && !c.approved) return { ok: false, reason: 'NEEDS_APPROVAL' };
  const remaining = c.sessionEndsAt - c.now;
  const need = (c.retake.requireFullDuration ? c.durationMin : Math.min(c.retake.minRemainingMin, c.durationMin)) * 60_000;
  if (remaining < need || remaining <= 0) return { ok: false, reason: 'NOT_ENOUGH_TIME' };
  if (c.retake.cooldownMin > 0 && c.lastSubmittedAt != null && c.now < c.lastSubmittedAt + c.retake.cooldownMin * 60_000) {
    return { ok: false, reason: 'COOLDOWN' };
  }
  return { ok: true };
}

/* ───────────────────────────── integrity policy ───────────────────────────── */

export interface PolicyRule {
  action: Severity;
  /** Events of one group share a counter ("3 strikes"). */
  group?: string;
  /** Once the group counter reaches this, the action becomes LOCK. */
  lockAt?: number;
}
export type Policy = Record<ViolationType, PolicyRule>;

const base = (): Policy => ({
  FULLSCREEN_EXIT: { action: 'LOCK' },
  TAB_HIDDEN: { action: 'LOCK' },
  WINDOW_BLUR: { action: 'LOCK' },
  LEAVE_EXAM_VIEW: { action: 'LOCK' },
  PAGE_RELOAD: { action: 'LOCK' },
  COPY_ATTEMPT: { action: 'WARN', group: 'copy', lockAt: 10 },
  SHORTCUT_BLOCKED: { action: 'WARN' },
  PRINT_SCREEN: { action: 'WARN' },
  DEVTOOLS_SUSPECT: { action: 'INFO' },
  SECOND_CONNECTION: { action: 'INFO' },
  IP_CHANGE: { action: 'WARN' },
  DEVICE_CHANGE: { action: 'WARN' },
  INACTIVE: { action: 'INFO' },
  OFFLINE: { action: 'INFO' },
  ONLINE: { action: 'INFO' },
  TAMPER: { action: 'WARN' },
  HEARTBEAT_MISSED: { action: 'INFO' },
});

/** What each kind of behaviour does under a preset (SRS 10.3). */
export function policyFor(preset: IntegrityPreset): Policy {
  const p = base();
  if (preset === 'STANDARD') {
    p.TAB_HIDDEN = { action: 'WARN', group: 'focus', lockAt: 3 };
    p.WINDOW_BLUR = { action: 'WARN', group: 'focus', lockAt: 3 };
    p.COPY_ATTEMPT = { action: 'INFO' };
    p.SHORTCUT_BLOCKED = { action: 'INFO' };
    p.PRINT_SCREEN = { action: 'INFO' };
    p.IP_CHANGE = { action: 'INFO' };
    p.DEVICE_CHANGE = { action: 'INFO' };
    p.TAMPER = { action: 'INFO' };
  } else if (preset === 'RELAXED') {
    p.FULLSCREEN_EXIT = { action: 'WARN' }; // becomes LOCK when the 10 s grace runs out (data.graceExpired)
    p.TAB_HIDDEN = { action: 'INFO' };
    p.WINDOW_BLUR = { action: 'INFO' };
    p.LEAVE_EXAM_VIEW = { action: 'WARN' };
    p.PAGE_RELOAD = { action: 'WARN' };
    p.COPY_ATTEMPT = { action: 'INFO' };
    p.SHORTCUT_BLOCKED = { action: 'INFO' };
    p.PRINT_SCREEN = { action: 'INFO' };
    p.IP_CHANGE = { action: 'INFO' };
    p.DEVICE_CHANGE = { action: 'INFO' };
    p.TAMPER = { action: 'INFO' };
  }
  return p;
}

export const RELAXED_GRACE_SEC = 10;

/**
 * Decides what a reported behaviour does. `prior` counts earlier events of this
 * attempt by type; the caller has already merged events that fired together.
 */
export function decideAction(type: ViolationType, preset: IntegrityPreset, prior: Partial<Record<ViolationType, number>>, data?: Record<string, unknown>): Severity {
  const policy = policyFor(preset);
  const rule = policy[type];
  if (preset === 'RELAXED' && type === 'FULLSCREEN_EXIT' && data?.graceExpired) return 'LOCK';
  if (rule.lockAt) {
    const groupTypes = VIOLATION_TYPES.filter((t) => policy[t].group && policy[t].group === rule.group);
    const seen = groupTypes.reduce((n, t) => n + (prior[t] ?? 0), 0) + 1;
    if (seen >= rule.lockAt) return 'LOCK';
  }
  return rule.action;
}

/** Events within the window collapse into one violation, keeping the strictest (10.3). */
export function mergeEvents<T extends { at: number; severity: Severity }>(events: T[], windowMs = MERGE_WINDOW_MS): T[][] {
  const sorted = events.slice().sort((a, b) => a.at - b.at);
  const groups: T[][] = [];
  for (const e of sorted) {
    const last = groups[groups.length - 1];
    if (last && e.at - last[last.length - 1]!.at < windowMs) last.push(e);
    else groups.push([e]);
  }
  return groups;
}

export const RISK_WEIGHT: Record<Severity, number> = { LOCK: 10, WARN: 3, INFO: 0 };
export function riskScore(counts: { lock: number; warn: number; copy?: number }) {
  return counts.lock * RISK_WEIGHT.LOCK + counts.warn * RISK_WEIGHT.WARN + (counts.copy ?? 0);
}
export const riskLevel = (score: number): 'LOW' | 'MEDIUM' | 'HIGH' => (score >= 20 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW');
export const RISK_LABEL = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' } as const;

/* ───────────────────────────── DTOs ───────────────────────────── */

export interface VecSessionDto {
  id: string;
  kind: VecKind;
  title: string;
  description: string | null;
  instructions: string | null;
  lecturerDisplay: string;
  subjectCode: string;
  subjectName: string;
  universityColor: string | null;
  roomCode: string;
  /** Only for the host. */
  otp: string | null;
  otpRequired: boolean;
  startsAt: number;
  endsAt: number;
  durationMin: number;
  questionCount: number;
  status: SessionStatus;
  lobbyOpenMin: number;
  lateJoinMin: number;
  pausedAt: number | null;
  pausedTotalSec: number;
  settings: VecSettings;
  ephemeralSource: boolean;
  counts: { joined: number; inProgress: number; suspended: number; submitted: number; pendingRequests: number };
  createdAt: number;
  hostName?: string;
  /** PE rooms: exam code, paper and materials (names only), submission rules. */
  pe?: PeStoredConfig | null;
  /** When everything of the room is deleted for good. */
  expiresAt: number | null;
}

export interface JoinPrefillDto {
  info: CandidateInfo;
  universities: Array<{ id: string; name: string; short: string; color: string }>;
  /** Terms of every university, newest first; `current` marks the one running today (GMT+7). */
  terms: Array<{ universityId: string; code: string; name: string; current: boolean }>;
}

export type JoinLookup =
  | { state: 'OK'; ticket: string; session: JoinSessionDto; needsOtp: false }
  | { state: 'NEEDS_OTP'; needsOtp: true }
  | { state: 'NOT_OPEN'; opensAt: number; title: string; startsAt: number; durationMin: number; subjectCode: string; subjectName: string; lecturerDisplay: string; questionCount: number }
  | { state: 'CLOSED' }
  | { state: 'ALREADY_ACTIVE'; attemptId: string; title: string }
  | { state: 'ALREADY_SUBMITTED'; attemptId: string; title: string; canRetake: boolean }
  | { state: 'HOST' };

export interface JoinSessionDto {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  kind: VecKind;
  subjectCode: string;
  subjectName: string;
  universityColor: string | null;
  lecturerDisplay: string;
  startsAt: number;
  endsAt: number;
  durationMin: number;
  questionCount: number;
  lobbyOpenMin: number;
  lateJoinMin: number;
  status: SessionStatus;
  roomCode: string;
  settings: Pick<VecSettings, 'integrity' | 'results' | 'retake' | 'access'>;
  examCode?: string;
}

export interface PaperDto {
  attemptId: string;
  paperCode: string;
  questions: Array<{ qid: string; kind: 'SINGLE' | 'MULTI'; text: string; options: Array<{ oid: string; text: string }> }>;
  answers: Record<string, { oids: string[]; flagged: boolean; seq: number }>;
}

export interface AttemptStateDto {
  id: string;
  sessionId: string;
  attemptNo: number;
  maxAttempts: number;
  state: AttemptState;
  paperCode: string;
  startedAt: number | null;
  submittedAt: number | null;
  deadlineAt: number | null;
  lockReason: string | null;
  lockedAt: number | null;
  answered: number;
  total: number;
  candidate: Pick<CandidateInfo, 'fullName' | 'studentCode' | 'email' | 'className' | 'term'>;
  session: JoinSessionDto;
  serverNow: number;
  connectionId: string | null;
}

export type HeartbeatCommand =
  | { type: 'LOCK'; reason: string }
  | { type: 'RESUME' }
  | { type: 'FORCE_SUBMIT' }
  | { type: 'REMOVE'; reason: string }
  | { type: 'TIME_BONUS'; minutes: number }
  | { type: 'MESSAGE'; id: number; urgent: boolean; body: string; at: number }
  | { type: 'SESSION_PAUSED' }
  | { type: 'SESSION_RESUMED' }
  | { type: 'SESSION_ENDED' }
  | { type: 'RELEASE_DEVICE' };

export interface HeartbeatResponse {
  serverNow: number;
  attemptState: AttemptState;
  sessionStatus: SessionStatus;
  deadlineAt: number | null;
  lockReason: string | null;
  commands: HeartbeatCommand[];
}

export interface AttemptResultDto {
  attemptId: string;
  sessionId: string;
  title: string;
  attemptNo: number;
  maxAttempts: number;
  state: AttemptState;
  submittedAt: number | null;
  paperCode: string;
  /** Null until the lecturer lets the candidate see it. */
  score: null | { score10: number; label: string; passed: boolean; correct: number; wrong: number; blank: number; total: number; durationSec: number | null };
  counted: null | { score10: number; attemptNo: number | null; how: RetakeScoring };
  attempts: Array<{ id: string; attemptNo: number; state: AttemptState; score10: number | null; submittedAt: number | null }>;
  canSeeScore: boolean;
  canSeeRightWrong: boolean;
  canSeeAnswers: boolean;
  review?: Array<{
    qid: string;
    kind: 'SINGLE' | 'MULTI';
    text: string;
    options: Array<{ oid: string; text: string; chosen: boolean; correct?: boolean }>;
    verdict?: 'RIGHT' | 'WRONG' | 'BLANK';
  }>;
  retake: { ok: boolean; reason?: RetakeBlock; used: number; quota: number; mode: RetakeMode; requested: boolean; approved: boolean };
  sessionStatus: SessionStatus;
}

export interface MonitorRow {
  attemptId: string;
  userId: string;
  fullName: string;
  accountName: string;
  email: string;
  studentCode: string;
  state: AttemptState;
  attemptNo: number;
  maxAttempts: number;
  paperCode: string;
  answered: number;
  total: number;
  current: number;
  lastSeenAt: number | null;
  online: boolean;
  fullscreen: boolean | null;
  lock: number;
  warn: number;
  risk: number;
  deadlineAt: number | null;
  ip: string | null;
  countedScore: number | null;
  score10: number | null;
  lockReason: string | null;
  lockedAt: number | null;
  /** PE rooms: how many solutions are on file and when the last one came in. */
  pe?: { submissions: number; lastAt: number | null; bytes: number; closed: boolean };
}

export interface MonitorEvent {
  id: number;
  attemptId: string;
  userId: string;
  name: string;
  type: string;
  label: string;
  severity: Severity;
  at: number;
  data: Record<string, unknown> | null;
}

export interface MonitorRequestDto {
  id: string;
  attemptId: string;
  name: string;
  kind: 'UNLOCK' | 'RETAKE';
  reason: string;
  lockReason: string | null;
  at: number;
}

export interface MonitorDto {
  serverNow: number;
  session: VecSessionDto;
  rows: MonitorRow[];
  events: MonitorEvent[];
  cursor: number;
  requests: MonitorRequestDto[];
}

export interface AttemptLiveDto {
  attemptId: string;
  questions: Array<{ qid: string; kind: 'SINGLE' | 'MULTI'; text: string; options: Array<{ key: string; text: string; chosen: boolean; correct: boolean }>; flagged: boolean; answeredAt: number | null; verdict: 'RIGHT' | 'WRONG' | 'BLANK' }>;
}

export interface SessionResultsDto {
  session: VecSessionDto;
  stats: { candidates: number; submitted: number; avg: number | null; median: number | null; max: number | null; min: number | null; stdev: number | null; passRate: number | null; avgDurationSec: number | null };
  distribution: number[];
  rows: Array<{ userId: string; fullName: string; studentCode: string; email: string; className: string; attempts: number; counted: number | null; countedAttemptNo: number | null; correct: number | null; wrong: number | null; blank: number | null; submittedAt: number | null; lock: number; warn: number; risk: number; state: AttemptState; paperCode: string }>;
  released: boolean;
}

export interface HistoryItemDto {
  id: string;
  sessionId: string;
  kind: VecKind;
  title: string;
  subjectCode: string;
  startsAt: number;
  status: SessionStatus;
  roomCode?: string;
  candidates?: number;
  avg?: number | null;
  passRate?: number | null;
  attemptId?: string;
  attempts?: Array<{ id: string; attemptNo: number; state: AttemptState; score10: number | null }>;
  countedScore?: number | null;
  scoreVisible?: boolean;
  expiresAt?: number | null;
}

export interface MeStateDto {
  attempt: { id: string; sessionId: string; title: string; state: AttemptState } | null;
  hosting: Array<{ id: string; title: string; status: SessionStatus }>;
}

/* ───────────────────────────── csv ───────────────────────────── */

/** Cells starting with = + - @ are prefixed so a spreadsheet will not run them as formulas. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
