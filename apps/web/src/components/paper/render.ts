/**
 * Draws a document page as HTML: an exam paper, a lecture-note page, a slide,
 * a spreadsheet, a handwritten notebook page, a report cover, a book cover or
 * a table of contents. Ported from the approved prototype, markup unchanged,
 * so kaned.css styles it exactly as designed.
 *
 * This is the fallback preview for documents that have no rendered page from
 * Cloudinary yet. Every string that came from a user (title, uploader name)
 * goes through esc().
 */
import type { DocumentType, FileFormat, Semester } from '@kaned/shared';
import { profileFor, TAB_COLORS, type FigureKind, type PaperProfile } from './profiles';

export interface PaperDoc {
  id: string;
  title: string;
  type: DocumentType;
  format: FileFormat;
  semester: Semester;
  schoolYear: string | null;
  pages: number | null;
  createdAt: string;
  subject: { code: string; nameVi: string };
  university: { code: string; name: string; nameVi?: string | null };
  uploaderName: string;
}

/** The profile of the subject's discipline, carrying the real code and name. */
type Subject = PaperProfile & { vi: string };

/* ───────────────────────────── helpers ───────────────────────────── */

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LECTURERS = [
  'ThS. Nguyễn Văn Hùng', 'TS. Lê Thị Thu Hà', 'PGS.TS. Trần Minh Quang',
  'ThS. Phạm Thanh Tùng', 'TS. Đỗ Quốc Việt', 'ThS. Võ Thị Hồng Nhung',
];

const UNI_VI: Record<string, string> = {
  FPTU: 'Trường Đại học FPT',
  HCMUT: 'Trường Đại học Bách khoa',
  CTU: 'Trường Đại học Cần Thơ',
  UEH: 'Đại học Kinh tế TP. Hồ Chí Minh',
  UIT: 'Trường Đại học Công nghệ Thông tin',
  HCMUS: 'Trường Đại học Khoa học Tự nhiên',
  HUST: 'Đại học Bách khoa Hà Nội',
  PTIT: 'Học viện Công nghệ Bưu chính Viễn thông',
};
const VI_CITY: Record<string, string> = {
  FPTU: 'Hà Nội', HCMUT: 'TP. Hồ Chí Minh', CTU: 'Cần Thơ', UEH: 'TP. Hồ Chí Minh',
  UIT: 'TP. Hồ Chí Minh', HCMUS: 'TP. Hồ Chí Minh', HUST: 'Hà Nội', PTIT: 'Hà Nội',
};
const STUDENT_ID: Record<string, string> = {
  FPTU: 'SE170423', HCMUT: '2112456', CTU: 'B2012345', UEH: '31231020567',
  UIT: '21520311', HCMUS: '21127094', HUST: '20210873', PTIT: 'B21DCCN512',
};
const VNU_HCM = ['HCMUT', 'UIT', 'HCMUS'];

const FACULTY_BY_PROFILE: Record<string, string> = {
  micro: 'Kinh tế', acc: 'Kế toán', dm: 'Khoa học Cơ bản', theory: 'Lý luận Chính trị',
};

const uniVi = (doc: PaperDoc) => esc(UNI_VI[doc.university.code] ?? doc.university.nameVi ?? doc.university.name);
const city = (doc: PaperDoc) => VI_CITY[doc.university.code] ?? 'Việt Nam';
const facultyOf = (s: Subject) => FACULTY_BY_PROFILE[s.id] ?? 'Công nghệ Thông tin';
const docChapter = (doc: PaperDoc) => {
  const m = doc.title.match(/Chương (\d+)/);
  return m ? +m[1] : (hashStr(doc.id) % 5) + 1;
};
const cleanTitle = (doc: PaperDoc) => {
  const parts = doc.title.split(/ – |: /);
  return esc(parts.length > 1 ? parts.slice(1).join(' – ') : doc.title);
};
const semVi = (sem: Semester) => (sem === 'SUMMER' ? 'Học kỳ hè' : sem === 'S2' ? 'Học kỳ 2' : 'Học kỳ 1');
const schoolYear = (doc: PaperDoc) => esc(doc.schoolYear ?? '2025–2026');

function subjectFor(doc: PaperDoc): Subject {
  const profile = profileFor(doc.subject.code);
  return { ...profile, code: esc(doc.subject.code), vi: esc(doc.subject.nameVi) };
}

/* ───────────────────────────── figures ───────────────────────────── */

const FIG_CAPTION: Record<string, string> = {
  tree: 'Cây BST sau khi chèn dãy khóa 50, 30, 70, 20, 40, 60, 80, 35', table: 'Dữ liệu minh họa', flow: 'Quy trình Scrum',
  browser: 'Bố cục trang với các thẻ HTML ngữ nghĩa', uml: 'Sơ đồ lớp minh họa', layers: 'Mô hình OSI và TCP/IP',
  truth: 'Bảng chân trị của phép kéo theo', gantt: 'Biểu đồ Gantt – Round Robin (q = 4)',
  graph: 'Đồ thị trạng thái và giá trị heuristic', curve: 'Cân bằng thị trường',
};

const T = (x: number, y: number, t: string | number, a = 'middle', sz = 13, w = 400) =>
  `<text x="${x}" y="${y}" text-anchor="${a}" font-size="${sz}" font-weight="${w}" fill="currentColor" stroke="none">${t}</text>`;

export function figure(kind: FigureKind | null, s: Subject, n = 1, opts: { rows?: number } = {}): string {
  let svg = '';
  if (kind === 'tree') {
    const N = [[200, 22, 50], [110, 72, 30], [290, 72, 70], [60, 124, 20], [160, 124, 40], [240, 124, 60], [340, 124, 80], [135, 174, 35]];
    const E = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6], [4, 7]];
    svg = `<svg viewBox="0 0 400 196">${E.map(([a, b]) => `<line x1="${N[a][0]}" y1="${N[a][1]}" x2="${N[b][0]}" y2="${N[b][1]}"/>`).join('')}${N.map(([x, y, v]) => `<circle cx="${x}" cy="${y}" r="16" fill="#fff"/>${T(x, y + 4.5, v)}`).join('')}</svg>`;
  } else if (kind === 'graph') {
    const N: Record<string, [number, number, number]> = { S: [40, 90, 7], A: [150, 30, 6], B: [150, 150, 4], C: [270, 60, 2], D: [270, 160, 3], G: [370, 100, 0] };
    const E: Array<[string, string, number]> = [['S', 'A', 2], ['S', 'B', 3], ['A', 'C', 4], ['B', 'C', 5], ['B', 'D', 2], ['C', 'G', 3], ['D', 'G', 4]];
    svg = `<svg viewBox="0 0 410 196">${E.map(([a, b, w]) => { const [x1, y1] = N[a]; const [x2, y2] = N[b]; return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${T((x1 + x2) / 2 + 6, (y1 + y2) / 2 - 5, w, 'start', 12)}`; }).join('')}${Object.entries(N).map(([k, [x, y, h]]) => `<circle cx="${x}" cy="${y}" r="17" fill="#fff"/>${T(x, y + 4.5, k, 'middle', 13, 700)}${T(x, y + 34, 'h=' + h, 'middle', 11)}`).join('')}</svg>`;
  } else if (kind === 'flow') {
    const B = ['Product Backlog', 'Sprint Planning', 'Sprint Backlog', 'Sprint', 'Increment'];
    svg = `<svg viewBox="0 0 470 130"><defs><marker id="ar${n}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>${B.map((b, i) => `<rect x="${4 + i * 94}" y="44" width="80" height="40" rx="5" fill="#fff"/>${b.split(' ').map((w, j, a) => T(44 + i * 94, 68 - (a.length - 1) * 7 + j * 14, w, 'middle', 11)).join('')}${i < 4 ? `<line x1="${86 + i * 94}" y1="64" x2="${96 + i * 94}" y2="64" marker-end="url(#ar${n})"/>` : ''}`).join('')}<path d="M 312 44 C 312 6, 368 6, 368 44" fill="none" marker-end="url(#ar${n})"/>${T(340, 14, 'Daily Scrum', 'middle', 11)}${T(235, 116, 'Sprint Review  ·  Retrospective', 'middle', 11)}</svg>`;
  } else if (kind === 'browser') {
    svg = `<svg viewBox="0 0 400 210"><rect x="2" y="2" width="396" height="206" rx="6" fill="#fff"/><line x1="2" y1="22" x2="398" y2="22"/><circle cx="14" cy="12" r="3"/><circle cx="25" cy="12" r="3"/><circle cx="36" cy="12" r="3"/><rect x="14" y="32" width="372" height="26" rx="3" fill="none"/>${T(200, 49, '&lt;header&gt;  +  &lt;nav&gt;', 'middle', 12)}<rect x="14" y="66" width="262" height="100" rx="3" fill="none"/>${T(145, 82, '&lt;main&gt;', 'middle', 12)}${[0, 1, 2].map((i) => `<rect x="${24 + i * 84}" y="92" width="74" height="64" rx="3" fill="none"/>${T(61 + i * 84, 128, '&lt;article&gt;', 'middle', 10)}`).join('')}<rect x="284" y="66" width="102" height="100" rx="3" fill="none"/>${T(335, 120, '&lt;aside&gt;', 'middle', 12)}<rect x="14" y="174" width="372" height="24" rx="3" fill="none"/>${T(200, 190, '&lt;footer&gt;', 'middle', 12)}</svg>`;
  } else if (kind === 'uml') {
    const box = (x: number, y: number, w: number, name: string, attrs: string[], ops: string[]) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${22 + attrs.length * 15 + 8 + ops.length * 15 + 6}" fill="#fff"/>${T(x + w / 2, y + 16, name, 'middle', 12, 700)}<line x1="${x}" y1="${y + 22}" x2="${x + w}" y2="${y + 22}"/>${attrs.map((a, i) => T(x + 7, y + 37 + i * 15, a, 'start', 10.5)).join('')}<line x1="${x}" y1="${y + 28 + attrs.length * 15}" x2="${x + w}" y2="${y + 28 + attrs.length * 15}"/>${ops.map((o, i) => T(x + 7, y + 43 + attrs.length * 15 + i * 15, o, 'start', 10.5)).join('')}`;
    if (s.id === 'sad') {
      svg = `<svg viewBox="0 0 420 170">${box(4, 30, 120, 'KhachHang', ['- maKH: String', '- hoTen: String', '- sdt: String'], ['+ datPhong()'])}${box(150, 30, 120, 'PhieuDatPhong', ['- maPhieu: String', '- ngayDen: Date', '- ngayDi: Date'], ['+ tinhTien()'])}${box(296, 30, 120, 'Phong', ['- soPhong: int', '- loai: String', '- gia: double'], ['+ kiemTraTrong()'])}<line x1="124" y1="70" x2="150" y2="70"/><line x1="270" y1="70" x2="296" y2="70"/>${T(128, 64, '1', 'start', 10)}${T(146, 64, '*', 'end', 10)}${T(274, 64, '*', 'start', 10)}${T(292, 64, '1..*', 'end', 10)}</svg>`;
    } else {
      svg = `<svg viewBox="0 0 400 200">${box(140, 4, 120, '«abstract» Shape', ['# name: String'], ['+ area(): double'])}${box(20, 120, 130, 'Circle', ['- r: double'], ['+ area(): double'])}${box(250, 120, 130, 'Rectangle', ['- w, h: double'], ['+ area(): double'])}<polygon points="200,82 193,95 207,95" fill="#fff"/><line x1="200" y1="95" x2="200" y2="106"/><line x1="85" y1="106" x2="315" y2="106"/><line x1="85" y1="106" x2="85" y2="120"/><line x1="315" y1="106" x2="315" y2="120"/></svg>`;
    }
  } else if (kind === 'layers') {
    const L = ['Ứng dụng', 'Trình diễn', 'Phiên', 'Giao vận', 'Mạng', 'Liên kết dữ liệu', 'Vật lý'];
    const M: Array<[number, number, string]> = [[0, 3, 'Application'], [3, 4, 'Transport'], [4, 5, 'Internet'], [5, 7, 'Network Access']];
    svg = `<svg viewBox="0 0 400 214">${L.map((l, i) => `<rect x="20" y="${4 + i * 29}" width="200" height="25" rx="3" fill="#fff"/>${T(32, 21 + i * 29, 7 - i + '. ' + l, 'start', 12)}`).join('')}${M.map(([a, b, l]) => `<rect x="250" y="${4 + a * 29}" width="140" height="${(b - a) * 29 - 4}" rx="3" fill="#fff"/>${T(320, 4 + a * 29 + ((b - a) * 29 - 4) / 2 + 4, l, 'middle', 12)}`).join('')}${T(120, 212, 'OSI', 'middle', 11, 700)}${T(320, 212, 'TCP/IP', 'middle', 11, 700)}</svg>`;
  } else if (kind === 'gantt') {
    const seg: Array<[string, number, number]> = [['P1', 0, 4], ['P2', 4, 8], ['P3', 8, 11], ['P1', 11, 15], ['P4', 15, 19], ['P2', 19, 22], ['P1', 22, 24]];
    const k = 15.5;
    svg = `<svg viewBox="0 0 400 80">${seg.map(([p, a, b]) => `<rect x="${12 + a * k}" y="10" width="${(b - a) * k}" height="32" fill="#fff"/>${T(12 + ((a + b) / 2) * k, 31, p, 'middle', 12, 600)}`).join('')}${[0, 4, 8, 11, 15, 19, 22, 24].map((t) => T(12 + t * k, 60, t, 'middle', 11)).join('')}</svg>`;
  } else if (kind === 'curve') {
    svg = `<svg viewBox="0 0 400 220"><line x1="60" y1="10" x2="60" y2="190"/><line x1="60" y1="190" x2="380" y2="190"/>${T(48, 18, 'P', 'end', 13, 700)}${T(380, 210, 'Q', 'end', 13, 700)}<line x1="90" y1="30" x2="340" y2="175" stroke-width="2"/><line x1="90" y1="175" x2="340" y2="30" stroke-width="2"/>${T(346, 180, 'D', 'start', 13, 700)}${T(346, 30, 'S', 'start', 13, 700)}<line x1="60" y1="102.5" x2="215" y2="102.5" stroke-dasharray="4 4"/><line x1="215" y1="102.5" x2="215" y2="190" stroke-dasharray="4 4"/><circle cx="215" cy="102.5" r="4" fill="currentColor"/>${T(225, 98, 'E', 'start', 13, 700)}${T(52, 107, 'P*', 'end', 12)}${T(215, 206, 'Q*', 'middle', 12)}</svg>`;
  } else if (kind === 'truth') {
    return `<figure class="pg-fig"><table class="pg-table pg-table-c"><thead><tr><th>p</th><th>q</th><th>¬p</th><th>p → q</th><th>¬p ∨ q</th></tr></thead><tbody>${[[1, 1], [1, 0], [0, 1], [0, 0]].map(([p, q]) => `<tr><td>${p}</td><td>${q}</td><td>${1 - p}</td><td>${p && !q ? 0 : 1}</td><td>${1 - p || q ? 1 : 0}</td></tr>`).join('')}</tbody></table><figcaption>Bảng ${n}. ${FIG_CAPTION.truth}</figcaption></figure>`;
  } else if (kind === 'table') {
    const t =
      s.table ??
      (s.id === 'test'
        ? { head: ['Mã TC', 'Dữ liệu vào', 'Kết quả mong đợi'], rows: [['TC01', 'Tuổi = 17', 'Báo lỗi “Tuổi không hợp lệ”'], ['TC02', 'Tuổi = 18', 'Chấp nhận'], ['TC03', 'Tuổi = 60', 'Chấp nhận'], ['TC04', 'Tuổi = 61', 'Báo lỗi “Tuổi không hợp lệ”']] }
        : { head: ['MaSV', 'HoTen', 'Lop', 'DiemTB'], rows: [['SV001', 'Nguyễn Văn An', 'SE1801', '8.2'], ['SV002', 'Trần Thị Bình', 'SE1801', '7.6'], ['SV003', 'Lê Hoàng Cường', 'SE1802', '9.1'], ['SV004', 'Phạm Mỹ Duyên', 'SE1803', '6.8']] });
    return `<figure class="pg-fig"><table class="pg-table"><thead><tr>${t.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, opts.rows ?? 5).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table><figcaption>Bảng ${n}. ${s.id === 'db' ? 'Quan hệ SinhVien (trích)' : FIG_CAPTION.table}</figcaption></figure>`;
  } else {
    return '';
  }
  return `<figure class="pg-fig">${svg}<figcaption>Hình ${n}. ${FIG_CAPTION[kind] ?? ''}</figcaption></figure>`;
}

function codeBlock(s: Subject, max = 12): string {
  if (!s.snippet) return '';
  return `<pre class="pg-code"><span class="pg-code-lang">${s.snippet.lang}</span>${s.snippet.lines.slice(0, max).map(esc).join('\n')}</pre>`;
}

function exhibit(s: Subject, n: number, i: number): string {
  const opts = [s.fig ? 'fig' : null, s.snippet ? 'code' : null, s.table && s.fig !== 'table' ? 'table' : null].filter(Boolean);
  if (!opts.length) return '';
  const pick = opts[i % opts.length];
  if (pick === 'code') return codeBlock(s);
  if (pick === 'table') return figure('table', s, n);
  return figure(s.fig, s, n);
}

/* ───────────────────────────── pages ───────────────────────────── */

const runHead = (doc: PaperDoc, s: Subject) =>
  `<div class="pg-run"><span>${s.code} – ${s.vi}</span><span>${esc(doc.university.code)}</span></div>`;
const pgFoot = (i: number) => `<div class="pg-foot">${i + 1}</div>`;
const pgWrap = (kind: string, inner: string, i: number, extra = '') =>
  `<div class="pg pg-${kind}" data-pg="${i + 1}"${extra}><div class="pg-c">${inner}</div></div>`;

function textPage(doc: PaperDoc, s: Subject, i: number): string {
  const ch = docChapter(doc);
  const t = s.topics;
  const topic = t[(ch - 1 + Math.max(0, i - 1)) % t.length];
  const type = doc.type;
  let head: string;
  if (i === 0) {
    if (type === 'EXERCISES') head = `<h1 class="pg-h1">BÀI TẬP THỰC HÀNH<br><small>${s.vi} – ${s.code}</small></h1>`;
    else if (type === 'REVIEW') head = `<h1 class="pg-h1">ĐỀ CƯƠNG ÔN TẬP<br><small>${s.vi} – ${s.code}</small></h1>`;
    else head = `<h1 class="pg-h1">CHƯƠNG ${ch}<br><small>${topic.toUpperCase()}</small></h1>`;
  } else {
    const num = ['REPORT', 'ASSIGNMENT'].includes(type) ? i : ch;
    head = `<h2 class="pg-h2">${['REPORT', 'ASSIGNMENT', 'BOOK'].includes(type) ? `Chương ${num - (type === 'BOOK' ? 1 : 0) || 1}. ` : `${num}.${i + 1}. `}${topic}</h2>`;
  }
  const pts = s.points;
  let body: string;
  if (type === 'EXERCISES') {
    body =
      `<p class="pg-p">${s.para[0]}</p>` +
      s.questions.slice(i % 2, (i % 2) + 3).map((q, k) => `<p class="pg-q"><b>Bài ${k + 1 + i * 3}.</b> ${q}</p>`).join('') +
      (i === 0 ? exhibit(s, 1, 0) : '');
  } else if (type === 'REVIEW') {
    body = `<h3 class="pg-h3">I. Kiến thức trọng tâm</h3><ul class="pg-ul">${pts.slice(0, 4).map((p) => `<li>${p}</li>`).join('')}</ul><h3 class="pg-h3">II. Câu hỏi ôn tập</h3>${s.questions.slice(0, 3).map((q, k) => `<p class="pg-q"><b>Câu ${k + 1}.</b> ${q}</p>`).join('')}`;
  } else {
    const rot = i % 3;
    body =
      `<p class="pg-p">${s.para[rot % 2]}</p>` +
      (rot === 1 ? `<ul class="pg-ul">${pts.slice(0, 3).map((p) => `<li>${p}</li>`).join('')}</ul>` : '') +
      exhibit(s, i + 1, i) +
      `<p class="pg-p">${s.para[(rot + 1) % 2]}</p>` +
      (rot !== 1 ? `<h3 class="pg-h3">Ghi nhớ</h3><ul class="pg-ul">${pts.slice(3, 6).map((p) => `<li>${p}</li>`).join('')}</ul>` : '');
  }
  return runHead(doc, s) + head + body + pgFoot(i);
}

function examPage(doc: PaperDoc, s: Subject, i: number): string {
  const mid = /giữa kỳ/i.test(doc.title);
  const q = s.questions;
  const pts = q.length === 4 ? ['2,5', '2,5', '2,5', '2,5'] : ['3,0', '3,5', '3,5'];
  const pages = doc.pages ?? 3;
  if (i === 0) {
    return (
      `<table class="ex-head"><tr><td>${uniVi(doc).toUpperCase()}<br><b>KHOA ${facultyOf(s).toUpperCase()}</b><span class="ex-rule"></span></td>
      <td><b>ĐỀ THI ${mid ? 'GIỮA KỲ' : 'CUỐI KỲ'}</b><br>${semVi(doc.semester)} – Năm học ${schoolYear(doc)}<br>Môn: ${s.vi}<br>Mã môn học: ${s.code}<br>Thời gian làm bài: ${mid ? 60 : 90} phút</td></tr></table>
      <p class="ex-note">(Sinh viên không được sử dụng tài liệu. Đề thi gồm 0${Math.min(pages, 3)} trang.)</p>
      <p class="pg-q"><b>Câu 1</b> (${pts[0]} điểm). ${q[0]}</p>
      <p class="pg-q"><b>Câu 2</b> (${pts[1]} điểm). ${q[1]}</p>
      ${s.fig && ['tree', 'graph', 'gantt', 'curve', 'uml', 'layers', 'truth'].includes(s.fig) ? figure(s.fig, s, 1) : ''}` + pgFoot(i)
    );
  }
  if (i === 1) {
    return (
      `${q.slice(2).map((x, k) => `<p class="pg-q"><b>Câu ${k + 3}</b> (${pts[k + 2]} điểm). ${x}</p>`).join('')}
      <p class="ex-end">— HẾT —</p><p class="ex-note">Cán bộ coi thi không giải thích gì thêm.</p>
      <table class="ex-sign"><tr><td><b>Duyệt đề</b><br><i>(Ký, ghi rõ họ tên)</i></td><td><b>Giảng viên ra đề</b><br><i>(Ký, ghi rõ họ tên)</i><br><br><br>${LECTURERS[hashStr(doc.id) % LECTURERS.length]}</td></tr></table>` + pgFoot(i)
    );
  }
  return (
    `<h2 class="pg-h2 center">ĐÁP ÁN THAM KHẢO</h2>
    <p class="pg-q"><b>Câu ${i - 1}.</b> ${s.para[i % 2]}</p>
    <ul class="pg-ul">${s.points.slice(0, 4).map((p) => `<li>${p}</li>`).join('')}</ul>
    ${exhibit(s, i, i + 1)}` + pgFoot(i)
  );
}

function coverPage(doc: PaperDoc, s: Subject): string {
  const kind =
    doc.type === 'ASSIGNMENT'
      ? doc.title.startsWith('Assignment') ? 'ASSIGNMENT' : 'BÀI TẬP LỚN'
      : /thực tập|OJT/.test(doc.title) ? 'BÁO CÁO THỰC TẬP'
      : /SRS|Đặc tả/.test(doc.title) ? 'TÀI LIỆU ĐẶC TẢ YÊU CẦU' : 'BÁO CÁO ĐỒ ÁN';
  const d = new Date(doc.createdAt);
  return `<div class="cv">
    <div class="cv-top">${VNU_HCM.includes(doc.university.code) ? 'ĐẠI HỌC QUỐC GIA TP. HỒ CHÍ MINH' : 'BỘ GIÁO DỤC VÀ ĐÀO TẠO'}<br><b>${uniVi(doc).toUpperCase()}</b><br>KHOA ${facultyOf(s).toUpperCase()}</div>
    <div class="cv-logo"><span>${esc(doc.university.code)}</span></div>
    <p class="cv-kind">${kind}</p>
    <p class="cv-subj">Học phần: ${s.vi} (${s.code})</p>
    <h1 class="cv-title">${cleanTitle(doc).toUpperCase()}</h1>
    <table class="cv-meta">
      <tr><td>Giảng viên hướng dẫn:</td><td>${LECTURERS[hashStr(doc.id) % LECTURERS.length]}</td></tr>
      <tr><td>Sinh viên thực hiện:</td><td>${esc(doc.uploaderName)}</td></tr>
      <tr><td>Mã số sinh viên:</td><td>${STUDENT_ID[doc.university.code] ?? 'SV2025001'}</td></tr>
      <tr><td>Năm học:</td><td>${schoolYear(doc)}</td></tr>
    </table>
    <p class="cv-foot">${city(doc)}, tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}</p></div>`;
}

const BOOK_MARK = `<svg class="ic" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;

function bookCover(doc: PaperDoc, s: Subject): string {
  return `<div class="bk"><p class="bk-uni">${uniVi(doc).toUpperCase()}</p><div class="bk-rule"></div>
    <h1 class="bk-title">${cleanTitle(doc).replace(/\(.*\)/, '')}</h1><p class="bk-sub">${s.vi}</p>
    <div class="bk-mark">${BOOK_MARK}</div>
    <p class="bk-author">${LECTURERS[(hashStr(doc.id) + 2) % LECTURERS.length]} (chủ biên)</p>
    <p class="bk-foot">Lưu hành nội bộ<br>${city(doc)} – ${new Date(doc.createdAt).getFullYear()}</p></div>`;
}

function tocPage(doc: PaperDoc, s: Subject): string {
  let p = 3;
  const rows = s.topics.slice(0, 8).map((t, k) => {
    const r = `<li><span>${doc.type === 'REVIEW' ? 'Phần' : 'Chương'} ${k + 1}. ${t}</span><i></i><b>${p}</b></li>`;
    p += 3 + (hashStr(t) % (doc.type === 'BOOK' ? 26 : 6));
    return r;
  });
  return (
    runHead(doc, s) +
    `<h2 class="pg-h2 center">MỤC LỤC</h2><ol class="pg-toc"><li><span>Lời nói đầu</span><i></i><b>1</b></li>${rows.join('')}<li><span>Tài liệu tham khảo</span><i></i><b>${p}</b></li></ol>` +
    pgFoot(1)
  );
}

function slidePage(doc: PaperDoc, s: Subject, i: number): string {
  const ch = docChapter(doc);
  if (i === 0) {
    return `<div class="sl-band"></div><div class="sl-top"><span class="sl-uni">${esc(doc.university.code)}</span><span>${s.code}</span></div>
      <div class="sl-main"><p class="sl-kick">${s.vi}</p><h1 class="sl-h1">${cleanTitle(doc)}</h1>
      <p class="sl-by">${LECTURERS[hashStr(doc.id) % LECTURERS.length]}<br>${semVi(doc.semester)}, ${schoolYear(doc)}</p></div>`;
  }
  if (i === 1) {
    return `<h2 class="sl-h2">Nội dung</h2><ol class="sl-agenda">${s.topics.slice(Math.max(0, ch - 2), Math.max(0, ch - 2) + 5).map((t) => `<li>${t}</li>`).join('')}</ol><div class="sl-foot"><span>${s.code}</span><span>${i + 1}</span></div>`;
  }
  const t = s.topics[(ch - 1 + i - 2) % s.topics.length];
  const pts = [0, 1, 2].map((k) => s.points[(i + k) % s.points.length]);
  const side = i % 2 === 0 && s.snippet ? codeBlock(s, 8) : figure(s.fig === 'table' && !s.table ? 'table' : s.fig, s, i - 1, { rows: 4 });
  return `<h2 class="sl-h2">${t}</h2><div class="sl-cols"><ul class="sl-ul">${pts.map((p) => `<li>${p}</li>`).join('')}</ul><div class="sl-fig">${side}</div></div><div class="sl-foot"><span>${s.code}</span><span>${i + 1}</span></div>`;
}

function sheetPage(_doc: PaperDoc, s: Subject, i: number): string {
  const isTest = s.id === 'test';
  const sheets = isTest ? ['Test Plan', 'Test Cases', 'Bug Report', 'Thống kê'] : ['Nhật ký chung', 'Sổ cái', 'Cân đối phát sinh', 'Bảng CĐKT'];
  const active = i === 0 ? 1 : 2;
  const head = isTest
    ? ['ID', 'Chức năng', 'Bước thực hiện', 'Kết quả mong đợi', 'Ưu tiên', 'Trạng thái']
    : ['Ngày', 'Số CT', 'Diễn giải', 'TK Nợ', 'TK Có', 'Số tiền'];
  const rows = isTest
    ? [['TC-01', 'Thêm vào giỏ', 'Chọn SP, bấm “Thêm”', 'Giỏ hiển thị 1 SP', 'Cao', 'Pass'], ['TC-02', 'Thêm vào giỏ', 'Thêm SP đã hết hàng', 'Báo “Hết hàng”', 'Cao', 'Pass'], ['TC-03', 'Cập nhật SL', 'Nhập SL = 0', 'Xóa SP khỏi giỏ', 'TB', 'Fail'], ['TC-04', 'Cập nhật SL', 'Nhập SL = 101', 'Báo vượt giới hạn', 'TB', 'Pass'], ['TC-05', 'Mã giảm giá', 'Nhập mã hết hạn', 'Báo mã không hợp lệ', 'Cao', 'Pass'], ['TC-06', 'Thanh toán', 'Thẻ hết hạn', 'Từ chối, giữ giỏ', 'Cao', 'Blocked'], ['TC-07', 'Thanh toán', 'Ví điện tử hợp lệ', 'Tạo đơn hàng', 'Cao', 'Pass'], ['TC-08', 'Lịch sử', 'Mở “Đơn của tôi”', 'Hiện đơn vừa tạo', 'TB', 'Fail'], ['TC-09', 'Giỏ hàng', 'Đăng xuất rồi đăng nhập', 'Giỏ được giữ nguyên', 'Thấp', 'Pass'], ['TC-10', 'Phí ship', 'Đơn ≥ 300.000đ', 'Miễn phí vận chuyển', 'TB', 'Pass']]
    : [['01/10', 'PN01', 'Mua NVL chưa trả tiền', '152', '331', '50.000.000'], ['02/10', 'PT01', 'Rút TGNH nhập quỹ', '111', '112', '20.000.000'], ['05/10', 'PX01', 'Xuất NVL sản xuất SP', '621', '152', '35.000.000'], ['08/10', 'PC01', 'Trả lương nhân viên', '334', '111', '18.500.000'], ['10/10', 'HĐ01', 'Bán hàng thu TGNH', '112', '511', '86.000.000'], ['10/10', 'HĐ01', 'Thuế GTGT đầu ra', '112', '3331', '8.600.000'], ['12/10', 'PC02', 'Chi tiền điện văn phòng', '642', '111', '3.200.000'], ['15/10', 'UNC1', 'Trả nợ người bán', '331', '112', '30.000.000'], ['20/10', 'PX02', 'Giá vốn hàng bán', '632', '155', '52.400.000'], ['31/10', 'KC01', 'Kết chuyển doanh thu', '511', '911', '86.000.000']];
  const tone = (v: string) => (v === 'Pass' ? ' class="ok"' : v === 'Fail' ? ' class="bad"' : v === 'Blocked' ? ' class="warn"' : '');
  return `<div class="sh-bar"><span class="sh-ref">A1</span><span class="sh-fx">fx</span><span class="sh-val">${head[0]}</span></div>
    <table class="sh-grid"><thead><tr><th></th>${'ABCDEF'.split('').map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody><tr class="sh-h"><td>1</td>${head.map((h) => `<td>${h}</td>`).join('')}</tr>
    ${rows.map((r, k) => `<tr><td>${k + 2}</td>${r.map((c) => `<td${tone(c)}>${c}</td>`).join('')}</tr>`).join('')}
    ${Array.from({ length: 12 }, (_, k) => `<tr><td>${k + 12}</td>${'<td></td>'.repeat(6)}</tr>`).join('')}</tbody></table>
    <div class="sh-tabs">${sheets.map((n, k) => `<span${k === active ? ' class="on"' : ''}>${n}</span>`).join('')}</div>`;
}

function handPage(doc: PaperDoc, s: Subject, i: number): string {
  const ch = docChapter(doc);
  const t = s.topics[(ch - 1 + i) % s.topics.length];
  const day = 8 + (hashStr(doc.id + i) % 20);
  const pts = s.points.slice(i % 3, (i % 3) + 3);
  const fig = s.fig ? figure(s.fig === 'table' ? 'truth' : s.fig, s, i + 1).replace('<figcaption>', '<figcaption class="hd-cap">') : '';
  return `<div class="hd-margin"></div><p class="hd-date">Thứ ${['Hai', 'Ba', 'Tư', 'Năm', 'Sáu'][i % 5]}, ngày ${day}/10/2025</p>
    <h1 class="hd-h1">Bài ${ch + i}: ${t}</h1>
    <ul class="hd-ul">${pts.map((p) => `<li>${p}</li>`).join('')}</ul>
    <div class="hd-fig">${fig}</div>
    <div class="hd-box"><b>Ghi nhớ:</b> ${s.points[(i + 4) % s.points.length]}</div>
    <p class="hd-p">VD: ${s.questions[i % s.questions.length].split('.')[0]}.</p>`;
}

/** Notes are drawn handwritten for some documents, so the library has variety. */
const isHandwritten = (doc: PaperDoc) => doc.type === 'NOTES' && hashStr(doc.id) % 2 === 0;

/** The HTML of page `i` (0-based) of a document. */
export function renderPage(doc: PaperDoc, i: number): string {
  const s = subjectFor(doc);
  const tone = TAB_COLORS[s.tab].c;
  if (doc.format === 'PPTX') return pgWrap('slide', slidePage(doc, s, i), i, ` style="--tc:${tone}"`);
  if (doc.format === 'XLSX') return pgWrap('sheet', sheetPage(doc, s, i), i);
  if (isHandwritten(doc)) return pgWrap('hand', handPage(doc, s, i), i);
  if (doc.type === 'EXAM') return pgWrap('a4', examPage(doc, s, i), i);
  if ((doc.type === 'REPORT' || doc.type === 'ASSIGNMENT') && i === 0) return pgWrap('a4', coverPage(doc, s), i);
  if (doc.type === 'BOOK' && i === 0) return pgWrap('a4 pg-book', bookCover(doc, s), i, ` style="--tc:${tone}"`);
  if (['BOOK', 'REPORT', 'REVIEW'].includes(doc.type) && i === 1) return pgWrap('a4', tocPage(doc, s), i);
  return pgWrap('a4', textPage(doc, s, i), i);
}

/** What kind of frame the thumbnail uses. */
export function thumbKind(format: FileFormat): 'slide' | 'sheet' | 'doc' {
  return format === 'PPTX' ? 'slide' : format === 'XLSX' ? 'sheet' : 'doc';
}
