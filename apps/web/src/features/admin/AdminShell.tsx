import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Files,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Route as RouteIcon,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS } from '@kaned/shared';
import { Wordmark } from '@/components/ui/Wordmark';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown, MenuButton } from '@/components/ui/Dropdown';
import { useAuth } from '@/providers/AuthProvider';
import { useOverview } from './api';
import { cn } from '@/lib/cn';
import '@/styles/admin.css';

/* ─────────────────────────────── crumbs ─────────────────────────────── */

export interface AdminCrumb {
  label: ReactNode;
  to?: string;
}
const CrumbContext = createContext<(c: AdminCrumb[]) => void>(() => undefined);

/** Pages name where they are; the top bar shows it. */
export function useAdminCrumbs(crumbs: AdminCrumb[], deps: unknown[] = []) {
  const set = useContext(CrumbContext);
  useEffect(() => {
    set(crumbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ─────────────────────────────── nav ─────────────────────────────── */

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  end?: boolean;
  count?: 'pending';
}
const NAV: Array<{ title: string; items: Item[] }> = [
  {
    title: 'Nội dung',
    items: [
      { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
      { to: '/admin/documents', label: 'Tài liệu', icon: Files, count: 'pending' },
    ],
  },
  {
    title: 'Học vụ',
    items: [
      { to: '/admin/universities', label: 'Trường học', icon: Building2, adminOnly: true },
      { to: '/admin/subjects', label: 'Môn học', icon: BookOpen, adminOnly: true },
      { to: '/admin/curriculum', label: 'Chương trình đào tạo', icon: RouteIcon, adminOnly: true },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { to: '/admin/users', label: 'Người dùng', icon: Users, adminOnly: true },
      { to: '/admin/activity', label: 'Nhật ký thay đổi', icon: History },
    ],
  },
];

export function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [crumbs, setCrumbs] = useState<AdminCrumb[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: overview } = useOverview();
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.title = 'Quản trị · Kaned';
    return () => {
      document.title = 'Kaned';
    };
  }, []);

  if (!user) return null;
  const pending = overview?.documentsByStatus.PENDING ?? 0;

  return (
    <CrumbContext.Provider value={setCrumbs}>
      <div className={cn('adm', navOpen && 'nav-open')}>
        <aside className="adm-side" aria-label="Điều hướng quản trị">
          <div className="adm-brand">
            <Link to="/admin" aria-label="Tổng quan quản trị">
              <Wordmark />
            </Link>
            <span className="adm-brand-tag">Quản trị</span>
          </div>

          <nav className="adm-nav">
            {NAV.map((group) => {
              const items = group.items.filter((i) => isAdmin || !i.adminOnly);
              if (!items.length) return null;
              return (
                <div className="adm-group" key={group.title}>
                  <p>{group.title}</p>
                  <ul>
                    {items.map((item) => (
                      <li key={item.to}>
                        <NavLink to={item.to} end={item.end} className={({ isActive }) => cn('adm-link', isActive && 'active')}>
                          <item.icon className="ic ic-sm" />
                          {item.label}
                          {item.count === 'pending' && pending > 0 && (
                            <span className="adm-count" title={`${pending} tài liệu chờ duyệt`}>
                              {pending}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          <div className="adm-side-foot">
            <Link to="/app" className="adm-link">
              <ArrowLeft className="ic ic-sm" />
              Về không gian học tập
            </Link>
            <div className="adm-me">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div>
                <b>{user.name}</b>
                <span>{ROLE_LABELS[user.role].vi}</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => void logout().then(() => navigate('/login'))} aria-label="Đăng xuất">
                <LogOut className="ic ic-sm" />
              </button>
            </div>
          </div>
        </aside>
        <div className="adm-scrim" onClick={() => setNavOpen(false)} />

        <div className="adm-main">
          <header className={cn('adm-top', scrolled && 'scrolled')}>
            <button type="button" className="icon-btn adm-burger" onClick={() => setNavOpen(true)} aria-label="Mở menu">
              <Menu className="ic" />
            </button>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link to="/admin">Quản trị</Link>
              {crumbs.map((c, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  <ChevronRight className="ic" aria-hidden />
                  {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                </span>
              ))}
            </nav>
            <span className="spacer" />
            <Dropdown
              align="right"
              trigger={(props) => (
                <button type="button" className="btn btn-primary btn-sm" {...props}>
                  <Plus className="ic ic-sm" />
                  Tạo mới
                  <ChevronDown className="ic ic-xs" />
                </button>
              )}
            >
              <MenuButton icon={<FilePlus2 className="ic ic-sm" />} onClick={() => navigate('/admin/documents?new=1')}>
                Tài liệu hoặc liên kết
              </MenuButton>
              {isAdmin && (
                <>
                  <MenuButton icon={<Building2 className="ic ic-sm" />} onClick={() => navigate('/admin/universities?new=1')}>
                    Trường học
                  </MenuButton>
                  <MenuButton icon={<BookOpen className="ic ic-sm" />} onClick={() => navigate('/admin/subjects?new=1')}>
                    Môn học
                  </MenuButton>
                </>
              )}
            </Dropdown>
          </header>
          <main className="adm-content">
            <div key={location.pathname} className="page-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </CrumbContext.Provider>
  );
}
