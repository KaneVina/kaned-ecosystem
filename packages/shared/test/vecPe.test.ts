import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileAllowed, newExamCode, peConfigSchema, peFormatOf, sessionInputSchema } from '../src/index.js';

test('exam code comes from the subject code plus four characters', () => {
  assert.match(newExamCode('prm393'), /^PRM393_PE_[A-Z2-9]{4}$/);
  assert.match(newExamCode('Lập trình'), /^LAPTRINH_PE_/);
  assert.match(newExamCode(''), /^EXAM_PE_/);
});

test('blocked and allowed files', () => {
  assert.equal(fileAllowed('run.exe', { allowedExts: [] }), false);
  assert.equal(fileAllowed('Main.java', { allowedExts: [] }), true);
  assert.equal(fileAllowed('Main.java', { allowedExts: ['zip'] }), false);
  assert.equal(peFormatOf('de-thi.PDF'), 'PDF');
  assert.equal(peFormatOf('a.png'), 'IMAGE');
});

test('a PE session needs a paper and no deck', () => {
  const base = { kind: 'PE', title: 'PE test', startsAt: '2030-01-01T08:00:00+07:00', durationMin: 90 };
  const pe = peConfigSchema.parse({ examCode: 'PRM393_PE_ABCD', paper: [{ source: 'UPLOAD', fileId: 'f1' }] });
  assert.equal(sessionInputSchema.safeParse({ ...base, pe }).success, true);
  assert.equal(sessionInputSchema.safeParse(base).success, false);
  assert.equal(peConfigSchema.safeParse({ examCode: 'X Y', paper: [] }).success, false);
});
