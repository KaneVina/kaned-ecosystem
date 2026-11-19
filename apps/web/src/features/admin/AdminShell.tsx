import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronRight,
  FilePlus2,
  Files,
  Layers,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Route as RouteIcon,
  Search,
  Users,
  type LucideIcon,
  GraduationCap,
  UsersRound,
} from 'lucide-react';
import { ROLE_LABELS } from '@kaned/shared';
import { Wordmark } from '@/components/ui/Wordmark';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/providers/AuthProvider';
import { useOverview } from './api';
import { ActionMenu } from './ui';
import { CommandPalette } from './CommandPalette';
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
      { to: '/admin/decks', label: 'Bộ đề ôn tập', icon: Layers },
      { to: '/admin/lecturers', label: 'Giảng viên', icon: UsersRound },
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
      { to: '/admin/grades', label: 'Điểm sinh viên', icon: GraduationCap, adminOnly: true },
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
  const [palette, setPalette] = useState(false);
  const { data: overview } = useOverview();
  const isAdmin = user?.role === 'ADMIN';
  const groups = useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) })).filter((g) => g.items.length), [isAdmin]);

  useEffect(() => {
    setNavOpen(false);
    setPalette(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.title = 'Quản trị · Kaned';
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !document.querySelector('.sheet-wrap, .dlg-wrap'))) {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.title = 'Kaned';
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!user) return null;
  const pending = overview?.documentsByStatus.PENDING ?? 0;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

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

          <button type="button" className="adm-search-btn" onClick={() => setPalette(true)}>
            <Search className="ic" />
            Tìm nhanh…
            <span className="kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
          </button>

          <nav className="adm-nav">
            {groups.map((group) => (
              <div className="adm-group" key={group.title}>
                <p>{group.title}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <NavLink to={item.to} end={item.end} className={({ isActive }) => cn('adm-link', isActive && 'active')}>
                        <item.icon className="ic" />
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
            ))}
          </nav>

          <div className="adm-side-foot">
            <Link to="/app" className="adm-link">
              <ArrowLeft className="ic" />
              Về không gian học tập
            </Link>
            <div className="adm-me">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div>
                <b>{user.name}</b>
                <span>{ROLE_LABELS[user.role].vi}</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => void logout().then(() => navigate('/login'))} aria-label="Đăng xuất" title="Đăng xuất">
                <LogOut className="ic" style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        </aside>
        <div className="adm-scrim" onClick={() => setNavOpen(false)} />

        <div className="adm-main">
          <header className="adm-top">
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
            <ActionMenu
              button={{ text: 'Tạo mới', icon: Plus, variant: 'primary' }}
              items={[
                { label: 'Tài liệu hoặc liên kết', icon: FilePlus2, onSelect: () => navigate('/admin/documents?new=1') },
                { label: 'Trường học', icon: Building2, onSelect: () => navigate('/admin/universities?new=1'), hidden: !isAdmin },
                { label: 'Môn học', icon: BookOpen, onSelect: () => navigate('/admin/subjects?new=1'), hidden: !isAdmin },
              ]}
            />
          </header>
          <main className="adm-content">
            <div key={location.pathname} className="adm-page">
              <Outlet />
            </div>
          </main>
        </div>
        <CommandPalette open={palette} onClose={() => setPalette(false)} isAdmin={isAdmin} nav={groups.flatMap((g) => g.items.map(({ to, label, icon }) => ({ to, label, icon })))} />
      </div>
    </CrumbContext.Provider>
  );
}
