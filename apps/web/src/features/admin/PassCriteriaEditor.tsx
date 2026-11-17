import { Award, ClipboardCheck, Sigma, Trash2, Wand2, type LucideIcon } from 'lucide-react';
import { describeCriterion, type PassCriterion, type PassCriterionKind } from '@kaned/shared';

const newId = () => Math.random().toString(36).slice(2, 10);

const KINDS: Record<PassCriterionKind, { label: string; icon: LucideIcon }> = {
  component: { label: 'Điểm thành phần', icon: Sigma },
  total: { label: 'Điểm tổng', icon: Award },
  task: { label: 'Việc phải hoàn thành', icon: ClipboardCheck },
};

const make = (kind: PassCriterionKind, label = ''): PassCriterion =>
  kind === 'total' ? { id: newId(), kind, min: 5 } : kind === 'component' ? { id: newId(), kind, label, min: 4 } : { id: newId(), kind, label };

/** Common sets, so an admin rarely types them out. */
const PRESETS: Array<{ label: string; build: () => PassCriterion[] }> = [
  { label: 'FE ≥ 4 · Tổng ≥ 5', build: () => [make('component', 'FE'), make('total')] },
  { label: 'PE ≥ 4 · FE ≥ 4 · Tổng ≥ 5', build: () => [make('component', 'PE'), make('component', 'FE'), make('total')] },
  {
    label: 'Coursera',
    build: () => [make('task', 'Hoàn thành khoá học Coursera'), make('task', 'Được cấp chứng chỉ Coursera')],
  },
];

/**
 * Pass conditions of a subject: component score floors (PE ≥ 4), the total
 * (≥ 5) and things to finish (a Coursera certificate). Students tick these on
 * their subject page; the subject counts as passed only when all are met.
 */
export function PassCriteriaEditor({ value, onChange }: { value: PassCriterion[]; onChange: (v: PassCriterion[]) => void }) {
  const patch = (id: string, next: Partial<PassCriterion>) =>
    onChange(value.map((c) => (c.id === id ? ({ ...c, ...next } as PassCriterion) : c)));
  const changeKind = (c: PassCriterion, kind: PassCriterionKind) => {
    const label = 'label' in c ? c.label : '';
    const min = 'min' in c ? c.min : kind === 'total' ? 5 : 4;
    const next: PassCriterion = kind === 'total' ? { id: c.id, kind, min } : kind === 'component' ? { id: c.id, kind, label, min } : { id: c.id, kind, label };
    onChange(value.map((x) => (x.id === c.id ? next : x)));
  };
  const addPreset = (list: PassCriterion[]) => {
    const have = new Set(value.map((c) => describeCriterion(c).toLowerCase()));
    const hasTotal = value.some((c) => c.kind === 'total');
    onChange([...value, ...list.filter((c) => !have.has(describeCriterion(c).toLowerCase()) && !(c.kind === 'total' && hasTotal))]);
  };

  return (
    <div className="pce">
      {value.length > 0 && (
        <ul className="pce-list">
          {value.map((c) => {
            const K = KINDS[c.kind].icon;
            return (
              <li key={c.id} className="pce-row">
                <K className="ic ic-sm pce-ic" aria-hidden />
                <select className="select select-sm" value={c.kind} aria-label="Loại điều kiện" onChange={(e) => changeKind(c, e.target.value as PassCriterionKind)}>
                  {(Object.keys(KINDS) as PassCriterionKind[]).map((k) => (
                    <option key={k} value={k} disabled={k === 'total' && c.kind !== 'total' && value.some((x) => x.kind === 'total')}>
                      {KINDS[k].label}
                    </option>
                  ))}
                </select>
                {c.kind !== 'total' && (
                  <input
                    className="input input-sm pce-label"
                    value={c.label}
                    maxLength={c.kind === 'component' ? 40 : 120}
                    placeholder={c.kind === 'component' ? 'PE, FE, Lab…' : 'vd. Được cấp chứng chỉ Coursera'}
                    aria-label={c.kind === 'component' ? 'Tên phần điểm' : 'Việc cần hoàn thành'}
                    onChange={(e) => patch(c.id, { label: e.target.value })}
                  />
                )}
                {c.kind !== 'task' && (
                  <span className="pce-min">
                    ≥
                    <input
                      className="input input-sm"
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={c.min}
                      aria-label="Mức điểm tối thiểu"
                      onChange={(e) => patch(c.id, { min: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
                    />
                  </span>
                )}
                <button type="button" className="icon-btn" aria-label={`Xoá điều kiện ${describeCriterion(c)}`} onClick={() => onChange(value.filter((x) => x.id !== c.id))}>
                  <Trash2 className="ic ic-sm" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="pce-add">
        {(Object.keys(KINDS) as PassCriterionKind[]).map((k) => {
          const K = KINDS[k].icon;
          const off = k === 'total' && value.some((x) => x.kind === 'total');
          return (
            <button key={k} type="button" className="btn btn-secondary btn-sm" disabled={off} onClick={() => onChange([...value, make(k)])}>
              <K className="ic ic-sm" />
              {KINDS[k].label}
            </button>
          );
        })}
      </div>
      <div className="pce-presets">
        <Wand2 className="ic ic-xs" aria-hidden />
        <span>Mẫu nhanh:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="pce-preset" onClick={() => addPreset(p.build())}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
