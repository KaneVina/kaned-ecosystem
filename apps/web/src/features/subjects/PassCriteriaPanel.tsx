import { useEffect, useState } from 'react';
import { Check, Circle, RotateCcw, X } from 'lucide-react';
import {
  criterionKey,
  type CheckState,
  type CriterionCheck,
  type PassCriteriaResult,
  type PassCriteriaValues,
  type PassCriterion,
  type ScoreLine,
} from '@kaned/shared';
import { parseScore } from '@/features/grades/queries';
import { cn } from '@/lib/cn';
import { ExamRules } from './ExamRules';

const ICON: Record<CheckState, typeof Check> = { ok: Check, bad: X, retake: RotateCcw, wait: Circle };
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

function Mark({ state, small }: { state: CheckState; small?: boolean }) {
  const I = ICON[state];
  return (
    <span className={cn('pc-mark', `is-${state}`, small && 'sm')} aria-hidden>
      <I className="ic ic-xs" />
    </span>
  );
}

/** A number box: free text while typing, a number once it reads right. */
export function NumBox({
  value,
  onChange,
  label,
  caption,
  max = 10,
  integer,
  tone,
  width = 56,
}: {
  value: number | null;
  onChange: (v: number | undefined) => void;
  label: string;
  caption?: string;
  max?: number;
  integer?: boolean;
  tone?: 'retake';
  width?: number;
}) {
  const [raw, setRaw] = useState(value === null ? '' : String(value));
  useEffect(() => setRaw(value === null ? '' : String(value)), [value]);
  const parse = (t: string) => {
    if (integer) {
      const n = Number(t.trim());
      return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
    }
    return parseScore(t);
  };
  const bad = raw.trim() !== '' && parse(raw) === null;
  return (
    <label className={cn('pc-num', bad && 'invalid', tone && `is-${tone}`)}>
      {caption && <span className="pc-cap">{caption}</span>}
      <input
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        placeholder="—"
        aria-label={label}
        style={{ width }}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = parse(e.target.value);
          if (e.target.value.trim() === '') onChange(undefined);
          else if (n !== null) onChange(n);
        }}
        onFocus={(e) => e.currentTarget.select()}
      />
    </label>
  );
}

/** Lần 1, and lần 2 once lần 1 falls short (or was already filled in). */
function Attempts({ line, set, open }: { line: ScoreLine; set: (key: string, v: number | undefined) => void; open?: boolean }) {
  const showSecond =
    line.retake && (open || line.second !== null || line.first === 0 || (line.first !== null && line.min !== null && line.first < line.min));
  return (
    <span className="pc-attempts">
      <NumBox value={line.first} label={`${line.label} lần 1`} caption={line.retake ? 'Lần 1' : undefined} onChange={(v) => set(line.key, v)} />
      {showSecond && (
        <NumBox value={line.second} label={`${line.label} lần 2`} caption="Lần 2" tone="retake" onChange={(v) => set(criterionKey.second(line.key), v)} />
      )}
    </span>
  );
}

function ComponentItem({ check, set }: { check: CriterionCheck; set: (key: string, v: number | boolean | undefined) => void }) {
  const main = check.score!;
  const parts = check.parts ?? [];
  const computed = Boolean(check.formula);
  const c = check.criterion as Extract<PassCriterion, { kind: 'component' }>;
  return (
    <>
      <div className="pc-main">
        <span className="pc-text">
          {check.text}
          {c.retake && !computed && (
            <span className="pc-badge" title="Cột này được thi lại lần 2, điểm lần 2 thay cho lần 1">
              <RotateCcw className="ic ic-xs" />
              Có thi lại
            </span>
          )}
        </span>
        {computed ? (
          <span className={cn('pc-computed', `is-${main.state}`)} title="Tính từ các phần bên dưới">
            {main.effective === null ? '—' : fmt(main.effective)}
          </span>
        ) : (
          <Attempts line={main} set={set} />
        )}
      </div>
      {check.formula && <p className="pc-formula">{check.formula}</p>}
      {parts.length > 0 && (
        <ul className="pc-parts">
          {parts.map((p) => (
            <li key={p.key} className={cn('pc-part', `is-${p.state}`)}>
              <Mark state={p.min === null && !computed ? (p.effective === null ? 'wait' : 'ok') : p.state} small />
              <span className="pc-part-l">
                {p.label}
                {p.weight !== null && computed && <i>{fmt(p.weight)}%</i>}
                {p.min !== null && <i>≥ {fmt(p.min)}</i>}
                {p.retake && (
                  <span className="pc-badge sm" title="Phần này được thi lại lần 2">
                    <RotateCcw className="ic ic-xs" />
                  </span>
                )}
              </span>
              <Attempts line={p} set={set} open={check.liftable?.includes(p.key)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AttendanceItem({ check, set }: { check: CriterionCheck; set: (key: string, v: number | boolean | undefined) => void }) {
  const a = check.attendance!;
  const id = check.criterion.id;
  const ratio = a.absent !== null && a.limit ? Math.min(1, a.absent / Math.max(1, a.limit)) : a.absent && a.limit === 0 ? 1 : 0;
  const tone = check.state === 'bad' ? 'bad' : a.left !== null && a.left <= 1 ? 'warn' : 'ok';
  let note: string | null = null;
  if (a.absent !== null && a.limit !== null) {
    if (a.left! < 0) note = `Vượt ${-a.left!} buổi — không đủ điều kiện qua môn.`;
    else if (a.left === 0) note = 'Đã chạm giới hạn — vắng thêm một buổi là không qua.';
    else note = `Còn được vắng ${a.left} buổi.`;
  }
  return (
    <>
      <div className="pc-main">
        <span className="pc-text">{check.text}</span>
        <span className="pc-attend">
          <NumBox value={a.absent} label="Số buổi đã vắng" caption="Đã vắng" integer max={300} width={48} onChange={(v) => set(id, v)} />
          <span className="pc-slash">/</span>
          {a.askSessions ? (
            <NumBox value={a.sessions} label="Tổng số buổi" caption="Tổng" integer max={300} width={48} onChange={(v) => set(criterionKey.sessions(id), v)} />
          ) : (
            <span className="pc-total">{a.sessions ?? '?'}</span>
          )}
          <span className="pc-unit">buổi</span>
        </span>
      </div>
      {a.limit !== null && (
        <div className="pc-meter" role="img" aria-label={`Đã vắng ${a.absent ?? 0} trên tối đa ${a.limit} buổi`}>
          <span className={cn('pc-meter-fill', `is-${tone}`)} style={{ width: `${ratio * 100}%` }} />
          {a.limit > 0 && a.limit <= 30 && Array.from({ length: a.limit - 1 }, (_, i) => <i key={i} style={{ left: `${((i + 1) / a.limit!) * 100}%` }} />)}
        </div>
      )}
      {note && <p className={cn('pc-note', `is-${tone}`)}>{note}</p>}
    </>
  );
}

/** The subject's pass conditions as a checklist the student fills in. */
export function PassCriteriaPanel({
  result,
  values,
  onChange,
  criteria,
}: {
  result: PassCriteriaResult;
  values: PassCriteriaValues;
  onChange: (next: PassCriteriaValues) => void;
  criteria: PassCriterion[];
}) {
  const set = (key: string, v: number | boolean | undefined) => {
    const next = { ...values };
    if (v === undefined || v === false) delete next[key];
    else next[key] = v;
    onChange(next);
  };

  return (
    <>
      {result.retakes > 0 && (
        <p className="pc-banner">
          <RotateCcw className="ic ic-xs" />
          Còn {result.retakes} điều kiện chờ thi lại lần 2 — nhập điểm lần 2 khi có kết quả.
        </p>
      )}
      <ul className="pc-list">
        {result.checks.map((check) => {
          const k = check.criterion;
          return (
            <li key={k.id} className={cn('pc-item', `is-${check.state}`)}>
              <Mark state={check.state} />
              <div className="pc-body">
                {k.kind === 'component' && <ComponentItem check={check} set={set} />}
                {k.kind === 'attendance' && <AttendanceItem check={check} set={set} />}
                {k.kind === 'total' && (
                  <div className="pc-main">
                    <span className="pc-text">{check.text}</span>
                    <span className="pc-hint">{check.value === null ? 'theo điểm môn ở trên' : `${fmt(check.value as number)}/10`}</span>
                  </div>
                )}
                {k.kind === 'task' && (
                  <label className="pc-main pc-task">
                    <span className="pc-text">{check.text}</span>
                    <input type="checkbox" checked={values[k.id] === true} onChange={(e) => set(k.id, e.target.checked)} />
                  </label>
                )}
                {k.kind === 'noZero' && (
                  <label className="pc-main pc-task">
                    <span className="pc-text">{check.text}</span>
                    <span className="pc-confirm">
                      Các cột khác đều &gt; 0
                      <input type="checkbox" checked={values[k.id] === true} onChange={(e) => set(k.id, e.target.checked)} />
                    </span>
                  </label>
                )}
                {check.detail && k.kind !== 'attendance' && <p className={cn('pc-note', `is-${check.state}`)}>{check.detail}</p>}
                {check.detail && k.kind === 'attendance' && check.state === 'wait' && <p className="pc-note is-wait">{check.detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <ExamRules criteria={criteria} className="pc-rules" />
    </>
  );
}
