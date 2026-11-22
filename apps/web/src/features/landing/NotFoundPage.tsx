import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Bookmark, FileSearch, Layers, Library, Search } from 'lucide-react';
import { Wordmark } from '@/components/ui/Wordmark';

const SHORTCUTS = [
  { to: '/app/library', label: 'Thư viện', hint: 'Tìm đề, slide, tài liệu', icon: Library },
  { to: '/app/subjects', label: 'Môn học', hint: 'Theo trường và học kỳ', icon: BookOpen },
  { to: '/app/flashcards', label: 'Thẻ ghi nhớ', hint: 'Ôn tập và thi thử', icon: Layers },
  { to: '/app/saved', label: 'Đã lưu', hint: 'Tài liệu bạn đã đánh dấu', icon: Bookmark },
];

export function NotFoundPage({ inShell = false }: { inShell?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const home = inShell ? '/app' : '/';

  const search = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    navigate(v ? `/app/library?q=${encodeURIComponent(v)}` : '/app/library');
  };

  const body = (
    <section className="nf-card" aria-labelledby="nf-title">
      <div className="nf-art" aria-hidden>
        <span className="nf-num">4</span>
        <span className="nf-doc">
          <FileSearch />
        </span>
        <span className="nf-num">4</span>
      </div>
      <h1 id="nf-title">Không tìm thấy trang này</h1>
      <p className="nf-sub">Đường dẫn có thể đã bị gõ sai, đã được chuyển đi, hoặc tính năng chưa được phát hành.</p>
      <code className="nf-path" title={pathname}>
        {pathname}
      </code>

      {inShell && (
        <form className="nf-search" onSubmit={search} role="search">
          <Search className="ic" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tài liệu, môn học…" aria-label="Tìm tài liệu" />
          <button type="submit" className="btn btn-primary btn-sm">
            Tìm
          </button>
        </form>
      )}

      <div className="nf-actions">
        <button type="button" className="btn btn-secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(home))}>
          <ArrowLeft className="ic ic-sm" />
          Quay lại
        </button>
        <Link to={home} className="btn btn-primary">
          {inShell ? 'Về Tổng quan' : 'Về trang chủ'}
        </Link>
      </div>

      {inShell && (
        <>
          <p className="nf-or">Hoặc đi đến</p>
          <ul className="nf-links">
            {SHORTCUTS.map((s) => (
              <li key={s.to}>
                <Link to={s.to}>
                  <span className="nf-ic">
                    <s.icon className="ic" />
                  </span>
                  <span>
                    <b>{s.label}</b>
                    <small>{s.hint}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
  if (inShell) return <div className="container nf">{body}</div>;
  return (
    <div className="nf-full">
      <Wordmark />
      {body}
    </div>
  );
}
