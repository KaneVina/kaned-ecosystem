import { useEffect, useState } from 'react';
import { Check, Circle, X } from 'lucide-react';
import type { CriterionCheck, PassCriteriaResult, PassCriteriaValues } from '@kaned/shared';
import { parseScore } from '@/features/grades/queries';
import { cn } from '@/lib/cn';

/** A component score box: free text while typing, a number once it reads as 0–10. */
function ScoreBox({ check, value, onChange }: { check: CriterionCheck; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [raw, setRaw] = useState(value === undefined ? '' : String(value));
  useEffect(() => setRaw(value === undefined ? '' : String(value)), [value]);
  const bad = raw.trim() !== '' && parseScore(raw) === null;
  return (
    <span className={cn('pc-score', bad && 'invalid')}>
      <input
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        aria-label={`Điểm ${check.criterion.kind === 'component' ? check.criterion.label : ''}`}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = parseScore(e.target.value);
          if (e.target.value.trim() === '') onChange(undefined);
          else if (n !== null) onChange(n);
        }}
        onFocus={(e) => e.currentTarget.select()}
      />
      <span>/10</span>
    </span>
  );
}

/** The subject's pass conditions as a checklist the student fills in. */
export function PassCriteriaPanel({
  result,
  values,
  onChange,
}: {
  result: PassCriteriaResult;
  values: PassCriteriaValues;
  onChange: (next: PassCriteriaValues) => void;
}) {
  const set = (id: string, v: number | boolean | undefined) => {
    const next = { ...values };
    if (v === undefined) delete next[id];
    else next[id] = v;
    onChange(next);
  };

  return (
    <ul className="pc-list">
      {result.checks.map((c) => {
        const k = c.criterion;
        const state = c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'wait';
        const Icon = c.ok === true ? Check : c.ok === false ? X : Circle;
        return (
          <li key={k.id} className={cn('pc-item', `is-${state}`)}>
            <span className="pc-mark" aria-hidden>
              <Icon className="ic ic-xs" />
            </span>
            {k.kind === 'task' ? (
              <label className="pc-task">
                <input type="checkbox" checked={values[k.id] === true} onChange={(e) => set(k.id, e.target.checked)} />
                <span>{c.text}</span>
              </label>
            ) : (
              <span className="pc-text">{c.text}</span>
            )}
            {k.kind === 'component' && (
              <ScoreBox check={c} value={typeof values[k.id] === 'number' ? (values[k.id] as number) : undefined} onChange={(v) => set(k.id, v)} />
            )}
            {k.kind === 'total' && <span className="pc-hint">{c.value === null ? 'theo điểm môn ở trên' : `${c.value}/10`}</span>}
          </li>
        );
      })}
    </ul>
  );
}
