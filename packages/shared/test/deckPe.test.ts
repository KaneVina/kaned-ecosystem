import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECK_TEMPLATE, chapterTag, parseDeck } from '../src/deck.js';
import { pickQuestions } from '../src/vec.js';

const SRC = `---
môn: PRM393
---

# Chương 1: Flutter

## Câu 1
What is Flutter?
- [x] UI toolkit
- [ ] Database

# PE: Thi thực hành

## Mẹo 9: setState
Đổi dữ liệu trong **setState**.

## Đề 1: Đếm số
[SU26_B10][FA25_B5]
Viết ứng dụng:
- Text hiển thị số
\`\`\`python
# a comment, not a chapter
## nor a question
print(1)
\`\`\`

## Câu 201
Viết CounterPage.
Lời giải:
\`\`\`dart
# still code
class A {}
\`\`\`
Dùng setState.
> Giải thích: Widget + State.
Mẹo: 9
Dễ nhầm: 202

## Câu 202
Hàm nào cập nhật giao diện?
- [ ] build()
- [x] setState()

## Đề 2: JSON
Đọc file.

## Câu 210
Đề: 2
Parse JSON.
Lời giải: dùng jsonDecode.
`;

test('PE: papers, written questions, fenced headings', () => {
  const { content, issues } = parseDeck(SRC);
  assert.deepEqual(issues.filter((i) => i.level === 'error'), []);
  const pe = content.chapters.find((c) => c.pe);
  assert.ok(pe);
  assert.equal(chapterTag(pe), 'PE');
  assert.equal(chapterTag(content.chapters[0]), 'Chương 1');
  assert.equal(content.papers?.length, 2);
  assert.match(content.papers![0]!.body, /# a comment, not a chapter/);
  const q201 = content.questions.find((q) => q.id === '201')!;
  assert.equal(q201.paper, 1);
  assert.equal(q201.options.length, 0);
  assert.match(q201.solution!, /# still code/);
  assert.match(q201.solution!, /Dùng setState\.$/);
  assert.equal(q201.explain, 'Widget + State.');
  assert.deepEqual(q201.tips, [9]);
  assert.deepEqual(q201.similar, ['202']);
  assert.equal(content.questions.find((q) => q.id === '202')!.paper, 1);
  const q210 = content.questions.find((q) => q.id === '210')!;
  assert.equal(q210.paper, 2);
  assert.equal(q210.solution, 'dùng jsonDecode.');
  assert.equal(content.questions.length, 4);
});

test('PE: errors point at the line', () => {
  const bad = parseDeck(`# PE\n\n## Đề 1: X\nĐề bài.\n\n## Câu 5\nViết code.\n\n## Câu 6\nĐề: 3\nCâu hỏi\nLời giải:\n\`\`\`js\nopen\n`);
  const msgs = bad.issues.filter((i) => i.level === 'error').map((i) => i.message).join('\n');
  assert.match(msgs, /Câu 5 chưa có phương án/);
  assert.match(msgs, /Lời giải câu 6 mở khối code/);
  assert.match(msgs, /Câu 6 thuộc Đề 3/);
});

test('"Đề:" with words is just question text', () => {
  const r = parseDeck(`## Câu 1\nĐề: cho đoạn code sau\n- [x] a\n- [ ] b\n`);
  assert.equal(r.content.questions[0]!.paper, undefined);
  assert.match(r.content.questions[0]!.text, /Đề: cho đoạn code/);
});

test('the template parses and FE rooms leave PE out', () => {
  const t = parseDeck(DECK_TEMPLATE);
  assert.deepEqual(t.issues.filter((i) => i.level === 'error'), []);
  const all = parseDeck(SRC).content.questions;
  const picked = pickQuestions(all, { questionCount: 50, chapters: [], dedupeVariants: false, balanceByChapter: false } as never, () => 0.5);
  assert.deepEqual(picked.map((q) => q.id), ['1']);
});
