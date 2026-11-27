"""PMG201c PE .docx → Kaned PE section, without the reference answers.

Usage: python3 scripts/pe_docx2deck.py de-PE.docx [first tip no] [first question no] > pe.md
Part A frames become tips; each ĐỀ becomes a "## Đề", each Question/Request a written
"## Câu" with the English and Vietnamese text and a "Khung:" (structure + data from the
paper). "④ ĐÁP ÁN THAM KHẢO" is dropped."""
import re, sys
import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

src = sys.argv[1]
D = docx.Document(src)
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def runs_md(p):
    out = []
    for r in p.runs:
        t = r.text
        if not t:
            continue
        if r.bold and t.strip():
            lead = t[: len(t) - len(t.lstrip())]
            trail = t[len(t.rstrip()):]
            out.append(f"{lead}**{t.strip()}**{trail}")
        else:
            out.append(t)
    s = ''.join(out)
    s = re.sub(r'\*\*(\s*)\*\*', r'\1', s)
    s = re.sub(r'\*\*([^*]*)\*\*\*\*([^*]*)\*\*', r'**\1\2**', s)
    return s.replace(' ', ' ').rstrip()

def is_list(p):
    ppr = p._p.pPr
    return p.style.name.startswith('List') or (ppr is not None and ppr.numPr is not None)

def level(p):
    ppr = p._p.pPr
    if ppr is not None and ppr.numPr is not None and ppr.numPr.ilvl is not None:
        return int(ppr.numPr.ilvl.val)
    return 0

SAFE = re.compile(r'^(m[ẹeé]o|tips?|d[ễe]\s*nh[ầa]m|similar|đ[ềe]|l[ờo]i\s*gi[ảa]i|khung|c[áa]ch\s*l[àa]m|solution)\s*:', re.I)
def safe(line):
    s = line
    m = SAFE.match(s.strip())
    if m:
        s = s.replace(m.group(0), m.group(0)[:-1] + ' nhỏ:' if m.group(1).lower().startswith('m') else '**' + m.group(0)[:-1] + '**:', 1)
    if s.lstrip().startswith(('>', '#')):
        s = '​' + s.lstrip()
    if re.match(r'^\s*[-*+]\s*\[[ xX]\]', s):
        s = s.replace('[', '［', 1)
    return s

def table_md(tb):
    rows = []
    for r in tb.rows:
        cells = []
        for c in r.cells:
            txt = ' '.join(x for x in (runs_md(p) for p in c.paragraphs) if x.strip())
            cells.append(txt.replace('|', '/').strip())
        rows.append(cells)
    # merged cells repeat: keep as-is
    n = max(len(r) for r in rows)
    rows = [r + [''] * (n - len(r)) for r in rows]
    head = '| ' + ' | '.join(rows[0]) + ' |'
    sep = '|' + '|'.join(['---'] * n) + '|'
    body = ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
    return [head, sep, *body]

def block_lines(container_elems, doc_parent):
    """Paragraphs and tables (in order) → markdown lines."""
    out = []
    for el in container_elems:
        tag = el.tag.split('}')[1]
        if tag == 'p':
            p = Paragraph(el, doc_parent)
            t = runs_md(p)
            if not t.strip():
                out.append('')
                continue
            if is_list(p):
                out.append('  ' * level(p) + '- ' + t.strip())
            elif t.strip().startswith('•'):
                out.append('- ' + t.strip().lstrip('•').strip())
            else:
                out.append(t.strip())
        elif tag == 'tbl':
            tb = Table(el, doc_parent)
            if len(tb.rows) == 1 and len(tb.columns) == 1:
                cell = tb.cell(0, 0)
                out += block_lines(list(cell._tc.iterchildren()), cell)
            else:
                out.append('')
                out += table_md(tb)
                out.append('')
    # tidy blank runs; blank line between paragraphs that are not list items
    res = []
    for l in out:
        if l == '' and (not res or res[-1] == ''):
            continue
        res.append(l)
    # paragraphs separated by blank lines (except consecutive list items)
    final = []
    for l in res:
        if final and l and final[-1] and not (l.lstrip().startswith('- ') and final[-1].lstrip().startswith('- ')) and not l.startswith('|') :
            final.append('')
        final.append(safe(l) if l and not l.startswith('|') else l)
    while final and final[-1] == '':
        final.pop()
    while final and final[0] == '':
        final.pop(0)
    return final

els = list(D.element.body.iterchildren())
def P(el):
    return Paragraph(el, D) if el.tag == W + 'p' else None
def style(el):
    p = P(el)
    return p.style.name if p is not None else ''
def text(el):
    p = P(el)
    return p.text.strip() if p is not None else ''

# ── split into Part A (frames) and papers ──
frames = []  # (code, title, lines)
papers = []  # dict(title, header, scenario_en, scenario_vi, questions=[...])
i = 0
cur_paper = None
cur_q = None
section = None  # 'A' | 'paper'
mode = None
def flush_q():
    global cur_q
    if cur_q and cur_paper is not None:
        cur_paper['questions'].append(cur_q)
    cur_q = None

while i < len(els):
    el = els[i]
    st, tx = style(el), text(el)
    if st == 'Heading 1':
        flush_q()
        if tx.startswith('PHẦN A'):
            section = 'A'
        elif tx.startswith('ĐỀ'):
            section = 'paper'
            cur_paper = {'title': tx, 'header': [], 'en': [], 'vi': [], 'questions': []}
            papers.append(cur_paper)
            mode = 'header'
        else:
            section = None
        i += 1
        continue
    if section == 'A' and st == 'Heading 2':
        m = re.match(r'(A\d+)\.\s*(.*)', tx)
        # gather until next heading
        j = i + 1
        body = []
        while j < len(els) and style(els[j]) not in ('Heading 1', 'Heading 2'):
            if text(els[j]) != 'Khung':
                body.append(els[j])
            j += 1
        frames.append((m.group(1), m.group(2), block_lines(body, D)))
        i = j
        continue
    if section == 'paper':
        if st == 'Heading 2':
            flush_q()
            if tx.startswith('Đề bài'):
                mode = 'scenario'
            else:
                cur_q = {'title': tx, 'en': [], 'vi': [], 'frame': [], 'data': []}
                mode = 'q'
            i += 1
            continue
        # marker paragraphs
        if tx.startswith('①'):
            sub = 'en'; i += 1; continue
        if tx.startswith('②'):
            sub = 'vi'; i += 1; continue
        if tx.startswith('③'):
            sub = 'frame'; i += 1; continue
        if tx.startswith('📌'):
            sub = 'data'; i += 1; continue
        if tx.startswith('④'):
            sub = 'skip'; i += 1; continue
        if mode == 'header':
            if tx:
                cur_paper['header'].append(el)
        elif mode == 'scenario':
            cur_paper[sub].append(el)
        elif mode == 'q' and sub != 'skip':
            cur_q[sub].append(el)
    i += 1
flush_q()

# ── which frame (tip) each question uses ──
KIND = [
    (r'charter', 'A1'), (r'objective|success', 'A2'), (r'communication', 'A3'), (r'raci', 'A4'),
    (r'milestone|sequenc', 'A5'), (r'cost|budget', 'A6'), (r'probability|scoring', 'A8'), (r'risk', 'A7'),
    (r'stakeholder', 'A9'), (r'smart', 'A10'), (r'wbs', 'A11'), (r'description', 'A12'),
    (r'organi[sz]ation type', 'A13'), (r'critical path|cpm', 'A14'), (r'earned value|evm', 'A15'),
]
def kind_of(title):
    t = title.lower()
    for pat, code in KIND:
        if re.search(pat, t):
            return code
    return None

TIP0 = int(sys.argv[2]) if len(sys.argv) > 2 else 20
Q0 = int(sys.argv[3]) if len(sys.argv) > 3 else 401
tipno = {code: TIP0 + k for k, (code, _, _) in enumerate(frames)}

def term_tag(title):
    tags = []
    for m in re.finditer(r'(SP|SU|FA)(\d{2})(?:[_ ]?(PE\w*?|PEHCM))?(?=[_\s)–-]|$)', title):
        code = f'{m.group(1)}{m.group(2)}' + (f'_{m.group(3)}' if m.group(3) else '')
        tags.append(code)
    if not tags:
        m = re.search(r'(Spring|Summer|Fall)\s*(\d{4})', title)
        pe = re.search(r'(?:Practical Exam|PE)\s*(\d)', title)
        if m:
            season = {'Spring': 'SP', 'Summer': 'SU', 'Fall': 'FA'}[m.group(1)]
            tags.append(f'{season}{m.group(2)[2:]}' + (f'_PE{pe.group(1)}' if pe else ''))
    return tags

out = ['# PE: Thi thực hành', '']
for code, title, lines in frames:
    out += [f'## Mẹo {tipno[code]}: Khung {title}', *lines, '']

for k, p in enumerate(papers, start=1):
    title = re.sub(r'^ĐỀ\s*\d+\s*[–-]\s*', '', p['title']).strip()
    tags = term_tag(p['title'])
    head = block_lines(p['header'], D)
    tagline = ''.join(f'[{t}]' for t in dict.fromkeys(tags))
    body = []
    if tagline:
        body.append(tagline)
    body += head
    if p['en']:
        body += ['', '**Đề gốc (English)**', '', *block_lines(p['en'], D)]
    if p['vi']:
        body += ['', '**Dịch đề (Tiếng Việt)**', '', *block_lines(p['vi'], D)]
    out += [f'## Đề {k}: {title}', *body, '']
    for n, q in enumerate(p['questions']):
        qid = Q0 + (k - 1) * 10 + n
        qt = re.sub(r'\s*—\s*', ' — ', q['title'])
        lines = [f'**{qt}**', '']
        lines += ['**Đề gốc (English)**', '', *block_lines(q['en'], D)]
        if q['vi']:
            lines += ['', '**Dịch đề (Tiếng Việt)**', '', *block_lines(q['vi'], D)]
        out += [f'## Câu {qid}', *lines]
        frame = block_lines(q['frame'], D) if q['frame'] else []
        data = block_lines(q['data'], D) if q['data'] else []
        if frame or data:
            out.append('Khung:')
            if frame:
                out += ['**Cấu trúc thực hiện**', '', *frame]
            if data:
                out += ['', '**Dữ liệu lấy từ đề** (đoạn cần "kéo xuống" điền vào khung)', '', *data]
        kc = kind_of(q['title'])
        if kc and kc in tipno:
            out.append(f'Mẹo: {tipno[kc]}')
        out.append('')

text = '\n'.join(out).rstrip() + '\n'
# Notes about the reference answers go with the answers.
text = text.replace(' Đáp án dưới đây dùng dự án mẫu "FCanteen" (app đặt món căng tin). Có thể thay bằng bất kỳ dự án nào khác, giữ nguyên khung.', ' Có thể chọn bất kỳ dự án nào, giữ nguyên khung.')
text = re.sub(r'\n[^\n]*đáp án được bổ sung đầy đủ\.?\n', '\n', text)
sys.stdout.write(text)
