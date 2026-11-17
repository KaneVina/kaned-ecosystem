import { useId, useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { absenceLimit, describeCriterion, formulaOf, type PassCriterion } from '@kaned/shared';
import { cn } from '@/lib/cn';

/** The vocabulary every subject uses. */
const GLOSSARY: Array<[string, string, string]> = [
  ['FE', 'Final Exam', 'Thi cuối kỳ. Môn không có PE: FE là bài thi cuối kỳ. Môn có PE: FE = PE + TE (cộng theo tỉ trọng từng phần).'],
  ['PE', 'Practical Exam', 'Thi thực hành. Có thể gồm nhiều phần như Speaking, Interview, Presentation — mỗi phần có thể có điểm sàn riêng.'],
  ['TE', 'Theory Exam', 'Thi lý thuyết dạng trắc nghiệm.'],
  ['Tổng', 'Điểm tổng kết', 'Cộng tất cả cột điểm (bài tập, quiz, PE, FE…) theo tỉ trọng của môn.'],
  ['0', 'Điểm liệt', 'Cột nào bằng 0 là trượt môn, dù điểm tổng có đủ.'],
  ['L2', 'Thi lại lần 2', 'Chỉ cột được đánh dấu mới thi lại. Điểm lần 2 thay cho lần 1.'],
  ['Vắng', 'Điều kiện chuyên cần', 'Vắng quá giới hạn của môn là không đủ điều kiện qua môn.'],
];

/** What this subject's own conditions say, in plain lines. */
function specifics(criteria: PassCriterion[]): string[] {
  const out: string[] = [];
  for (const c of criteria) {
    if (c.kind === 'component') {
      const f = formulaOf(c);
      const parts = (c.parts ?? []).filter((p) => p.min !== null && p.min !== undefined);
      const retakes = [c.retake && !f ? c.label : null, ...(c.parts ?? []).filter((p) => p.retake).map((p) => p.label)].filter(Boolean);
      let line = describeCriterion(c);
      if (f) line += ` — ${f}`;
      if (parts.length) line += `; ${parts.map((p) => `${p.label} ≥ ${p.min}`).join(', ')}`;
      if (retakes.length) line += `. Được thi lại lần 2: ${retakes.join(', ')}`;
      out.push(line);
    } else if (c.kind === 'attendance') {
      const lim = absenceLimit(c, c.sessions ?? null);
      out.push(`${describeCriterion(c)}${lim !== null && c.mode === 'percent' ? ` — tức tối đa ${lim} buổi` : ''}`);
    } else {
      out.push(describeCriterion(c));
    }
  }
  return out;
}

/**
 * "ⓘ Quy định điểm thi": a collapsible row that explains FE / PE / TE, điểm
 * liệt, thi lại and attendance, then lists this subject's own rules.
 */
export function ExamRules({ criteria, defaultOpen = false, className }: { criteria?: PassCriterion[]; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const body = useId();
  const mine = criteria?.length ? specifics(criteria) : [];

  return (
    <div className={cn('xr', open && 'is-open', className)}>
      <button type="button" className="xr-head" aria-expanded={open} aria-controls={body} onClick={() => setOpen((o) => !o)}>
        <span className="xr-i" aria-hidden>
          <Info className="ic ic-xs" />
        </span>
        <span className="xr-title">Quy định điểm thi</span>
        <span className="xr-sub">FE · PE · TE, điểm liệt, thi lại, chuyên cần</span>
        <ChevronDown className="ic ic-sm xr-chev" aria-hidden />
      </button>
      <div className="xr-body" id={body} hidden={!open}>
        <table className="xr-table">
          <tbody>
            {GLOSSARY.map(([k, name, rule]) => (
              <tr key={k}>
                <th scope="row">
                  <span className="xr-key">{k}</span>
                </th>
                <td>
                  <b className="xr-name">{name}</b>
                  {rule}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {mine.length > 0 && (
          <div className="xr-mine">
            <b>Môn này</b>
            <ul>
              {mine.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
