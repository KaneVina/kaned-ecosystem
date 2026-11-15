import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { FileIcon } from '@/components/ui/FileBadge';
import { useDocuments } from '@/features/library/queries';
import { useSubjects } from '@/features/catalog/queries';
import { subjectTone } from '@/components/paper/profiles';

const POPULAR = ['Đề thi cuối kỳ CSD201', 'SQL JOIN', 'Chia subnet', 'Cây AVL', 'PRO192 practical'];

/** Wraps the matched part of a string in <mark>, accent-insensitively. */
function highlight(text: string, q: string) {
  if (!q) return text;
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const i = fold(text).indexOf(fold(q).trim());
  if (i < 0) return text;
  const n = q.trim().length;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + n)}</mark>
      {text.slice(i + n)}
    </>
  );
}

interface Item {
  key: string;
  go: () => void;
}

/** The command palette behind the nav search button and the "/" shortcut. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 60);
    }
  }, [open]);

  const { data: docs } = useDocuments({ q: debounced, pageSize: 5 }, { enabled: open && Boolean(debounced) });
  const { data: subjects } = useSubjects({ q: debounced, pageSize: 4 }, { enabled: open && Boolean(debounced) });

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const docItems = debounced ? (docs?.items ?? []).slice(0, 5) : [];
  const subjectItems = debounced ? (subjects?.items ?? []).slice(0, 4) : [];

  const items: Item[] = useMemo(() => {
    if (!debounced) return POPULAR.map((p) => ({ key: p, go: () => go(`/app/library?q=${encodeURIComponent(p)}`) }));
    return [
      ...docItems.map((d) => ({ key: d.id, go: () => go(`/app/library/${d.id}`) })),
      ...subjectItems.map((s) => ({ key: s.id, go: () => go(`/app/subjects/${s.code}`) })),
      { key: 'all', go: () => go(`/app/library?q=${encodeURIComponent(debounced)}`) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, docs, subjects]);

  useEffect(() => setActive(0), [items.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (q.trim() && q.trim() !== debounced) go(`/app/library?q=${encodeURIComponent(q.trim())}`);
      else items[active]?.go();
    }
  };

  let index = -1;
  const itemProps = () => {
    index += 1;
    const i = index;
    return {
      role: 'option' as const,
      'aria-selected': i === active,
      className: `sg-item${i === active ? ' active' : ''}`,
      onMouseEnter: () => setActive(i),
      onClick: () => items[i]?.go(),
    };
  };

  return (
    <Modal open={open} onClose={onClose} title="Tìm trong Kaned" bare className="modal-palette palette">
      <div className="modal-body">
        <div className="pal-input">
          <Search className="ic ic-lg" />
          <input
            ref={input}
            type="search"
            placeholder="Tìm tài liệu, mã môn, tên môn…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-suggest"
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="suggest suggest-static" id="pal-suggest" role="listbox">
          {!debounced ? (
            <div className="sg-group">
              <div className="sg-label">Mọi người hay tìm</div>
              {POPULAR.map((p) => (
                <div key={p} {...itemProps()}>
                  <TrendingUp className="ic ic-sm" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {docItems.length > 0 && (
                <div className="sg-group">
                  <div className="sg-label">Tài liệu</div>
                  {docItems.map((d) => (
                    <div key={d.id} {...itemProps()}>
                      <FileIcon format={d.format} size="xs" />
                      <span className="sg-text">
                        <b>{highlight(d.title, debounced)}</b>
                        <small>
                          {d.subject.code}, {d.university.code}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {subjectItems.length > 0 && (
                <div className="sg-group">
                  <div className="sg-label">Môn học</div>
                  {subjectItems.map((s) => {
                    const tone = subjectTone(s.code);
                    return (
                      <div key={s.id} {...itemProps()}>
                        <span className="sg-sic" style={{ ['--tc' as string]: tone.c, ['--tt' as string]: tone.t }}>
                          <GraduationCapGlyph />
                        </span>
                        <span className="sg-text">
                          <b>{highlight(s.nameVi, debounced)}</b>
                          <small>
                            {s.code}, {s.credits} tín chỉ
                          </small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {!docItems.length && !subjectItems.length && (
                <div className="sg-empty">Chưa có kết quả nhanh cho “{debounced}”. Nhấn Enter để tìm trong toàn bộ thư viện.</div>
              )}
              <div className="sg-group">
                <div {...itemProps()}>
                  <Search className="ic ic-sm" />
                  <span>
                    Tìm “<b>{debounced}</b>” trong thư viện
                  </span>
                  <ChevronRight className="ic ic-sm sg-go" />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="pal-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> để chọn
          </span>
          <span>
            <kbd>Enter</kbd> để mở
          </span>
        </div>
      </div>
    </Modal>
  );
}

function GraduationCapGlyph() {
  return (
    <svg className="ic ic-xs" viewBox="0 0 24 24" aria-hidden>
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  );
}
