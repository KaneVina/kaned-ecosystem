import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, PenLine, X } from 'lucide-react';
import type { LecturerDto } from '@kaned/shared';
import { useLecturers } from '@/features/lecturers/api';
import { LecturerAvatar } from '@/features/lecturers/LecturerProfile';
import { cn } from '@/lib/cn';
import '@/features/lecturers/lecturers.css';

/**
 * The upload form's lecturer field: typing suggests lecturers from the
 * directory (the chosen school first); picking one links the document to
 * their profile. Anything else typed is kept as plain text, as before.
 */
export function LecturerInput({
  id,
  universityId,
  value,
  lecturerId,
  onChange,
}: {
  id: string;
  universityId?: string;
  value: string;
  lecturerId: string | null;
  onChange: (patch: { lecturer: string; lecturerId: string | null }) => void;
}) {
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 200);
    return () => clearTimeout(t);
  }, [value]);
  const enabled = open && !lecturerId && q.length >= 1;
  const { data, isFetching } = useLecturers({ q, universityId: universityId || undefined, page: 1, pageSize: 6 }, enabled);
  const items: LecturerDto[] = enabled ? (data?.items ?? []) : [];
  const show = enabled && (items.length > 0 || !isFetching);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (l: LecturerDto) => {
    onChange({ lecturer: l.fullName, lecturerId: l.id });
    setOpen(false);
  };

  return (
    <div className={cn('lec-input', lecturerId && 'is-linked')} ref={box}>
      <input
        id={id}
        className="input"
        maxLength={120}
        placeholder="Gõ tên hoặc mã để chọn giảng viên, hoặc nhập tay"
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && items[active] ? `${listId}-${active}` : undefined}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange({ lecturer: e.target.value, lecturerId: null });
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && items[active]) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {lecturerId && (
        <span className="lec-linked">
          <BadgeCheck className="ic ic-xs" />
          Đã liên kết hồ sơ
          <button type="button" className="lec-unlink" aria-label="Bỏ liên kết hồ sơ giảng viên" onClick={() => onChange({ lecturer: value, lecturerId: null })}>
            <X className="ic ic-xs" />
          </button>
        </span>
      )}
      {show && (
        <ul className="lec-suggest" id={listId} role="listbox" aria-label="Giảng viên gợi ý">
          {items.map((l, i) => (
            <li
              key={l.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(i === active && 'is-active')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(l);
              }}
            >
              <LecturerAvatar l={l} size={32} />
              <span className="lec-s-text">
                <b>{l.fullName}</b>
                <small>
                  {l.code}
                  {l.department ? ` · ${l.department}` : ''} · {l.university.code}
                </small>
              </span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={active === items.length}
            className={cn('lec-s-manual', active === items.length && 'is-active')}
            onMouseEnter={() => setActive(items.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
          >
            <PenLine className="ic ic-sm" />
            <span>
              {items.length ? 'Không có trong danh sách? ' : 'Chưa có giảng viên này trong danh bạ. '}
              Giữ “{value.trim()}” như nhập tay
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}
