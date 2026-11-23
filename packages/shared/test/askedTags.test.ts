import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTermFilter, parseTermFilter, splitAskedTags, stripAskedTags, termRank } from '../src/askedTags.js';

test('reads the tags in front of a question and cleans the text', () => {
  const r = splitAskedTags('[FA26_B10][SU26_B5] Which programming language is used to develop Flutter applications?');
  assert.equal(r.text, 'Which programming language is used to develop Flutter applications?');
  assert.deepEqual(r.tags.map((t) => t.label), ['FA26_B10', 'SU26_B5']);
});

test('no tag, no change; brackets mid-sentence are left alone', () => {
  assert.deepEqual(splitAskedTags('Plain question'), { tags: [], text: 'Plain question' });
  assert.equal(stripAskedTags('What does [x] mean?'), 'What does [x] mean?');
  assert.equal(stripAskedTags('[Note] keep'), '[Note] keep');
});

test('repeats are counted once, spacing and case are forgiven', () => {
  const r = splitAskedTags('[su26_b5] [SU26_B5][SU26_B10] Q');
  assert.equal(r.tags.length, 2);
  assert.equal(r.text, 'Q');
});

test('terms sort by time: SP < SU < FA within a year, then by year', () => {
  assert.ok(termRank('SP26') < termRank('SU26') && termRank('SU26') < termRank('FA26') && termRank('FA25') < termRank('SP26'));
  assert.equal(termRank('nope'), 0);
});

test('"only" and "from" filters', () => {
  const t = splitAskedTags('[FA25_B10][SU26_B5] Q').tags;
  assert.equal(matchesTermFilter(t, null), true);
  assert.equal(matchesTermFilter(t, { mode: 'only', code: 'SU26_B5' }), true);
  assert.equal(matchesTermFilter(t, { mode: 'only', code: 'SU26_B10' }), false, 'a different block is a different exam');
  assert.equal(matchesTermFilter(t, { mode: 'only', code: 'FA26_B10' }), false);
  assert.equal(matchesTermFilter(t, { mode: 'from', code: 'SU26_B5' }), true);
  assert.equal(matchesTermFilter(t, { mode: 'from', code: 'FA26_B10' }), false);
  assert.deepEqual(parseTermFilter('from:SU26_B5'), { mode: 'from', code: 'SU26_B5' });
  assert.equal(parseTermFilter('bad'), null);
});

test('one bracket with several exams, retakes included', () => {
  const r = splitAskedTags('[SU22_B10, SP23_B10, SU23_B10, FA23_B10_RE, SU24_B10_RE, SP25_B10_RE, SP26_B10]\nWhy is deciding how to act?');
  assert.equal(r.tags.length, 7);
  assert.equal(r.text, 'Why is deciding how to act?');
  assert.deepEqual(r.tags.map((t) => t.code), ['SP26_B10', 'SP25_B10_RE', 'SU24_B10_RE', 'FA23_B10_RE', 'SU23_B10', 'SP23_B10', 'SU22_B10']);
  assert.equal(r.tags[1].retake, true);
  assert.equal(matchesTermFilter(r.tags, { mode: 'only', code: 'FA23_B10_RE' }), true);
  assert.equal(matchesTermFilter(r.tags, { mode: 'only', code: 'FA23_B10' }), false);
  assert.deepEqual(parseTermFilter('only:FA23_B10_RE'), { mode: 'only', code: 'FA23_B10_RE' });
  assert.equal(stripAskedTags('[Note, remember] keep'), '[Note, remember] keep');
});
