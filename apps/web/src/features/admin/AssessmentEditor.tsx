import { useId, useState, type Dispatch, type SetStateAction } from 'react';
import { ClipboardPaste, Plus, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import {
  ASSESSMENT_TYPE_LABELS,
  parseAssessmentTable,
  type AssessmentItem,
  type AssessmentType,
  type CompletionKind,
} from '@kaned/shared';
import { categoryColor, WeightBar } from '@/components/documents/WeightBar';
import { cn } from '@/lib/cn';

const newId = () => Math.random().toString(36).slice(2, 10);
const item = (name: string, type: AssessmentType, parts: number, weight: number, completion: CompletionKind, min: number | null = null): AssessmentItem => ({
  id: newId(),
  name,
  type,
  parts,
  weight,
  completion,
  min,
  retake: type === 'final' ? true : undefined,
});

/** The common FPT layout, as on the FLM syllabus. */
const FPT_PRESET = () => [
  item('Assignment', 'ongoing', 2, 10, 'positive'),
  item('Practical Exam', 'ongoing', 1, 20, 'positive'),
  item('Progress test', 'ongoing', 2, 10, 'positive'),
  item('Project', 'ongoing', 1, 20, 'positive'),
  item('Final exam', 'final', 1, 40, 'min', 4),
];

const NAMES = ['Assignment', 'Practical Exam', 'Progress test', 'Project', 'Final exam', 'Lab', 'Quiz', 'Participation', 'Presentation', 'Theory Exam', 'Mid-term'];

/**
 * The subject's assessment table (FLM "Assessment"): categories, type, parts,
 * weight and completion criteria. Paste the table straight from FLM to fill it.
 */
export function AssessmentEditor({ value, onChange }: { value: AssessmentItem[]; onChange: Dispatch<SetStateAction<AssessmentItem[]>> }) {
  const list = useId();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const parsed = pasted.trim() ? parseAssessmentTable(pasted, newId) : [];
  const total = value.reduce((s, i) => s + i.weight, 0);
  const patch = (id: string, next: Partial<AssessmentItem>) => onChange((l) => l.map((i) => (i.id === id ? { ...i, ...next } : i)));
  let ongoing = 0;

  return (
    <div className="ase">
      <datalist id={list}>
        {NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {value.length > 0 && (
        <>
          <WeightBar items={value} />
          <div className="ase-table" role="table" aria-label="Cơ cấu điểm">
            <div className="ase-row ase-head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Cột điểm</span>
              <span role="columnheader">Loại</span>
              <span role="columnheader">Số phần</span>
              <span role="columnheader">Tỉ trọng</span>
              <span role="columnheader">Điều kiện hoàn thành</span>
              <span role="columnheader">Thi lại</span>
              <span />
            </div>
            {value.map((it, i) => {
              const color = categoryColor(it, it.type === 'final' ? 0 : ongoing++);
              return (
                <div key={it.id} className="ase-row" role="row">
                  <span className="ase-n" style={{ ['--c' as string]: color }}>
                    {i + 1}
                  </span>
                  <input className="input input-sm" list={list} value={it.name} maxLength={60} placeholder="Assignment" aria-label="Tên cột điểm" onChange={(e) => patch(it.id, { name: e.target.value })} />
                  <select className="select select-sm" value={it.type} aria-label="Loại" onChange={(e) => patch(it.id, { type: e.target.value as AssessmentType })}>
                    {(Object.keys(ASSESSMENT_TYPE_LABELS) as AssessmentType[]).map((t) => (
                      <option key={t} value={t}>
                        {ASSESSMENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <input className="input input-sm ase-num" type="number" min={1} max={20} value={it.parts} aria-label="Số phần" onChange={(e) => patch(it.id, { parts: Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))) })} />
                  <span className="ase-suffix">
                    <input className="input input-sm ase-num" type="number" min={0} max={100} step={5} value={it.weight} aria-label="Tỉ trọng (%)" onChange={(e) => patch(it.id, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                    <i>%</i>
                  </span>
                  <span className="ase-comp">
                    <select
                      className="select select-sm"
                      value={it.completion}
                      aria-label="Điều kiện hoàn thành"
                      onChange={(e) => {
                        const c = e.target.value as CompletionKind;
                        patch(it.id, { completion: c, min: c === 'min' ? (it.min ?? 4) : null });
                      }}
                    >
                      <option value="none">Không</option>
                      <option value="positive">&gt; 0</option>
                      <option value="min">≥ điểm</option>
                    </select>
                    {it.completion === 'min' && (
                      <input className="input input-sm ase-num" type="number" min={0} max={10} step={0.5} value={it.min ?? 4} aria-label="Điểm tối thiểu" onChange={(e) => patch(it.id, { min: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
                    )}
                  </span>
                  <button type="button" className={cn('ase-retake', it.retake && 'on')} aria-pressed={Boolean(it.retake)} title="Được thi lại lần 2 — điểm lần 2 thay cho lần 1" onClick={() => patch(it.id, { retake: !it.retake })}>
                    <RotateCcw className="ic ic-xs" />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Xoá ${it.name}`} onClick={() => onChange((l) => l.filter((x) => x.id !== it.id))}>
                    <Trash2 className="ic ic-sm" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className={cn('ase-total', Math.round(total) === 100 ? 'is-ok' : 'is-warn')}>
            Tổng tỉ trọng <b>{total}%</b>
            {Math.round(total) !== 100 && ` — ${total < 100 ? `còn thiếu ${100 - total}%` : `dư ${total - 100}%`}, điểm tổng sẽ quy về 100%.`}
          </p>
        </>
      )}

      <div className="ase-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange((l) => [...l, item('', 'ongoing', 1, Math.max(0, 100 - total), 'positive')])}>
          <Plus className="ic ic-sm" />
          Thêm cột điểm
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPasting((p) => !p)} aria-expanded={pasting}>
          <ClipboardPaste className="ic ic-sm" />
          Dán bảng từ FLM
        </button>
        {!value.length && (
          <button type="button" className="pce-preset" onClick={() => onChange(FPT_PRESET())}>
            <Wand2 className="ic ic-xs" />
            Mẫu FPT: Assignment · PE · Progress test · Project · Final exam
          </button>
        )}
      </div>

      {pasting && (
        <div className="ase-paste">
          <label className="label" htmlFor={`${list}-paste`}>
            Copy bảng “Assessment” trên FLM (từ dòng No. đến dòng cuối) rồi dán vào đây
          </label>
          <textarea
            id={`${list}-paste`}
            className="textarea"
            rows={5}
            placeholder={'No.\tCategory\tType\tPart\tWeight\tCompletion Criteria\n1\tAssignment\ton-going\t2\t10.0%\t>0\n5\tFinal exam\tFinal exam\t1\t40.0%\t4'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="ase-paste-foot">
            <span>{pasted.trim() ? (parsed.length ? `Đọc được ${parsed.length} cột điểm: ${parsed.map((p) => `${p.name} ${p.weight}%`).join(', ')}` : 'Chưa đọc được dòng nào — kiểm tra lại bảng.') : 'Mỗi dòng một cột điểm; cột Weight cần có dấu %.'}</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!parsed.length}
              onClick={() => {
                onChange(parsed);
                setPasted('');
                setPasting(false);
              }}
            >
              Dùng bảng này
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
