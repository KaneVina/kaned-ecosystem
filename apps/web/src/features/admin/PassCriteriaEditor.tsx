import { useId, type Dispatch, type SetStateAction } from 'react';
import { Award, Ban, CalendarX2, ClipboardCheck, Plus, RotateCcw, Sigma, Trash2, Wand2, X, type LucideIcon } from 'lucide-react';
import {
  absenceLimit,
  describeCriterion,
  formulaOf,
  isComputed,
  type AttendanceCriterion,
  type ComponentCriterion,
  type PassCriterion,
  type PassCriterionKind,
  type ScorePart,
} from '@kaned/shared';
import { ExamRules } from '@/features/subjects/ExamRules';
import { cn } from '@/lib/cn';

const newId = () => Math.random().toString(36).slice(2, 10);

const KINDS: Record<PassCriterionKind, { label: string; icon: LucideIcon; single?: boolean }> = {
  component: { label: 'Cột điểm', icon: Sigma },
  total: { label: 'Điểm tổng', icon: Award, single: true },
  attendance: { label: 'Vắng không quá', icon: CalendarX2, single: true },
  noZero: { label: 'Không điểm liệt', icon: Ban, single: true },
  task: { label: 'Việc phải hoàn thành', icon: ClipboardCheck },
};
const ORDER: PassCriterionKind[] = ['component', 'total', 'attendance', 'noZero', 'task'];

const part = (label: string, weight: number | null = null, min: number | null = null, retake = false): ScorePart => ({ id: newId(), label, weight, min, retake });
const column = (label: string, min = 4, extra: Partial<ComponentCriterion> = {}): ComponentCriterion => ({ id: newId(), kind: 'component', label, min, ...extra });

function make(kind: PassCriterionKind): PassCriterion {
  switch (kind) {
    case 'component':
      return column('');
    case 'total':
      return { id: newId(), kind, min: 5 };
    case 'attendance':
      return { id: newId(), kind, mode: 'percent', max: 20, sessions: null };
    case 'noZero':
      return { id: newId(), kind };
    case 'task':
      return { id: newId(), kind, label: '' };
  }
}

/** Common sets, so an admin rarely types them out. */
const PRESETS: Array<{ label: string; build: () => PassCriterion[] }> = [
  { label: 'FE ≥ 4 · Tổng ≥ 5', build: () => [column('FE'), make('total')] },
  { label: 'PE ≥ 4 · FE ≥ 4 · Tổng ≥ 5', build: () => [column('PE'), column('FE'), make('total')] },
  { label: 'FE = PE + TE', build: () => [column('FE', 4, { parts: [part('PE', 50, null, true), part('TE', 50, null, true)] })] },
  {
    label: 'PE: Speaking · Interview · Presentation',
    build: () => [column('PE', 5, { retake: true, parts: [part('Speaking', null, 4), part('Interview', null, 4, true), part('Presentation', null, 4)] })],
  },
  { label: 'Vắng ≤ 20%', build: () => [make('attendance')] },
  { label: 'Không điểm liệt', build: () => [make('noZero')] },
  {
    label: 'Coursera',
    build: () => [
      { id: newId(), kind: 'task', label: 'Hoàn thành khoá học Coursera' },
      { id: newId(), kind: 'task', label: 'Được cấp chứng chỉ Coursera' },
    ],
  },
];

const COLUMN_NAMES = ['PE', 'FE', 'TE', 'Lab', 'Assignment', 'Progress test', 'Project'];
const PART_NAMES = ['Speaking', 'Interview', 'Presentation', 'Listening', 'Writing', 'Reading', 'PE', 'TE'];

const numOrNull = (raw: string, max: number) => (raw.trim() === '' ? null : Math.max(0, Math.min(max, Number(raw) || 0)));

function RetakeToggle({ on, onChange, small }: { on: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <button
      type="button"
      className={cn('pce-retake', on && 'on', small && 'sm')}
      aria-pressed={on}
      title="Cho phép thi lại lần 2 — điểm lần 2 thay cho lần 1"
      onClick={() => onChange(!on)}
    >
      <RotateCcw className="ic ic-xs" />
      Thi lại lần 2
    </button>
  );
}

function ComponentCard({ c, set, lists }: { c: ComponentCriterion; set: (next: ComponentCriterion) => void; lists: { cols: string; parts: string } }) {
  const parts = c.parts ?? [];
  const computed = isComputed(c);
  const weighted = parts.filter((p) => (p.weight ?? 0) > 0).length;
  const sum = parts.reduce((s, p) => s + (p.weight ?? 0), 0);
  const setPart = (id: string, patch: Partial<ScorePart>) => set({ ...c, parts: parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const addPart = (label = '') => set({ ...c, parts: [...parts, part(label)] });

  let hint: string;
  if (!parts.length) hint = `Sinh viên nhập điểm ${c.label || 'cột này'}. Thêm phần thi nếu cột gồm nhiều phần (Speaking, Interview…).`;
  else if (computed) hint = `${formulaOf(c)}${Math.round(sum) !== 100 ? ` — tổng tỉ trọng ${sum}%, sẽ quy về 100%` : ''}. ${c.label} được tính tự động.`;
  else if (weighted) hint = `Nhập tỉ trọng cho mọi phần để tự tính ${c.label || 'cột này'}, hoặc bỏ hết tỉ trọng để chỉ xét điểm sàn từng phần.`;
  else hint = `Sinh viên nhập điểm ${c.label || 'cột'}; mỗi phần có điểm sàn riêng — có thể cao hơn hoặc thấp hơn ${c.min}.`;

  return (
    <>
      <input
        className="input input-sm pce-label"
        value={c.label}
        list={lists.cols}
        maxLength={40}
        placeholder="PE, FE, TE…"
        aria-label="Tên cột điểm"
        onChange={(e) => set({ ...c, label: e.target.value })}
      />
      <span className="pce-min">
        ≥
        <input
          className="input input-sm"
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={c.min}
          aria-label={`Điểm tối thiểu của ${c.label}`}
          onChange={(e) => set({ ...c, min: numOrNull(e.target.value, 10) ?? 0 })}
        />
      </span>
      {!computed && <RetakeToggle on={Boolean(c.retake)} onChange={(v) => set({ ...c, retake: v })} />}

      <div className="pce-sub">
        {parts.length > 0 && (
          <div className="pce-parts" role="group" aria-label={`Các phần của ${c.label}`}>
            <div className="pce-part pce-part-head" aria-hidden>
              <span>Phần thi</span>
              <span>Tỉ trọng</span>
              <span>Điểm sàn</span>
              <span />
              <span />
            </div>
            {parts.map((p) => (
              <div key={p.id} className="pce-part">
                <input className="input input-sm" value={p.label} list={lists.parts} maxLength={40} placeholder="Speaking" aria-label="Tên phần thi" onChange={(e) => setPart(p.id, { label: e.target.value })} />
                <span className="pce-suffix">
                  <input className="input input-sm" type="number" min={0} max={100} step={5} placeholder="—" value={p.weight ?? ''} aria-label={`Tỉ trọng ${p.label} (%)`} onChange={(e) => setPart(p.id, { weight: numOrNull(e.target.value, 100) })} />
                  <i>%</i>
                </span>
                <span className="pce-suffix">
                  <i>≥</i>
                  <input className="input input-sm" type="number" min={0} max={10} step={0.5} placeholder="—" value={p.min ?? ''} aria-label={`Điểm sàn ${p.label}`} onChange={(e) => setPart(p.id, { min: numOrNull(e.target.value, 10) })} />
                </span>
                <RetakeToggle small on={Boolean(p.retake)} onChange={(v) => setPart(p.id, { retake: v })} />
                <button type="button" className="icon-btn" aria-label={`Bỏ phần ${p.label}`} onClick={() => set({ ...c, parts: parts.filter((x) => x.id !== p.id) })}>
                  <X className="ic ic-sm" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="pce-sub-actions">
          {parts.length < 6 && (
            <button type="button" className="pce-preset" onClick={() => addPart()}>
              <Plus className="ic ic-xs" />
              Phần thi
            </button>
          )}
          {!parts.length && /^fe$/i.test(c.label.trim()) && (
            <button type="button" className="pce-preset" onClick={() => set({ ...c, retake: false, parts: [part('PE', 50, null, true), part('TE', 50, null, true)] })}>
              FE = PE + TE
            </button>
          )}
          {!parts.length &&
            ['Speaking', 'Interview', 'Presentation'].map((n) => (
              <button key={n} type="button" className="pce-preset" onClick={() => addPart(n)}>
                + {n}
              </button>
            ))}
        </div>
        <p className="pce-hint">{hint}</p>
      </div>
    </>
  );
}

function AttendanceCard({ c, set }: { c: AttendanceCriterion; set: (next: AttendanceCriterion) => void }) {
  const limit = absenceLimit(c, c.sessions ?? null);
  return (
    <>
      <div className="seg pce-seg" role="group" aria-label="Tính theo">
        <button type="button" aria-pressed={c.mode === 'sessions'} onClick={() => set({ ...c, mode: 'sessions', max: c.mode === 'sessions' ? c.max : (limit ?? 4) })}>
          Số buổi
        </button>
        <button type="button" aria-pressed={c.mode === 'percent'} onClick={() => set({ ...c, mode: 'percent', max: c.mode === 'percent' ? c.max : 20 })}>
          Phần trăm
        </button>
      </div>
      <span className="pce-suffix">
        <input
          className="input input-sm"
          type="number"
          min={0}
          max={c.mode === 'percent' ? 100 : 300}
          step={1}
          value={c.max}
          aria-label={c.mode === 'percent' ? 'Phần trăm vắng tối đa' : 'Số buổi vắng tối đa'}
          onChange={(e) => set({ ...c, max: numOrNull(e.target.value, 100) ?? 0 })}
        />
        <i>{c.mode === 'percent' ? '%' : 'buổi'}</i>
      </span>
      <span className="pce-suffix">
        <i>trên</i>
        <input
          className="input input-sm"
          type="number"
          min={1}
          max={300}
          step={1}
          placeholder="?"
          value={c.sessions ?? ''}
          aria-label="Tổng số buổi của môn"
          onChange={(e) => set({ ...c, sessions: e.target.value.trim() === '' ? null : Math.max(1, Math.min(300, Math.round(Number(e.target.value) || 1))) })}
        />
        <i>buổi</i>
      </span>
      <p className="pce-hint pce-sub">
        {c.mode === 'percent'
          ? c.sessions
            ? `Tối đa ${limit} buổi vắng trên ${c.sessions} buổi.`
            : 'Để trống tổng số buổi thì sinh viên tự nhập, Kaned tính ra số buổi được vắng.'
          : `Tối đa ${c.max} buổi vắng${c.sessions ? ` trên ${c.sessions} buổi (${Math.round((c.max / c.sessions) * 100)}%)` : ''}.`}
      </p>
    </>
  );
}

/**
 * Pass conditions of a subject. Students fill them in on their subject page;
 * the subject counts as passed only when all are met.
 */
export function PassCriteriaEditor({ value, onChange }: { value: PassCriterion[]; onChange: Dispatch<SetStateAction<PassCriterion[]>> }) {
  const lists = { cols: useId(), parts: useId() };
  const replace = (next: PassCriterion) => onChange((list) => list.map((c) => (c.id === next.id ? next : c)));
  const has = (k: PassCriterionKind) => value.some((c) => c.kind === k);
  const addPreset = (build: () => PassCriterion[]) =>
    onChange((list) => {
      const seen = new Set(list.map((c) => describeCriterion(c).toLowerCase()));
      const singles = new Set(list.filter((c) => KINDS[c.kind].single).map((c) => c.kind));
      return [...list, ...build().filter((c) => !seen.has(describeCriterion(c).toLowerCase()) && !singles.has(c.kind))];
    });

  return (
    <div className="pce">
      <datalist id={lists.cols}>
        {COLUMN_NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id={lists.parts}>
        {PART_NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {value.length > 0 && (
        <ul className="pce-list">
          {value.map((c) => {
            const K = KINDS[c.kind];
            return (
              <li key={c.id} className={cn('pce-row', `pce-${c.kind}`)}>
                <span className="pce-kind">
                  <K.icon className="ic ic-sm" aria-hidden />
                  {K.label}
                </span>
                {c.kind === 'component' && <ComponentCard c={c} set={replace} lists={lists} />}
                {c.kind === 'attendance' && <AttendanceCard c={c} set={replace} />}
                {c.kind === 'total' && (
                  <span className="pce-min">
                    ≥
                    <input
                      className="input input-sm"
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={c.min}
                      aria-label="Điểm tổng tối thiểu"
                      onChange={(e) => replace({ ...c, min: numOrNull(e.target.value, 10) ?? 0 })}
                    />
                  </span>
                )}
                {c.kind === 'noZero' && <span className="pce-note">Cột nào bằng 0 là trượt môn. Kaned tự kiểm tra các cột ở trên; sinh viên xác nhận các cột còn lại.</span>}
                {c.kind === 'task' && (
                  <input
                    className="input input-sm pce-label"
                    value={c.label}
                    maxLength={120}
                    placeholder="vd. Được cấp chứng chỉ Coursera"
                    aria-label="Việc cần hoàn thành"
                    onChange={(e) => replace({ ...c, label: e.target.value })}
                  />
                )}
                <button type="button" className="icon-btn pce-del" aria-label={`Xoá điều kiện ${describeCriterion(c)}`} onClick={() => onChange((list) => list.filter((x) => x.id !== c.id))}>
                  <Trash2 className="ic ic-sm" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pce-add">
        {ORDER.map((k) => {
          const K = KINDS[k];
          return (
            <button key={k} type="button" className="btn btn-secondary btn-sm" disabled={K.single && has(k)} onClick={() => onChange((list) => [...list, make(k)])}>
              <K.icon className="ic ic-sm" />
              {K.label}
            </button>
          );
        })}
      </div>
      <div className="pce-presets">
        <Wand2 className="ic ic-xs" aria-hidden />
        <span>Mẫu nhanh:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="pce-preset" onClick={() => addPreset(p.build)}>
            {p.label}
          </button>
        ))}
      </div>
      <ExamRules criteria={value} />
    </div>
  );
}
