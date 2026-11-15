import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookMarked,
  Bookmark,
  CalendarDays,
  ChartLine,
  Calculator,
  CloudUpload,
  Compass,
  GraduationCap,
  LayoutGrid,
  Library,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { Wordmark } from '@/components/ui/Wordmark';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Dropdown';
import { cn } from '@/lib/cn';

/** The tools that hang off the "Công cụ" dropdown in the top bar. */
export const TOOLS = [
  {
    to: '/app/tools/gpa',
    label: 'Tính GPA',
    description: 'Nhập điểm, xem GPA hệ 4 và hệ 10',
    icon: Calculator,
  },
  {
    to: '/app/subjects',
    label: 'Thông tin môn học',
    description: 'Tra cứu đề cương, tín chỉ, tiên quyết',
    icon: BookMarked,
  },
  {
    to: '/app/planner',
    label: 'Kế hoạch học tập',
    description: 'Môn nào được học, môn nào bị chặn',
    icon: ChartLine,
  },
] as const;

const NAV = [
  { to: '/app', label: 'Tổng quan', icon: LayoutGrid, end: true },
  { to: '/app/library', label: 'Thư viện', icon: Library },
  { to: '/app/saved', label: 'Đã lưu', icon: Bookmark },
  { to: '/app/upload', label: 'Tải lên', icon: CloudUpload },
];

const COMING_SOON = [
  { label: 'Thẻ ghi nhớ', icon: Sparkles },
  { label: 'Thời khoá biểu', icon: CalendarDays },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      {/* ─── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-paper transition-transform duration-300 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-lg' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <NavLink to="/app" className="rounded">
            <Wordmark size="sm" />
          </NavLink>
          <IconButton label="Đóng menu" className="lg:hidden" onClick={() => setMobileOpen(false)}>
            <X className="size-[18px]" />
          </IconButton>
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="Điều hướng chính">
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-sunk hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn('size-[18px]', isActive ? 'text-brand' : 'text-ink-3')} aria-hidden />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="px-3 pt-6 pb-2 text-[11.5px] font-semibold tracking-wide text-ink-4 uppercase">Công cụ</p>
          <ul className="space-y-0.5">
            {TOOLS.map((tool) => (
              <li key={tool.to}>
                <NavLink
                  to={tool.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-sunk hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <tool.icon className={cn('size-[18px]', isActive ? 'text-brand' : 'text-ink-3')} aria-hidden />
                      {tool.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="px-3 pt-6 pb-2 text-[11.5px] font-semibold tracking-wide text-ink-4 uppercase">Sắp có</p>
          <ul className="space-y-0.5">
            {COMING_SOON.map((item) => (
              <li
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] text-ink-4"
                title="Module này đang được xây dựng"
              >
                <item.icon className="size-[18px]" aria-hidden />
                {item.label}
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line p-3">
          <NavLink
            to="/app/profile"
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-sunk"
          >
            <Avatar name={user?.name ?? 'Kaned'} src={user?.avatarUrl} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{user?.name}</span>
              <span className="block truncate text-xs text-ink-3">{user?.university?.name ?? 'Chưa chọn trường'}</span>
            </span>
          </NavLink>
        </div>
      </aside>

      {mobileOpen && (
        <div className="animate-fade-in fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      {/* ─── Main column ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <IconButton label="Mở menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </IconButton>

            <NavLink
              to="/app/library"
              className="hidden h-9 flex-1 items-center gap-2.5 rounded-lg border border-line-2 bg-paper px-3 text-[13.5px] text-ink-3 shadow-xs transition-colors hover:border-[#c6c2d6] hover:text-ink-2 sm:flex sm:max-w-md"
            >
              <Search className="size-4" aria-hidden />
              Tìm tài liệu, môn học, trường…
            </NavLink>

            <div className="flex-1 sm:hidden" />

            {/* The tools dropdown the whole app hangs off. */}
            <Dropdown
              label="Công cụ"
              width="min-w-[290px]"
              trigger={({ open }) => (
                <span
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13.5px] font-medium transition-colors',
                    open
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-line-2 bg-paper text-ink-2 shadow-xs hover:text-ink',
                  )}
                >
                  <Wrench className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Công cụ</span>
                  <svg
                    viewBox="0 0 24 24"
                    className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              )}
            >
              <MenuLabel>Công cụ học tập</MenuLabel>
              {TOOLS.map((tool) => (
                <NavLink key={tool.to} to={tool.to} className="block">
                  <MenuItem icon={<tool.icon className="size-[18px]" />} description={tool.description}>
                    {tool.label}
                  </MenuItem>
                </NavLink>
              ))}
              <MenuSeparator />
              <MenuLabel>Sắp có</MenuLabel>
              {COMING_SOON.map((item) => (
                <MenuItem
                  key={item.label}
                  icon={<item.icon className="size-[18px]" />}
                  disabled
                  className="cursor-not-allowed opacity-55"
                  trailing={<Badge tone="neutral">Sắp có</Badge>}
                >
                  {item.label}
                </MenuItem>
              ))}
            </Dropdown>

            <NavLink
              to="/app/upload"
              className="hidden h-8 items-center gap-1.5 rounded-sm bg-brand px-3 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(45,32,121,0.35)] transition-colors hover:bg-brand-600 sm:inline-flex"
            >
              <CloudUpload className="size-4" aria-hidden />
              Tải lên
            </NavLink>

            <Dropdown
              label="Tài khoản"
              trigger={() => (
                <span className="rounded-full p-0.5 transition-shadow hover:shadow-[0_0_0_3px_var(--color-brand-100)]">
                  <Avatar name={user?.name ?? 'Kaned'} src={user?.avatarUrl} size="sm" />
                </span>
              )}
            >
              <div className="flex items-center gap-3 border-b border-line px-2.5 pt-2 pb-3">
                <Avatar name={user?.name ?? 'Kaned'} src={user?.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{user?.name}</p>
                  <p className="truncate text-xs text-ink-3">{user?.email}</p>
                </div>
              </div>
              <div className="pt-1.5">
                <NavLink to="/app/profile" className="block">
                  <MenuItem icon={<User className="size-[18px]" />}>Hồ sơ của bạn</MenuItem>
                </NavLink>
                <NavLink to="/app/saved" className="block">
                  <MenuItem icon={<Bookmark className="size-[18px]" />}>Tài liệu đã lưu</MenuItem>
                </NavLink>
                <NavLink to="/app/profile" className="block">
                  <MenuItem icon={<Settings className="size-[18px]" />}>Cài đặt tài khoản</MenuItem>
                </NavLink>
                <MenuSeparator />
                <MenuItem icon={<LogOut className="size-[18px]" />} onClick={() => void logout()}>
                  Đăng xuất
                </MenuItem>
              </div>
            </Dropdown>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>

        <footer className="border-t border-line px-4 py-5 text-[13px] text-ink-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2">
              <GraduationCap className="size-4" aria-hidden />© 2026 Kaned Ecosystem
            </p>
            <p className="flex items-center gap-1.5">
              <Compass className="size-4" aria-hidden />
              Thư viện là một phần của hệ sinh thái
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
