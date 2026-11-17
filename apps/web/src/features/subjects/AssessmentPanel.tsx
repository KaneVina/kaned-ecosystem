import { ArrowDownToLine, Check, Flag, RotateCcw, Target, X } from 'lucide-react';
import {
  ASSESSMENT_TYPE_LABELS,
  assessmentKey,
  describeCompletion,
  evaluateAssessment,
  type AssessmentItem,
  type PassCriteriaValues,
} from '@kaned/shared';
import { categoryColor, WeightBar } from '@/components/documents/WeightBar';
import { cn } from '@/lib/cn';
import { NumBox } from './PassCriteriaPanel';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toString());

/**
 * The subject's assessment table, made usable: a bar of weights, one card per
 * category with a box per part, the running total, and what is still needed
 * on the categories left (usually the final exam) to pass.
 */
export function AssessmentPanel({
  scheme,
  values,
  onChange,
  passMark,
  score,
  onUseTotal,
}: {
  scheme: AssessmentItem[];
  values: PassCriteriaValues;
  onChange: (next: PassCriteriaValues) => void;
  passMark: number;
  /** The subject's own score box, to offer filling it with the computed total. */
  score: number | null;
  onUseTotal: (total: number) => void;
}) {
  const r = evaluateAssessment(scheme, values, passMark);
  const set = (key: string, v: number | undefined) => {
    const next = { ...values };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  const filled = new Set(r.lines.filter((l) => l.avg !== null).map((l) => l.item.id));
  const failed = r.lines.filter((l) => l.state === 'bad');
  const retake = r.lines.filter((l) => l.state === 'retake');
  const needValue = r.need ? Math.max(r.need.average, r.need.floor) : null;
  let ongoing = 0;

  return (
    <div className="asm">
      <div className="asm-bar">
        <WeightBar items={scheme} filled={filled} />
        <span className="asm-entered">
          Đã nhập <b>{r.weightEntered}%</b> / {r.weightTotal}%
        </span>
      </div>

      <ol className="asm-list">
        {r.lines.map((l) => {
          const it = l.item;
          const color = categoryColor(it, it.type === 'final' ? 0 : ongoing++);
          const rule = describeCompletion(it);
          const showNeed = it.type === 'final' && l.avg === null && needValue !== null && r.need?.names.includes(it.name);
          return (
            <li key={it.id} className={cn('asm-item', `is-${l.state}`, it.type === 'final' && 'is-final')} style={{ ['--c' as string]: color }}>
              <div className="asm-head">
                <span className="asm-swatch" aria-hidden />
                <span className="asm-name">
                  <b>{it.name}</b>
                  <span className="asm-meta">
                    {ASSESSMENT_TYPE_LABELS[it.type]}
                    {it.parts > 1 && ` · ${it.parts} phần`}
                    {rule && (
                      <span className={cn('asm-rule', l.state === 'bad' && 'bad', l.state === 'ok' && 'ok')} title="Điều kiện hoàn thành">
                        {l.state === 'ok' ? <Check className="ic ic-xs" /> : l.state === 'bad' ? <X className="ic ic-xs" /> : null}
                        Đạt {rule}
                      </span>
                    )}
                    {it.retake && (
                      <span className="pc-badge sm" title="Được thi lại lần 2 — điểm lần 2 thay cho lần 1">
                        <RotateCcw className="ic ic-xs" />
                      </span>
                    )}
                  </span>
                </span>
                <span className="asm-weight">{fmt(it.weight)}%</span>
              </div>
              <div className="asm-scores">
                <span className="asm-boxes">
                  {Array.from({ length: it.parts }, (_, p) => {
                    const key = assessmentKey(it.id, p);
                    return (
                      <span key={p} className="asm-part">
                        <NumBox value={l.firsts[p]} label={`${it.name}${it.parts > 1 ? ` phần ${p + 1}` : ''}`} caption={it.parts > 1 ? `${p + 1}` : l.openRetake[p] || l.seconds[p] !== null ? 'Lần 1' : undefined} width={50} onChange={(v) => set(key, v)} />
                        {(l.openRetake[p] || l.seconds[p] !== null) && (
                          <NumBox value={l.seconds[p]} label={`${it.name} lần 2`} caption="Lần 2" tone="retake" width={50} onChange={(v) => set(`${key}#2`, v)} />
                        )}
                      </span>
                    );
                  })}
                </span>
                <span className="asm-out">
                  {l.avg !== null ? (
                    <>
                      {it.parts > 1 && (
                        <span className="asm-avg">
                          TB <b>{fmt(l.avg)}</b>
                        </span>
                      )}
                      <span className="asm-contrib">+{fmt(Math.round((l.contribution ?? 0) * 100) / 100)} điểm</span>
                    </>
                  ) : showNeed ? (
                    <span className={cn('asm-need', !r.need!.possible && 'bad')}>
                      <Target className="ic ic-xs" />
                      {r.need!.possible ? `cần ≥ ${fmt(needValue!)}` : 'không đủ để qua'}
                    </span>
                  ) : (
                    <span className="asm-wait">chưa có điểm</span>
                  )}
                </span>
              </div>
              {l.state === 'bad' && <p className="pc-note is-bad">{it.name} được {fmt(l.avg!)} — chưa đạt điều kiện {rule}, trượt môn dù điểm tổng đủ.</p>}
              {l.state === 'retake' && <p className="pc-note is-retake">{it.name} lần 1 chưa đạt {rule} — nhập điểm thi lại lần 2 khi có kết quả.</p>}
            </li>
          );
        })}
      </ol>

      <div className={cn('asm-sum', r.total === null ? 'is-open' : retake.length && !failed.length ? 'is-wait' : r.total >= passMark && r.completionOk ? 'is-pass' : 'is-fail')}>
        <div className="asm-sum-score">
          <span>{r.total !== null ? 'Điểm tổng' : 'Tạm tính'}</span>
          <b>{fmt(r.total ?? r.partial)}</b>
          <small>/ 10</small>
        </div>
        <div className="asm-sum-text">
          {r.total !== null ? (
            failed.length ? (
              <p>
                <X className="ic ic-xs" /> <span>Chưa qua: {failed.map((f) => f.item.name).join(', ')} không đạt điều kiện hoàn thành.</span>
              </p>
            ) : retake.length ? (
              <p>
                <RotateCcw className="ic ic-xs" /> <span>Chờ thi lại lần 2: {retake.map((f) => f.item.name).join(', ')}.</span>
              </p>
            ) : r.total >= passMark ? (
              <p>
                <Check className="ic ic-xs" /> <span>Đủ điểm qua môn (≥ {fmt(passMark)}).</span>
              </p>
            ) : (
              <p>
                <X className="ic ic-xs" /> <span>Điểm tổng dưới {fmt(passMark)} — chưa qua môn.</span>
              </p>
            )
          ) : r.need ? (
            r.need.possible ? (
              <p>
                <Flag className="ic ic-xs" /> <span>Để qua môn, {r.need.names.join(', ')} cần trung bình <b>≥ {fmt(needValue!)}</b>
                {r.need.floor > r.need.average ? ` (điều kiện hoàn thành ≥ ${fmt(r.need.floor)})` : ''}.</span>
              </p>
            ) : (
              <p>
                <X className="ic ic-xs" /> <span>Dù {r.need.names.join(', ')} được 10 cũng không đủ {fmt(passMark)} — cần cải thiện các cột còn lại.</span>
              </p>
            )
          ) : (
            <p>Nhập điểm từng cột để Kaned tính điểm tổng.</p>
          )}
        </div>
        {r.total !== null && score !== r.total && !retake.length && (
          <button type="button" className="btn btn-primary btn-sm asm-use" onClick={() => onUseTotal(r.total!)}>
            <ArrowDownToLine className="ic ic-sm" />
            Dùng {fmt(r.total)} làm điểm môn
          </button>
        )}
      </div>
    </div>
  );
}
