import { Fragment, type ReactNode } from 'react';
import { Check, Clock, X } from 'lucide-react';
import type { RequirementCheck } from '@kaned/shared';
import { cn } from '@/lib/cn';

/** Turns known subject codes inside a sentence into buttons that select that subject. */
function linkCodes(text: string, codes: string[], known: Set<string>, onPick: (code: string) => void): ReactNode {
  const pickable = codes.filter((c) => known.has(c));
  if (!pickable.length) return text;
  const pattern = new RegExp(`(${pickable.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(pattern).map((part, i) =>
    pickable.includes(part) ? (
      <button key={i} type="button" className="req-code" onClick={() => onPick(part)}>
        {part}
      </button>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Row({ check, known, onPick, nested }: { check: RequirementCheck; known: Set<string>; onPick: (c: string) => void; nested?: boolean }) {
  const state = check.ok ? 'ok' : check.pending ? 'pending' : 'no';
  const Icon = check.ok ? Check : check.pending ? Clock : X;
  return (
    <li className={cn('cond', `cond-${state}`, nested && 'cond-nested')}>
      <span className="req-ic" aria-hidden>
        <Icon className="ic ic-xs" />
      </span>
      <div className="req-main">
        <p className="req-text">{linkCodes(check.text, check.codes, known, onPick)}</p>
        <p className="req-detail">
          <span className="sr-only">{check.ok ? 'Đã đạt: ' : check.pending ? 'Đang chờ: ' : 'Chưa đạt: '}</span>
          {linkCodes(check.detail, check.codes, known, onPick)}
        </p>
        {check.children && check.children.length > 0 && (
          <ul className="req-children">
            {check.children.map((c, i) => (
              <Row key={i} check={c} known={known} onPick={onPick} nested />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function RequirementList({
  checks,
  known,
  onPick,
}: {
  checks: RequirementCheck[];
  known: Set<string>;
  onPick: (code: string) => void;
}) {
  return (
    <ul className="req-list">
      {checks.map((c, i) => (
        <Row key={i} check={c} known={known} onPick={onPick} />
      ))}
    </ul>
  );
}
