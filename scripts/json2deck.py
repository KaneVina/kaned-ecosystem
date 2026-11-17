"""Quiz bank JSON (questions with question/options/answer/hint/rationale) → Kaned deck .md."""
import json, re, sys
src, out = sys.argv[1], sys.argv[2]
meta = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
o = json.load(open(src, encoding='utf-8'))
Q = o['questions']

CODEY = re.compile(r'[;{}]\s*$|^\s|^(import|class|void|final|var|int|double|String|bool|List|Map|Future|Stream|return|print|@|//|dynamic|const|late|abstract|enum|mixin|extension|typedef|await|if|for|while|switch|try|\}|\)|Widget)\b')
def is_prose(line):
    l = line.strip()
    return bool(re.search(r'[?.:]$', l)) and not l.endswith(';') and not CODEY.search(line) or (' ' in l and re.match(r'^(If|What|When|Which|How|Why|and|Then|Given|Consider|In|A|The|After|Assume|Suppose)\b', l) and not l.endswith((';', '{')))

def text_of(q):
    lines = q.split('\n')
    if len(lines) == 1:
        return q.strip()
    head, body, tail = [lines[0]], lines[1:], []
    while body and is_prose(body[-1]) and not body[-1].strip() in ('}', '});', ');'):
        tail.insert(0, body.pop())
    if not body:
        return '\n'.join(head + tail).strip()
    return '\n'.join(head + ['```dart'] + body + ['```'] + tail).strip()

def one(s):
    return ' '.join(str(s).split())

lines = ['---', f"môn: {meta.get('code', o.get('code',''))}", f"tên: {meta.get('title', o.get('name',''))}"]
if meta.get('description'): lines.append(f"mô tả: {meta['description']}")
lines += ['---', '']
for q in sorted(Q, key=lambda q: q['id']):
    ans = q['answer'] if isinstance(q['answer'], list) else [q['answer']]
    lines.append(f"## Câu {q['id']}")
    lines.append(text_of(q['question']))
    for k, opt in enumerate(q['options']):
        lines.append(f"- [{'x' if k in ans else ' '}] {one(opt)}")
    if q.get('hint'): lines.append(f"> Gợi ý: {one(q['hint'])}")
    if q.get('rationale'): lines.append(f"> Giải thích: {one(q['rationale'])}")
    lines.append('')
open(out, 'w', encoding='utf-8').write('\n'.join(lines).rstrip() + '\n')
print('wrote', out, len(Q))
