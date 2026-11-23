import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptDeadline, buildPaper, canStartRetake, computeEndsAt, countedScore, decideAction, defaultVecSettings, effectiveSessionStatus,
  formatRoomCode, gradeAttempt, initialDeadline, mergeEvents, paperCodeFrom, parseRoomCode, riskScore, toCsv, vnToMs, fmtVnFull, vecSettingsSchema,
  type RetakeContext, type SessionTimes, type SnapshotQuestion,
} from '../src/vec.js';

const min = 60_000;
const session = (over: Partial<SessionTimes> = {}): SessionTimes => ({
  startsAt: Date.UTC(2026, 10, 25, 1, 0), endsAt: Date.UTC(2026, 10, 25, 2, 0), lobbyOpenMin: 15, lateJoinMin: 10, pausedAt: null, pausedTotalSec: 0, statusOverride: null, ...over,
});

test('Vietnam time is independent of the device zone', () => {
  const ms = vnToMs('2026-11-25', '08:00');
  assert.equal(new Date(ms).toISOString(), '2026-11-25T01:00:00.000Z');
  assert.equal(fmtVnFull(ms), '08:00, 25/11/2026 (GMT+7)');
});

test('endsAt stretches with retakes only when the window extends', () => {
  const s = session().startsAt;
  assert.equal(computeEndsAt(s, 60, 0, true), s + 60 * min);
  assert.equal(computeEndsAt(s, 60, 2, true), s + 180 * min);
  assert.equal(computeEndsAt(s, 60, 2, false), s + 60 * min);
});

test('status is computed from the clock', () => {
  const s = session();
  assert.equal(effectiveSessionStatus(s.startsAt - 20 * min, s), 'SCHEDULED');
  assert.equal(effectiveSessionStatus(s.startsAt - 10 * min, s), 'LOBBY');
  assert.equal(effectiveSessionStatus(s.startsAt + min, s), 'LIVE');
  assert.equal(effectiveSessionStatus(s.endsAt, s), 'ENDED');
  assert.equal(effectiveSessionStatus(s.startsAt + min, session({ statusOverride: 'PAUSED', pausedAt: s.startsAt })), 'PAUSED');
  assert.equal(effectiveSessionStatus(s.startsAt + min, session({ statusOverride: 'CANCELLED' })), 'CANCELLED');
});

test('a pause pushes the session end and attempt deadline back by exactly its length', () => {
  const s = session({ pausedAt: session().startsAt + 10 * min, statusOverride: 'PAUSED' });
  const now = s.startsAt + 15 * min; // paused for 5 minutes so far
  const dl = initialDeadline(session(), 60, 1, s.startsAt, false, s.startsAt);
  const clock = { deadlineAt: dl, pausedBaseSec: 0, timeBonusSec: 0 };
  assert.equal(attemptDeadline(clock, s, now), dl + 5 * min);
  const after = session({ pausedTotalSec: 300 });
  assert.equal(attemptDeadline(clock, after, now), dl + 5 * min);
  assert.equal(attemptDeadline({ ...clock, timeBonusSec: 120 }, after, now), dl + 7 * min);
});

test('first attempt has a fixed window, retakes are capped by the session end', () => {
  const s = session({ endsAt: session().startsAt + 180 * min });
  assert.equal(initialDeadline(s, 60, 1, s.startsAt + 10 * min, false, s.startsAt + 10 * min), s.startsAt + 60 * min);
  assert.equal(initialDeadline(s, 60, 2, s.startsAt + 100 * min, false, s.startsAt + 100 * min), s.startsAt + 160 * min);
  assert.equal(initialDeadline(s, 60, 2, s.startsAt + 150 * min, false, s.startsAt + 150 * min), s.endsAt);
});

test('room codes: 7 digits, grouped, parsed from messy input', () => {
  assert.equal(formatRoomCode('4829163'), '482 9163');
  assert.equal(parseRoomCode('482-9163 x'), '4829163');
});

const qs: SnapshotQuestion[] = [
  { qid: '1', chapter: 1, kind: 'SINGLE', text: 'a', options: ['x', 'y', 'z', 'Tất cả các phương án trên'], answers: [1], canShuffle: false },
  { qid: '2', chapter: 1, kind: 'MULTI', text: 'b', options: ['p', 'q', 'r', 's'], answers: [0, 2], canShuffle: true },
  { qid: '3', chapter: 2, kind: 'SINGLE', text: 'c', options: ['p', 'q', 'r', 's'], answers: [3], canShuffle: true },
];

test('paper is stable for a seed, differs between seeds, keeps "all of the above" in place', () => {
  const a = buildPaper(qs, 'seed-1', true, true);
  const b = buildPaper(qs, 'seed-1', true, true);
  assert.deepEqual(a, b);
  const other = buildPaper(qs, 'seed-2', true, true);
  assert.notDeepEqual(a, other);
  const q1 = a.find((q) => q.qid === '1')!;
  assert.deepEqual(q1.options.map((o) => o.idx), [0, 1, 2, 3]);
  assert.equal(paperCodeFrom('seed-1').length, 4);
  assert.notEqual(paperCodeFrom('seed-1'), paperCodeFrom('seed-2'));
  const none = buildPaper(qs, 'seed-1', false, false);
  assert.deepEqual(none.map((q) => q.qid), ['1', '2', '3']);
});

test('grading: single, multi all-or-nothing, blank, and partial credit', () => {
  const r = gradeAttempt(qs, { '1': [1], '2': [0], '3': [] });
  assert.equal(r.correct, 1);
  assert.equal(r.wrong, 1);
  assert.equal(r.blank, 1);
  assert.equal(r.score10, 3.33);
  assert.equal(gradeAttempt(qs, { '1': [1], '2': [2, 0], '3': [3] }).score10, 10);
  const partial = gradeAttempt(qs, { '1': [1], '2': [0], '3': [3] }, 'PARTIAL');
  assert.equal(partial.score10, 8.33);
});

test('counted score for BEST, LAST, FIRST, AVERAGE', () => {
  const at = [
    { attemptNo: 1, score10: 6, submittedAt: 1 },
    { attemptNo: 2, score10: 7.5, submittedAt: 2 },
    { attemptNo: 3, score10: 5, submittedAt: 3 },
  ];
  assert.deepEqual(countedScore(at, 'BEST'), { score: 7.5, attemptNo: 2 });
  assert.deepEqual(countedScore(at, 'LAST'), { score: 5, attemptNo: 3 });
  assert.deepEqual(countedScore(at, 'FIRST'), { score: 6, attemptNo: 1 });
  assert.equal(countedScore(at, 'AVERAGE')!.score, 6.17);
  assert.equal(countedScore([], 'BEST'), null);
});

const rc = (over: Partial<RetakeContext> = {}, retake: Partial<RetakeContext['retake']> = {}): RetakeContext => ({
  retake: { ...defaultVecSettings().retake, max: 2, ...retake },
  durationMin: 60, now: 1000 * min, sessionEnded: false, sessionEndsAt: 1000 * min + 120 * min, hasActiveAttempt: false,
  lastSubmittedAt: 1000 * min - 5 * min, retakesUsed: 0, extraRetakes: 0, approved: false, hasFinishedAttempt: true, ...over,
});

test('retake rules cover every block reason', () => {
  assert.deepEqual(canStartRetake(rc()), { ok: true });
  assert.deepEqual(canStartRetake(rc({}, { max: 0 })), { ok: false, reason: 'DISABLED' });
  assert.deepEqual(canStartRetake(rc({ retakesUsed: 2 })), { ok: false, reason: 'NO_QUOTA' });
  assert.deepEqual(canStartRetake(rc({ retakesUsed: 2, extraRetakes: 1 })), { ok: true });
  assert.deepEqual(canStartRetake(rc({ hasActiveAttempt: true })), { ok: false, reason: 'ACTIVE_ATTEMPT' });
  assert.deepEqual(canStartRetake(rc({ sessionEnded: true })), { ok: false, reason: 'SESSION_ENDED' });
  assert.deepEqual(canStartRetake(rc({ sessionEndsAt: 1000 * min + 6 * min })), { ok: false, reason: 'NOT_ENOUGH_TIME' });
  assert.deepEqual(canStartRetake(rc({}, { cooldownMin: 10 })), { ok: false, reason: 'COOLDOWN' });
  assert.deepEqual(canStartRetake(rc({}, { mode: 'REQUEST' })), { ok: false, reason: 'NEEDS_APPROVAL' });
  assert.deepEqual(canStartRetake(rc({ approved: true }, { mode: 'REQUEST' })), { ok: true });
  assert.deepEqual(canStartRetake(rc({}, { mode: 'LECTURER_ONLY' })), { ok: false, reason: 'LECTURER_ONLY' });
  assert.deepEqual(canStartRetake(rc({ extraRetakes: 1 }, { mode: 'LECTURER_ONLY' })), { ok: true });
  assert.deepEqual(canStartRetake(rc({}, { requireFullDuration: true })), { ok: true });
  assert.deepEqual(canStartRetake(rc({ sessionEndsAt: 1000 * min + 50 * min }, { requireFullDuration: true })), { ok: false, reason: 'NOT_ENOUGH_TIME' });
});

test('integrity presets decide the action per behaviour', () => {
  assert.equal(decideAction('FULLSCREEN_EXIT', 'STRICT', {}), 'LOCK');
  assert.equal(decideAction('TAB_HIDDEN', 'STRICT', {}), 'LOCK');
  assert.equal(decideAction('TAB_HIDDEN', 'STANDARD', {}), 'WARN');
  assert.equal(decideAction('TAB_HIDDEN', 'STANDARD', { TAB_HIDDEN: 1 }), 'WARN');
  assert.equal(decideAction('WINDOW_BLUR', 'STANDARD', { TAB_HIDDEN: 1, WINDOW_BLUR: 1 }), 'LOCK');
  assert.equal(decideAction('FULLSCREEN_EXIT', 'RELAXED', {}), 'WARN');
  assert.equal(decideAction('FULLSCREEN_EXIT', 'RELAXED', {}, { graceExpired: true }), 'LOCK');
  assert.equal(decideAction('TAB_HIDDEN', 'RELAXED', {}), 'INFO');
  assert.equal(decideAction('COPY_ATTEMPT', 'STRICT', { COPY_ATTEMPT: 9 }), 'LOCK');
  assert.equal(decideAction('DEVTOOLS_SUSPECT', 'STRICT', {}), 'INFO');
});

test('events within 1.5 s merge into one violation', () => {
  const g = mergeEvents([{ at: 0, severity: 'WARN' as const }, { at: 800, severity: 'LOCK' as const }, { at: 5000, severity: 'WARN' as const }]);
  assert.equal(g.length, 2);
  assert.equal(g[0]!.length, 2);
});

test('risk score and csv safety', () => {
  assert.equal(riskScore({ lock: 1, warn: 2, copy: 3 }), 19);
  assert.equal(toCsv([['=cmd', 'a,b', 'ok']]), '﻿\'=cmd,"a,b",ok');
});

test('settings default: no retakes, strict, score right after submit', () => {
  const s = vecSettingsSchema.parse({});
  assert.equal(s.retake.max, 0);
  assert.equal(s.integrity.preset, 'STRICT');
  assert.equal(s.results.score, 'AFTER_SUBMIT');
  assert.equal(s.results.correctAnswers, 'AFTER_END');
});

test('exam snapshot hides the past-exam tags from candidates', async () => {
  const { toSnapshot } = await import('../src/vec.js');
  const q = { id: '1', text: '[FA26_B10][SU26_B5] Which language?', options: ['Dart', 'Kotlin'], answers: [0], chapter: 1, tips: [], similar: [] } as never;
  assert.equal(toSnapshot(q).text, 'Which language?');
});
