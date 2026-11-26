import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSlots, dayLabel, gridRows, heatOf, meetEventInputSchema, nextDateFor, suggestTimes, validMeetRange } from '../src/index.js';

const ev = {
  days: [
    { key: 'mon', start: 18 * 60, end: 22 * 60 },
    { key: 'tue', start: 18 * 60, end: 22 * 60 },
  ],
  slotMin: 30,
  durationMin: 60,
  blocked: { tue: [19 * 60] } as Record<string, number[]>,
};
const range = (a: number, b: number) => {
  const o: number[] = [];
  for (let m = a * 60; m < b * 60; m += 30) o.push(m);
  return o;
};

test('the window where everyone is free wins', () => {
  const ps = [
    { id: 'a', free: { mon: range(18, 21), tue: range(18, 22) }, busy: {} },
    { id: 'b', free: { mon: range(19, 21) }, busy: {} },
    { id: 'c', free: { mon: range(19.5, 22), tue: range(20, 22) }, busy: {} },
  ];
  const s = suggestTimes(ev, ps);
  assert.equal(s[0]!.day, 'mon');
  assert.equal(s[0]!.start, 19.5 * 60);
  assert.equal(s[0]!.end, 20.5 * 60);
  assert.equal(s[0]!.full, true);
  // the same three stay free 19:30–21:00, so the range is flexible
  assert.equal(s[0]!.flexStart, 19.5 * 60);
  assert.equal(s[0]!.flexEnd, 21 * 60);
  // suggestions never overlap
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const x = s[i]!;
    const y = s[j]!;
    assert.ok(x.day !== y.day || x.end <= y.start || y.end <= x.start);
  }
});

test('blocked slots split a day and are never suggested', () => {
  const ps = [{ id: 'a', free: { tue: range(18, 22) }, busy: {} }];
  const s = suggestTimes(ev, ps, { limit: 10 });
  for (const x of s) if (x.day === 'tue') assert.ok(x.end <= 19 * 60 || x.start >= 19.5 * 60);
  assert.equal(validMeetRange(ev, 'tue', 18.5 * 60, 19.5 * 60), false);
  assert.equal(validMeetRange(ev, 'tue', 19.5 * 60, 20.5 * 60), true);
});

test('surely busy ranks below simply not chosen', () => {
  const ps = [
    { id: 'a', free: { mon: range(18, 22) }, busy: {} },
    { id: 'b', free: {}, busy: { mon: range(18, 19) } },
  ];
  const s = suggestTimes(ev, ps);
  assert.ok(s[0]!.start >= 19 * 60);
  assert.deepEqual(s[0]!.busy, []);
});

test('more than 32 people still count exactly', () => {
  const ps = Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, free: { mon: i < 66 ? range(20, 21) : range(18, 19) }, busy: {} }));
  const s = suggestTimes(ev, ps);
  assert.equal(s[0]!.free.length, 66);
  assert.equal(s[0]!.start, 20 * 60);
});

test('helpers', () => {
  assert.deepEqual(dayLabel('tue'), { short: 'T3', long: 'Thứ Ba', date: null });
  assert.equal(dayLabel('2026-12-01').short, 'T3');
  assert.equal(gridRows(ev.days, 30).length, 8);
  assert.deepEqual(cleanSlots({ tue: [19 * 60, 18 * 60, 18 * 60, 999] }, ev.days, 30, ev.blocked), { tue: [18 * 60] });
  assert.equal(heatOf([{ free: { mon: [1080] }, busy: { mon: [1110] } }]).get('mon|1110')!.busy, 1);
  assert.match(nextDateFor('mon', new Date('2026-11-26T12:00:00Z')), /^2026-11-30$/);
  assert.equal(meetEventInputSchema.safeParse({ title: 'Họp nhóm', mode: 'WEEKLY', days: [{ key: '2026-12-01', start: 60, end: 120 }] }).success, false);
  assert.equal(meetEventInputSchema.safeParse({ title: 'Họp nhóm', mode: 'WEEKLY', days: [{ key: 'mon', start: 60, end: 120 }], durationMin: 45 }).success, false);
});

test('nobody free for the whole meeting: the warmest windows are still offered', () => {
  const ev = { days: [{ key: 'mon', start: 1080, end: 1260 }], slotMin: 30, durationMin: 120, blocked: {} };
  const a = { id: 'a', free: { mon: [1080, 1110] }, busy: {} };
  const b = { id: 'b', free: { mon: [1140, 1170] }, busy: {} };
  const c = { id: 'c', free: { mon: [1110, 1140] }, busy: {} };
  const s = suggestTimes(ev, [a, b, c]);
  assert.ok(s.length >= 1);
  assert.equal(s[0]!.free.length, 0);
  assert.equal(s[0]!.start, 1080);
  assert.ok(s[0]!.warmth > 0);
  assert.equal(s[0]!.flexEnd - s[0]!.flexStart, 120);
});
