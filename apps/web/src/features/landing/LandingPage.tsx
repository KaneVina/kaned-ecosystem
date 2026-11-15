import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Download, Flame, Search, Star } from 'lucide-react';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, SEMESTERS, SEMESTER_LABELS, STUDY_YEARS } from '@kaned/shared';
import { Wordmark } from '@/components/ui/Wordmark';
import { Avatar } from '@/components/ui/Avatar';
import { FileIcon } from '@/components/ui/FileBadge';
import { Stars, StarDefs } from '@/components/ui/Stars';
import { SectionHead } from '@/components/ui/Panel';
import { DocPage } from '@/components/paper/Paper';
import type { PaperDoc } from '@/components/paper/render';
import { TOOLS } from '@/components/layout/AppShell';
import { useDocuments } from '@/features/library/queries';
import { useSubjects, useUniversities } from '@/features/catalog/queries';
import { useAuth } from '@/providers/AuthProvider';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Three pages for the hero art, drawn by the same renderer as the library. */
const HERO: PaperDoc[] = [
  {
    id: 'hero-exam', title: 'Đề thi cuối kỳ Cấu trúc dữ liệu và giải thuật', type: 'EXAM', format: 'PDF', semester: 'S1',
    schoolYear: '2025–2026', pages: 3, createdAt: '2026-10-12T00:00:00Z',
    subject: { code: 'CSD201', nameVi: 'Cấu trúc dữ liệu và giải thuật' }, university: { code: 'FPTU', name: 'FPT University' }, uploaderName: 'Trần Gia Huy',
  },
  {
    id: 'hero-notes', title: 'Chương 4: Tìm kiếm có heuristic', type: 'NOTES', format: 'PDF', semester: 'S2',
    schoolYear: '2025–2026', pages: 12, createdAt: '2026-10-02T00:00:00Z',
    subject: { code: 'DBI202', nameVi: 'Các hệ cơ sở dữ liệu' }, university: { code: 'HCMUT', name: 'Ho Chi Minh City University of Technology' }, uploaderName: 'Lê Thảo Vy',
  },
  {
    id: 'hero-slide', title: 'Slide PRO192 – Chương 3: Kế thừa và đa hình', type: 'SLIDES', format: 'PPTX', semester: 'S2',
    schoolYear: '2025–2026', pages: 40, createdAt: '2026-09-20T00:00:00Z',
    subject: { code: 'PRO192', nameVi: 'Lập trình hướng đối tượng' }, university: { code: 'UIT', name: 'University of Information Technology' }, uploaderName: 'Nguyễn Minh Anh',
  },
];

const POPULAR = ['Đề thi cuối kỳ CSD201', 'SQL JOIN', 'Chia subnet', 'Cây AVL'];

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [uni, setUni] = useState('');
  const [year, setYear] = useState('');
  const [sem, setSem] = useState('');
  const [type, setType] = useState('');
  const { data: docs } = useDocuments({ sort: 'downloads', pageSize: 1 });
  const { data: universities = [] } = useUniversities();
  const { data: subjects } = useSubjects({ pageSize: 1 });
  const home = user ? '/app' : '/login';

  const search = (query = q) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (uni) params.set('universityId', uni);
    if (year) params.set('year', year);
    if (sem) params.set('semester', sem);
    if (type) params.set('type', type);
    navigate(`/app/library${params.toString() ? `?${params}` : ''}`);
  };

  const stats = useMemo(
    () => [
      ['Tài liệu', docs?.total ?? 0],
      ['Trường', universities.length],
      ['Môn học', subjects?.total ?? 0],
      ['Module', TOOLS.length + 1],
    ] as const,
    [docs, universities, subjects],
  );

  return (
    <div className="landing">
      <StarDefs />
      <header className="nav scrolled">
        <div className="container nav-in">
          <Link to="/" aria-label="Kaned — trang chủ">
            <Wordmark />
          </Link>
          <nav className="nav-links" aria-label="Chính">
            <a href="#modules">Hệ sinh thái</a>
            <a href="#subjects-tool">Môn học & điều kiện</a>
          </nav>
          <span className="spacer" />
          <div className="nav-actions">
            {user ? (
              <Link className="btn btn-primary btn-sm" to="/app">
                Vào không gian học tập
                <ArrowRight className="ic ic-sm" />
              </Link>
            ) : (
              <>
                <Link className="btn btn-ghost btn-sm" to="/login">
                  Đăng nhập
                </Link>
                <Link className="btn btn-primary btn-sm" to="/register">
                  Tạo tài khoản
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-paper" aria-hidden />
        <span className="hero-margin" aria-hidden />
        <div className="container hero-grid">
          <div className="hero-copy">
            <Link className="hero-note" to={home}>
              <Flame className="ic ic-xs" />
              <span>
                <b>Hệ sinh thái học tập</b> cho sinh viên đại học Việt Nam
              </span>
              <ChevronRight className="ic ic-xs" />
            </Link>
            <h1 className="t-display hero-title">Ghi chép, đề thi và lộ trình học — trên một tài khoản.</h1>
            <p className="t-lead hero-lead">
              Tìm tài liệu sinh viên các trường chia sẻ, lọc theo trường, năm, học kỳ và môn, xem trước từng trang. Nhập điểm để biết kỳ tới học được
              môn nào và môn nào đang bị chặn bởi điều kiện tiên quyết.
            </p>
            <form
              className="search-card"
              role="search"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              <div className="search-main">
                <Search className="ic ic-lg" />
                <label className="sr-only" htmlFor="hero-q">
                  Tìm tài liệu
                </label>
                <input id="hero-q" className="search-input" type="search" placeholder="Thử “đề thi CSD201” hoặc “chia subnet”" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn btn-primary" type="submit">
                  Tìm
                </button>
              </div>
              <div className="search-filters">
                <label className="qf">
                  <span className="sr-only">Trường</span>
                  <select className="qf-select" value={uni} onChange={(e) => setUni(e.target.value)}>
                    <option value="">Mọi trường</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="qf">
                  <span className="sr-only">Năm học</span>
                  <select className="qf-select" value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="">Mọi năm</option>
                    {STUDY_YEARS.map((y) => (
                      <option key={y} value={y}>
                        Năm {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="qf">
                  <span className="sr-only">Học kỳ</span>
                  <select className="qf-select" value={sem} onChange={(e) => setSem(e.target.value)}>
                    <option value="">Mọi học kỳ</option>
                    {SEMESTERS.map((s) => (
                      <option key={s} value={s}>
                        {SEMESTER_LABELS[s].vi}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="qf">
                  <span className="sr-only">Loại tài liệu</span>
                  <select className="qf-select" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="">Mọi loại</option>
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DOCUMENT_TYPE_LABELS[t].vi}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </form>
            <div className="popular">
              <span>Hay được tìm</span>
              {POPULAR.map((p) => (
                <button key={p} type="button" className="tag" onClick={() => search(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="hero-art" aria-hidden>
            <div className="hp hp-3">
              <DocPage doc={HERO[2]} index={0} />
            </div>
            <div className="hp hp-2">
              <DocPage doc={HERO[1]} index={0} />
            </div>
            <div className="hp hp-1">
              <DocPage doc={HERO[0]} index={0} />
            </div>
            <div className="hero-float hf-1">
              <FileIcon format="PDF" size="sm" />
              <div>
                <b className="clamp-1">Đề thi cuối kỳ CTDL & GT</b>
                <span>
                  <Download className="ic ic-xs" />
                  5.120 lượt tải
                  <i />
                  <Star className="ic ic-xs" />
                  4.9
                </span>
              </div>
            </div>
            <div className="hero-float hf-2">
              <Avatar name="Lê Thảo Vy" size="sm" />
              <div>
                <span className="stars-mini">
                  <Stars value={5} />
                </span>
                <p>“Cứu tinh mùa thi! Cấu trúc khá giống đề thật.”</p>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <dl className="hero-stats">
            {stats.map(([label, n]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{fmtInt(n)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section" id="modules">
        <div className="container">
          <SectionHead
            title="Thư viện chỉ là một phần của hệ sinh thái"
            description="Mỗi module giải một việc cụ thể trong đời sinh viên, và dùng chung dữ liệu với nhau: điểm bạn nhập ở công cụ GPA chính là thứ trang Môn học dùng để biết bạn đang bị chặn môn nào."
          />
          <div className="dash-tools">
            <Link to={home} className="dash-tool">
              <span className="tool-ic tone-violet">
                <Search className="ic" />
              </span>
              <b>Thư viện học liệu</b>
              <small>Đề thi, slide, ghi chép — lọc theo trường, môn, học kỳ và định dạng.</small>
              <ArrowRight className="ic ic-sm dash-tool-go" />
            </Link>
            {TOOLS.map((t) => (
              <div key={t.label} className={cn('dash-tool', !t.to && 'is-soon')}>
                <span className={cn('tool-ic', `tone-${t.tone}`)}>
                  <t.icon className="ic" />
                </span>
                <b>
                  {t.label} {!t.to && <span className="badge badge-gray">Sắp có</span>}
                </b>
                <small>{t.description}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="subjects-tool">
        <div className="container land-split">
          <div>
            <h2 className="t-h2">Biết trước môn nào bị chặn — trước ngày đăng ký</h2>
            <p className="t-lead" style={{ marginTop: 12 }}>
              Kaned đọc đúng luật của chương trình: “Pass môn” khác với “điểm ≥ 4”, môn thay thế như SWD391/SWD392, “đạt 3/4 môn”, và “kỳ 1–5 nợ
              tối đa 2 môn” trước khi đi OJT.
            </p>
            <ul className="land-points">
              <li>Nhập điểm ngay trên lộ trình 9 kỳ, kết quả cập nhật tức thì</li>
              <li>Mỗi môn bị chặn ghi rõ đang chờ môn nào, vì sao</li>
              <li>Gợi ý một kỳ học trong giới hạn 18 tín chỉ</li>
            </ul>
            <Link to={user ? '/app/subjects' : '/register'} className="btn btn-primary btn-lg" style={{ marginTop: 22 }}>
              {user ? 'Mở Môn học & điều kiện' : 'Tạo tài khoản miễn phí'}
              <ArrowRight className="ic ic-sm" />
            </Link>
          </div>
          <div className="land-demo" aria-hidden>
            <div className="cond cond-ok">
              <span className="req-ic">✓</span>
              <div className="req-main">
                <p className="req-text">PRO192 ≥ 4.0</p>
                <p className="req-detail">đạt 8.2</p>
              </div>
            </div>
            <div className="cond cond-ok">
              <span className="req-ic">✓</span>
              <div className="req-main">
                <p className="req-text">DBI202 ≥ 4.0</p>
                <p className="req-detail">đạt 4.5 — chưa qua môn, nhưng đủ cho PRJ301</p>
              </div>
            </div>
            <div className="cond cond-pending">
              <span className="req-ic">…</span>
              <div className="req-main">
                <p className="req-text">Qua môn SWP391 (≥ 5.0)</p>
                <p className="req-detail">SWP391 đang học</p>
              </div>
            </div>
            <div className="cond cond-no">
              <span className="req-ic">✕</span>
              <div className="req-main">
                <p className="req-text">Các môn kỳ 1–5 nợ tối đa 2 môn</p>
                <p className="req-detail">đang nợ 4 môn: DBI202, JPD113, JPD123, SWT301</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom" style={{ borderTop: 0 }}>
            <Wordmark />
            <p>© {new Date().getFullYear()} Kaned. Tài liệu thuộc về sinh viên đã viết ra chúng.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
