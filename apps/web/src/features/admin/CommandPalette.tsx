import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Building2, CornerDownLeft, FilePlus2, FileText, Route as RouteIcon, Search, UserRound, type LucideIcon } from 'lucide-react';
import type { AdminDocumentDto, AdminSubjectDto, AdminUserDto, Paginated } from '@kaned/shared';
import { http } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMajorsAdmin, useUniversitiesAdmin } from './api';
import { useDebounced } from './ui';

export interface PaletteNav {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface Item {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Ctrl/⌘+K: jump to any page, create something, or find a document, subject, school or programme. */
export function CommandPalette({ open, onClose, nav, isAdmin }: { open: boolean; onClose: () => void; nav: PaletteNav[]; isAdmin: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const query = useDebounced(q.trim(), 180);
  const { data: universities = [] } = useUniversitiesAdmin();
  const { data: majors = [] } = useMajorsAdmin();

  const docs = useQuery({
    queryKey: ['admin', 'palette', 'docs', query],
    queryFn: async () => (await http.get<Paginated<AdminDocumentDto>>('/admin/documents', { params: { q: query, pageSize: 5 } })).data.items,
    enabled: open && query.length >= 2,
  });
  const people = useQuery({
    queryKey: ['admin', 'palette', 'users', query],
    queryFn: async () => (await http.get<Paginated<AdminUserDto>>('/admin/users', { params: { q: query, pageSize: 5 } })).data.items,
    enabled: open && isAdmin && query.length >= 2,
  });
  const subjects = useQuery({
    queryKey: ['admin', 'palette', 'subjects', query],
    queryFn: async () => (await http.get<Paginated<AdminSubjectDto>>('/admin/subjects', { params: { q: query, pageSize: 5 } })).data.items,
    enabled: open && isAdmin && query.length >= 2,
  });

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    const raf = requestAnimationFrame(() => {
      setShown(true);
      input.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      setShown(false);
    };
  }, [open]);

  const go = (to: string) => () => {
    onClose();
    navigate(to);
  };

  const items = useMemo<Item[]>(() => {
    const f = fold(q.trim());
    const match = (s: string) => !f || fold(s).includes(f);
    const out: Item[] = [];
    for (const n of nav) if (match(n.label)) out.push({ key: `nav${n.to}`, group: 'Đi tới', label: n.label, icon: n.icon, run: go(n.to) });
    const creates: Array<[string, string, LucideIcon, boolean]> = [
      ['Đăng tài liệu hoặc liên kết', '/admin/documents?new=1', FilePlus2, true],
      ['Thêm trường', '/admin/universities?new=1', Building2, isAdmin],
      ['Thêm môn học', '/admin/subjects?new=1', BookOpen, isAdmin],
    ];
    for (const [label, to, icon, ok] of creates) if (ok && match(label)) out.push({ key: `new${to}`, group: 'Tạo mới', label, icon, run: go(to) });
    if (f && isAdmin) {
      for (const u of universities.filter((u) => match(`${u.code} ${u.nameVi} ${u.name}`)).slice(0, 4)) {
        out.push({ key: `u${u.id}`, group: 'Trường', label: u.nameVi, hint: u.code, icon: Building2, run: go(`/admin/universities/${u.id}`) });
      }
      for (const m of majors.filter((m) => match(`${m.code} ${m.nameVi} ${m.name}`)).slice(0, 4)) {
        out.push({ key: `m${m.id}`, group: 'Chương trình đào tạo', label: `${m.code} · ${m.nameVi}`, hint: `${m.termCount} kỳ`, icon: RouteIcon, run: go(`/admin/curriculum/${m.id}`) });
      }
      for (const p of people.data ?? []) {
        out.push({ key: `p${p.id}`, group: 'Người dùng', label: p.name, hint: p.online ? 'Đang online' : p.email, icon: UserRound, run: go(`/admin/users/${p.id}`) });
      }
      for (const s of subjects.data ?? []) {
        out.push({ key: `s${s.id}`, group: 'Môn học', label: `${s.code} · ${s.nameVi}`, hint: s.university?.code, icon: BookOpen, run: go(`/admin/subjects/${s.id}`) });
      }
    }
    if (f) {
      for (const d of docs.data ?? []) {
        out.push({ key: `d${d.id}`, group: 'Tài liệu', label: d.title, hint: d.subject.code, icon: FileText, run: go(`/admin/documents?open=${d.id}`) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, nav, isAdmin, universities, majors, subjects.data, docs.data, people.data]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const groups: Array<[string, Array<Item & { index: number }>]> = [];
  items.forEach((item, index) => {
    const g = groups.find(([name]) => name === item.group);
    if (g) g[1].push({ ...item, index });
    else groups.push([item.group, [{ ...item, index }]]);
  });
  const loading = (docs.isFetching || subjects.isFetching) && query.length >= 2;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let body: ReactNode;
  if (!items.length) {
    body = <div className="cmdk-empty">{loading ? 'Đang tìm…' : `Không tìm thấy “${q}”.`}</div>;
  } else {
    body = groups.map(([name, list]) => (
      <div key={name} role="group" aria-label={name}>
        <div className="cmdk-group">{name}</div>
        {list.map((item) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={item.index === active}
            className={cn('cmdk-item', item.index === active && 'is-active')}
            onMouseMove={() => setActive(item.index)}
            onClick={item.run}
          >
            <item.icon className="ic" />
            <span>{item.label}</span>
            {item.hint && <small>{item.hint}</small>}
          </button>
        ))}
      </div>
    ));
  }

  return createPortal(
    <div className={cn('cmdk-wrap', shown && 'open')} onKeyDown={onKey}>
      <div className="cmdk-backdrop" onClick={onClose} />
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Tìm nhanh">
        <div className="cmdk-input">
          <Search className="ic" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm trang, tài liệu, môn, trường… hoặc gõ việc cần làm"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={items[active]?.key}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={list}>
          {body}
        </div>
        <div className="cmdk-foot">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> chọn
          </span>
          <span>
            <span className="kbd">
              <CornerDownLeft style={{ width: 11, height: 11 }} />
            </span>{' '}
            mở
          </span>
          {loading && <span style={{ marginLeft: 'auto' }}>Đang tìm…</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
