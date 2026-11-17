import { useId, useState, type KeyboardEvent } from 'react';
import { BadgeCheck, GitMerge, Layers, ListChecks, Scale, Trash2, X, type LucideIcon } from 'lucide-react';
import { describeRequirement, type Requirement } from '@kaned/shared';
import { cn } from '@/lib/cn';

type Kind = Requirement['kind'];

const KINDS: Record<Kind, { label: string; icon: LucideIcon; hint: string }> = {
  subject: { label: 'Môn tiên quyết', icon: BadgeCheck, hint: 'Qua một môn, hoặc đạt một mức điểm. Nhiều mã là các môn thay thế cho nhau.' },
  atLeast: { label: 'Đạt N trong nhóm', icon: ListChecks, hint: 'Ví dụ “đạt 3/4 môn”.' },
  maxDebt: { label: 'Giới hạn nợ môn', icon: Scale, hint: 'Ví dụ “kỳ 1–5 nợ tối đa 2 môn”.' },
  avgScore: { label: 'Điểm TB nhóm môn', icon: GitMerge, hint: 'Trung bình các môn (mỗi ô có thể có môn thay thế) ≥ mức điểm.' },
  all: { label: 'Nhóm điều kiện', icon: Layers, hint: 'Gộp nhiều điều kiện có chung một tên, tất cả đều phải thoả.' },
};

const make = (kind: Kind, termCount: number): Requirement => {
  switch (kind) {
    case 'subject':
      return { kind, codes: [], min: 'pass' };
    case 'atLeast':
      return { kind, count: 1, of: [{ kind: 'subject', codes: [], min: 'pass' }] };
    case 'maxDebt':
      return { kind, terms: Array.from({ length: Math.max(1, Math.min(5, termCount)) }, (_, i) => i + 1), maxSubjects: 2 };
    case 'avgScore':
      return { kind, groups: [[]], min: 4 };
    case 'all':
      return { kind, of: [{ kind: 'subject', codes: [], min: 'pass' }] };
  }
};

export interface CodeOption {
  code: string;
  name: string;
}

/** Codes as chips; Enter or comma adds one. Codes outside the programme are allowed (alternatives) but flagged. */
function CodeChips({ codes, onChange, options, placeholder }: { codes: string[]; onChange: (c: string[]) => void; options: CodeOption[]; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const known = new Set(options.map((o) => o.code.toLowerCase()));
  const add = (raw: string) => {
    const typed = raw.trim();
    if (!typed) return;
    const match = options.find((o) => o.code.toLowerCase() === typed.toLowerCase());
    const code = match?.code ?? typed;
    if (!codes.some((c) => c.toLowerCase() === code.toLowerCase())) onChange([...codes, code]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        add(draft);
      }
    } else if (e.key === 'Backspace' && !draft && codes.length) onChange(codes.slice(0, -1));
  };
  return (
    <div className="code-chips">
      {codes.map((c, i) => (
        <span key={c} style={{ display: 'contents' }}>
          {i > 0 && <span className="or">hoặc</span>}
          <span className={cn('code-chip', !known.has(c.toLowerCase()) && 'is-unknown')} title={known.has(c.toLowerCase()) ? options.find((o) => o.code.toLowerCase() === c.toLowerCase())?.name : 'Không có trong chương trình này (môn thay thế)'}>
            {c}
            <button type="button" onClick={() => onChange(codes.filter((x) => x !== c))} aria-label={`Bỏ ${c}`}>
              <X className="ic ic-xs" />
            </button>
          </span>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        placeholder={codes.length ? '' : (placeholder ?? 'Gõ mã môn rồi Enter')}
        onChange={(e) => {
          const v = e.target.value;
          // Picking from the datalist fills the whole code at once.
          if (options.some((o) => o.code === v)) add(v);
          else setDraft(v);
        }}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function NumberInput({ id, value, onChange, min, max, step = 1 }: { id?: string; value: number | undefined; onChange: (n: number | undefined) => void; min: number; max: number; step?: number }) {
  return (
    <input
      id={id}
      className="input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

function RuleCard({
  req,
  onChange,
  onRemove,
  options,
  termCount,
  passMark,
  nested,
}: {
  req: Requirement;
  onChange: (r: Requirement) => void;
  onRemove: () => void;
  options: CodeOption[];
  termCount: number;
  passMark: number;
  nested?: boolean;
}) {
  const meta = KINDS[req.kind];
  const id = useId();
  let preview = '';
  try {
    preview = describeRequirement(req, passMark);
  } catch {
    preview = '';
  }

  return (
    <div className={cn('re-card', nested && 'is-nested')}>
      <div className="re-head">
        <span className="re-kind">
          <meta.icon className="ic ic-sm" />
          {meta.label}
        </span>
        <span className="re-preview" title={preview}>
          {preview}
        </span>
        <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} onClick={onRemove} aria-label="Bỏ điều kiện">
          <Trash2 className="ic ic-sm" />
        </button>
      </div>
      <div className="re-body">
        {req.kind === 'subject' && (
          <div className="re-row">
            <div className="field">
              <span className="label">Môn</span>
              <CodeChips codes={req.codes} onChange={(codes) => onChange({ ...req, codes })} options={options} />
            </div>
            <div className="field is-narrow">
              <label className="label" htmlFor={`${id}-mode`}>
                Yêu cầu
              </label>
              <select
                id={`${id}-mode`}
                className="select"
                value={req.min === 'pass' ? 'pass' : 'score'}
                onChange={(e) => onChange({ ...req, min: e.target.value === 'pass' ? 'pass' : 4 })}
              >
                <option value="pass">Qua môn</option>
                <option value="score">Điểm ≥</option>
              </select>
            </div>
            {req.min !== 'pass' && (
              <div className="field is-narrow">
                <label className="label" htmlFor={`${id}-min`}>
                  Mức điểm
                </label>
                <NumberInput id={`${id}-min`} value={req.min} min={0} max={10} step={0.5} onChange={(n) => onChange({ ...req, min: n ?? 0 })} />
              </div>
            )}
          </div>
        )}

        {(req.kind === 'atLeast' || req.kind === 'all') && (
          <>
            <div className="re-row">
              {req.kind === 'atLeast' && (
                <div className="field is-narrow">
                  <label className="label" htmlFor={`${id}-count`}>
                    Cần đạt
                  </label>
                  <NumberInput id={`${id}-count`} value={req.count} min={1} max={req.of.length} onChange={(n) => onChange({ ...req, count: Math.max(1, n ?? 1) })} />
                </div>
              )}
              <div className="field">
                <label className="label" htmlFor={`${id}-label`}>
                  Tên hiển thị
                </label>
                <input
                  id={`${id}-label`}
                  className="input"
                  placeholder={req.kind === 'atLeast' ? `Đạt ${req.count}/${req.of.length} môn chuyên ngành` : 'ĐK1: Hoàn thành OJT'}
                  value={req.label ?? ''}
                  onChange={(e) => onChange({ ...req, label: e.target.value || undefined })}
                />
              </div>
            </div>
            <div className="re-children">
              <RequirementList
                value={req.of}
                onChange={(of) => onChange({ ...req, of, ...(req.kind === 'atLeast' ? { count: Math.min(req.count, Math.max(1, of.length)) } : {}) } as Requirement)}
                options={options}
                termCount={termCount}
                passMark={passMark}
                nested
              />
            </div>
          </>
        )}

        {req.kind === 'maxDebt' && (
          <>
            <div className="field">
              <span className="label">Tính các môn của kỳ</span>
              <div className="re-terms">
                {Array.from({ length: termCount }, (_, i) => i + 1).map((t) => (
                  <label key={t}>
                    <input
                      type="checkbox"
                      checked={req.terms.includes(t)}
                      onChange={(e) =>
                        onChange({ ...req, terms: e.target.checked ? [...req.terms, t].sort((a, b) => a - b) : req.terms.filter((x) => x !== t) })
                      }
                    />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="re-row">
              <div className="field is-narrow">
                <label className="label" htmlFor={`${id}-ms`}>
                  Nợ tối đa (môn)
                </label>
                <NumberInput id={`${id}-ms`} value={req.maxSubjects} min={0} max={60} onChange={(n) => onChange({ ...req, maxSubjects: n ?? 0 })} />
              </div>
              <div className="field is-narrow">
                <label className="label" htmlFor={`${id}-mc`}>
                  và tối đa (TC)
                </label>
                <NumberInput id={`${id}-mc`} value={req.maxCredits} min={0} max={200} onChange={(n) => onChange({ ...req, maxCredits: n })} />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${id}-dl`}>
                  Tên hiển thị
                </label>
                <input id={`${id}-dl`} className="input" value={req.label ?? ''} onChange={(e) => onChange({ ...req, label: e.target.value || undefined })} />
              </div>
            </div>
          </>
        )}

        {req.kind === 'avgScore' && (
          <>
            <div className="field">
              <span className="label">Các môn tính trung bình — mỗi dòng một môn, thêm mã thay thế vào cùng dòng</span>
              <div className="re-children" style={{ borderLeftColor: 'var(--blue-50)' }}>
                {req.groups.map((g, gi) => (
                  <div key={gi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <CodeChips codes={g} options={options} onChange={(codes) => onChange({ ...req, groups: req.groups.map((x, i) => (i === gi ? codes : x)) })} />
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={req.groups.length <= 1}
                      onClick={() => onChange({ ...req, groups: req.groups.filter((_, i) => i !== gi) })}
                      aria-label="Bỏ dòng"
                    >
                      <X className="ic ic-sm" />
                    </button>
                  </div>
                ))}
                <div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...req, groups: [...req.groups, []] })}>
                    + Thêm môn
                  </button>
                </div>
              </div>
            </div>
            <div className="re-row">
              <div className="field is-narrow">
                <label className="label" htmlFor={`${id}-avg`}>
                  Trung bình ≥
                </label>
                <NumberInput id={`${id}-avg`} value={req.min} min={0} max={10} step={0.5} onChange={(n) => onChange({ ...req, min: n ?? 0 })} />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${id}-al`}>
                  Tên hiển thị
                </label>
                <input id={`${id}-al`} className="input" value={req.label ?? ''} onChange={(e) => onChange({ ...req, label: e.target.value || undefined })} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RequirementList({
  value,
  onChange,
  options,
  termCount,
  passMark,
  nested,
}: {
  value: Requirement[];
  onChange: (v: Requirement[]) => void;
  options: CodeOption[];
  termCount: number;
  passMark: number;
  nested?: boolean;
}) {
  const kinds: Kind[] = nested ? ['subject', 'atLeast', 'all'] : ['subject', 'atLeast', 'maxDebt', 'avgScore', 'all'];
  return (
    <div className="re-list">
      {value.map((r, i) => (
        <RuleCard
          key={i}
          req={r}
          nested={nested}
          options={options}
          termCount={termCount}
          passMark={passMark}
          onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      <div className="re-add">
        {kinds.map((k) => {
          const Icon = KINDS[k].icon;
          return (
            <button key={k} type="button" className="btn btn-secondary btn-sm" title={KINDS[k].hint} onClick={() => onChange([...value, make(k, termCount)])}>
              <Icon className="ic ic-xs" />
              {KINDS[k].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
