"""Convert a Kaned v2 study HTML (window.__DATA__) into the Kaned deck .md format."""
import html, json, re, sys

src, out = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8').read()
line = next(l for l in text.split('\n') if l.startswith('<script>window.__DATA__='))
data, _ = json.JSONDecoder().raw_decode(line[line.index('{'):])
Q, T = data['q'], data['t']
CH = dict(re.findall(r"\{n:(\d+), name:'([^']+)'\}", text))
title = re.search(r'<title>(.*?)</title>', text).group(1)

def md(body):
    body = html.unescape(body)
    paras = re.findall(r'<p>(.*?)</p>', body, re.S) or [body]
    paras = [re.sub(r'</?b>', '**', p).strip() for p in paras]
    assert not any('<' in p and re.search(r'</?[a-z]+', p) for p in paras), paras
    return paras

tip_no, n = {}, 0
for i, t in enumerate(T):
    if not t.get('w'):
        n += 1
        tip_no[i] = n
warn_of = {}
for q in Q:
    for t in q.get('tp', []):
        if T[t].get('w'):
            warn_of.setdefault(q['i'], []).append(t)

def key(i):
    a, _, b = i.partition('.')
    return (int(a), int(b or 0))

base = sum(1 for q in Q if 'p' not in q)
lines = ['---', 'môn: MLN122', f'tên: {title}',
         f'mô tả: {base} câu trắc nghiệm ôn thi cuối kỳ và {len(Q) - base} câu kiểu hỏi khác, đủ đáp án, ghi chú, câu dễ nhầm và {len(tip_no)} mẹo nhớ.',
         '---', '']
for c in sorted(int(k) for k in CH):
    lines += [f'# Chương {c}: {CH[str(c)]}', '']
    for i, t in enumerate(T):
        if t['c'] == c and i in tip_no:
            lines.append(f'## Mẹo {tip_no[i]}: {t["t"]}')
            lines.append('\n\n'.join(md(t['b'])))
            lines.append('')
    for q in sorted((q for q in Q if q['c'] == c), key=lambda q: key(q['i'])):
        lines.append(f'## Câu {q["i"]}')
        lines.append(q['q'].strip())
        for k, o in enumerate(q['o']):
            lines.append(f'- [{"x" if k in q["a"] else " "}] {o.strip()}')
        if q.get('nt'): lines.append(f'> Ghi chú: {q["nt"].strip()}')
        if q.get('alt'): lines.append(f'> Đề khác: {q["alt"].strip()}')
        for v in q.get('vt', []): lines.append(f'> Hỏi cách khác: {v["q"].strip()} → {v["t"].strip()}')
        for w in warn_of.get(q['i'], []):
            paras = md(T[w]['b'])
            lines.append(f'> Lưu ý đáp án: {paras[0]}')
            lines += [f'> {p}' for p in paras[1:]]
        tips = [tip_no[t] for t in q.get('tp', []) if t in tip_no]
        if tips: lines.append('Mẹo: ' + ', '.join(map(str, tips)))
        if q.get('sm'): lines.append('Dễ nhầm: ' + ', '.join(q['sm']))
        lines.append('')
open(out, 'w', encoding='utf-8').write('\n'.join(lines).rstrip() + '\n')
json.dump({'q': Q, 't': T, 'tip_no': tip_no, 'warn_of': warn_of}, open(out + '.orig.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('wrote', out, len(Q), 'questions', len(tip_no), 'tips', len(warn_of), 'warnings')
