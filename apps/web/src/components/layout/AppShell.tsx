import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  BookOpen,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Compass,
  GraduationCap,
  House,
  Layers,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Search,
  ShieldCheck,
  User,
  X,
  type LucideIcon,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { STAFF_ROLES } from '@kaned/shared';
import { useToast } from '@/providers/ToastProvider';
import { Wordmark } from '@/components/ui/Wordmark';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown, MenuButton, MenuLink, MenuSeparator } from '@/components/ui/Dropdown';
import { StarDefs } from '@/components/ui/Stars';
import { SearchPalette } from './SearchPalette';
import { useSavedDocuments } from '@/features/library/queries';
import { cn } from '@/lib/cn';

export interface Tool {
  to: string | null;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}

/** The tools in the "Công cụ" menu. Adding a module is one line here. */
export const TOOLS: Tool[] = [
  {
    to: '/app/tools/gpa',
    label: 'Tính GPA',
    description: 'Quy đổi điểm hệ 10 sang chữ và hệ 4, đặt mục tiêu',
    icon: Calculator,
    tone: 'violet',
  },
  {
    to: '/app/subjects',
    label: 'Môn học & điều kiện',
    description: 'Tra cứu môn, nhập điểm, xem môn nào học được hay bị chặn',
    icon: GraduationCap,
    tone: 'teal',
  },
  {
    to: null,
    label: 'Thẻ ghi nhớ',
    description: 'Ôn tập lặp lại giãn cách từ tài liệu đã lưu',
    icon: Layers,
    tone: 'amber',
  },
  {
    to: null,
    label: 'Thời khoá biểu',
    description: 'Xếp lịch học và nhắc deadline theo môn',
    icon: CalendarDays,
    tone: 'blue',
  },
];

const LINKS = [
  { to: '/app', label: 'Tổng quan', end: true },
  { to: '/app/library', label: 'Thư viện' },
  { to: '/app/subjects', label: 'Môn học' },
  { to: '/app/saved', label: 'Đã lưu' },
];

function ToolsMenu() {
  return (
    <Dropdown
      align="left"
      className="menu-tools"
      trigger={(props) => (
        <button type="button" className="nav-apps" {...props}>
          <LayoutGrid className="ic ic-sm" />
          <span>Công cụ</span>
          <ChevronDown className="ic ic-xs nav-apps-chev" />
        </button>
      )}
    >
      <p className="menu-label">Công cụ học tập</p>
      <div className="tools-grid">
        {TOOLS.map((tool) =>
          tool.to ? (
            <Link key={tool.label} role="menuitem" to={tool.to} className="tool-item">
              <span className={cn('tool-ic', `tone-${tool.tone}`)}>
                <tool.icon className="ic" />
              </span>
              <span className="tool-text">
                <b>{tool.label}</b>
                <small>{tool.description}</small>
              </span>
            </Link>
          ) : (
            <div key={tool.label} className="tool-item is-soon" aria-disabled="true">
              <span className={cn('tool-ic', `tone-${tool.tone}`)}>
                <tool.icon className="ic" />
              </span>
              <span className="tool-text">
                <b>
                  {tool.label}
                  <span className="badge badge-gray">Sắp có</span>
                </b>
                <small>{tool.description}</small>
              </span>
            </div>
          ),
        )}
      </div>
    </Dropdown>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: saved } = useSavedDocuments();
  const [scrolled, setScrolled] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // "/" opens search from anywhere that is not a text field, as in the prototype.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest('input, textarea, select, [contenteditable=true]');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setPalette(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setDrawer(false);
    document.getElementById('app')?.classList.remove('page-in');
    // Restart the page-in animation on every route change.
    requestAnimationFrame(() => document.getElementById('app')?.classList.add('page-in'));
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', drawer);
  }, [drawer]);

  const signOut = async () => {
    await logout();
    toast.info('Đã đăng xuất', 'Hẹn gặp lại bạn.');
    navigate('/login', { replace: true });
  };

  if (!user) return null;
  const subtitle = [user.major?.name, user.year ? `Năm ${user.year}` : null].filter(Boolean).join(', ');

  return (
    <>
      <a className="skip-link" href="#app">
        Bỏ qua tới nội dung
      </a>
      <StarDefs />

      <header className={cn('nav', scrolled && 'scrolled')}>
        <div className="container nav-in">
          <Link to="/app" aria-label="Kaned — trang chủ">
            <Wordmark />
          </Link>

          <nav className="nav-links" aria-label="Chính">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <ToolsMenu />

          <button type="button" className="nav-search" onClick={() => setPalette(true)} aria-label="Tìm trong Kaned">
            <Search className="ic ic-sm" />
            <span>Tìm tài liệu, môn học…</span>
            <kbd>/</kbd>
          </button>

          <div className="nav-actions">
            <Link className="btn btn-primary btn-sm nav-upload" to="/app/upload">
              <CloudUpload className="ic ic-sm" />
              Tải lên
            </Link>
            <Dropdown
              className="menu-user"
              trigger={(props) => (
                <button type="button" className="avatar-btn" aria-label="Tài khoản" {...props}>
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                </button>
              )}
            >
              <div className="menu-me">
                <Avatar name={user.name} src={user.avatarUrl} size="md" />
                <div>
                  <b>{user.name}</b>
                  <span>{user.university?.name ?? user.email}</span>
                </div>
              </div>
              <MenuLink to="/app/profile" icon={<User className="ic ic-sm" />}>
                Hồ sơ của bạn
              </MenuLink>
              <MenuLink to="/app/saved" icon={<Bookmark className="ic ic-sm" />} count={saved?.length ?? 0}>
                Tài liệu đã lưu
              </MenuLink>
              <MenuLink to="/app/tools/gpa" icon={<Calculator className="ic ic-sm" />}>
                Bảng điểm của bạn
              </MenuLink>
              <MenuLink to="/app/settings" icon={<Settings className="ic ic-sm" />}>
                Cài đặt tài khoản
              </MenuLink>
              {STAFF_ROLES.includes(user.role) && (
                <>
                  <MenuSeparator />
                  <MenuLink to="/admin" icon={<ShieldCheck className="ic ic-sm" />}>
                    Trang quản trị
                  </MenuLink>
                </>
              )}
              <MenuSeparator />
              <MenuButton onClick={signOut} icon={<LogOut className="ic ic-sm" />}>
                Đăng xuất
              </MenuButton>
            </Dropdown>
          </div>

          <button
            type="button"
            className="icon-btn nav-burger"
            aria-label="Mở menu"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <MenuIcon className="ic" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div className={cn('drawer-wrap', drawer && 'open')} hidden={!drawer}>
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
        <aside className="drawer" aria-label="Menu">
          <div className="drawer-head">
            <Link to="/app">
              <Wordmark />
            </Link>
            <button type="button" className="icon-btn" aria-label="Đóng menu" onClick={() => setDrawer(false)}>
              <X className="ic" />
            </button>
          </div>
          <button
            type="button"
            className="drawer-search"
            onClick={() => {
              setDrawer(false);
              setPalette(true);
            }}
          >
            <Search className="ic ic-sm" />
            Tìm tài liệu, môn học…
          </button>
          <nav className="drawer-nav" aria-label="Di động">
            <Link to="/app">
              <House className="ic" />
              Tổng quan
            </Link>
            <Link to="/app/library">
              <Compass className="ic" />
              Thư viện học liệu
            </Link>
            <Link to="/app/subjects">
              <BookOpen className="ic" />
              Môn học & điều kiện
            </Link>
            <Link to="/app/tools/gpa">
              <Calculator className="ic" />
              Tính GPA
            </Link>
            <Link to="/app/saved">
              <Bookmark className="ic" />
              Đã lưu
              <span className="menu-count">{saved?.length ?? 0}</span>
            </Link>
            <Link to="/app/settings">
              <Settings className="ic" />
              Cài đặt tài khoản
            </Link>
            {STAFF_ROLES.includes(user.role) && (
              <Link to="/admin">
                <ShieldCheck className="ic" />
                Trang quản trị
              </Link>
            )}
          </nav>
          <Link className="btn btn-primary btn-block" to="/app/upload">
            <CloudUpload className="ic ic-sm" />
            Tải lên tài liệu
          </Link>
          <Link className="drawer-me" to="/app/profile">
            <Avatar name={user.name} src={user.avatarUrl} size="md" />
            <div>
              <b>{user.name}</b>
              <span>{subtitle || user.email}</span>
            </div>
            <ChevronRight className="ic ic-sm" />
          </Link>
        </aside>
      </div>

      <main id="app" tabIndex={-1} className="page-in">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <Link to="/app" aria-label="Kaned — trang chủ">
                <Wordmark />
              </Link>
              <p>Hệ sinh thái học tập cho sinh viên Việt Nam: tài liệu, điểm số và kế hoạch học trên một tài khoản.</p>
            </div>
            <div className="footer-cols">
              <div>
                <h3>Thư viện</h3>
                <ul>
                  <li><Link to="/app/library">Tất cả tài liệu</Link></li>
                  <li><Link to="/app/library?type=EXAM">Đề thi các năm</Link></li>
                  <li><Link to="/app/library?type=NOTES">Ghi chép bài giảng</Link></li>
                  <li><Link to="/app/library?type=SLIDES">Slide</Link></li>
                </ul>
              </div>
              <div>
                <h3>Công cụ</h3>
                <ul>
                  <li><Link to="/app/tools/gpa">Tính GPA</Link></li>
                  <li><Link to="/app/subjects">Môn học & điều kiện</Link></li>
                  <li><Link to="/app/upload">Chia sẻ tài liệu</Link></li>
                </ul>
              </div>
              <div>
                <h3>Tài khoản</h3>
                <ul>
                  <li><Link to="/app/profile">Hồ sơ</Link></li>
                  <li><Link to="/app/saved">Đã lưu</Link></li>
                  <li>
                    <button type="button" className="footer-link" onClick={signOut}>
                      Đăng xuất
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© {new Date().getFullYear()} Kaned. Tài liệu thuộc về sinh viên đã viết ra chúng.</p>
            <p>Điểm và kế hoạch chỉ mang tính tham khảo, hãy đối chiếu với phòng đào tạo.</p>
          </div>
        </div>
      </footer>

      <SearchPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}
