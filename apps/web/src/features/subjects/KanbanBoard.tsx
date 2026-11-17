import { useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowRight, Clock, GripVertical, ListChecks, Unlock } from 'lucide-react';
import { evaluatePassCriteria, type CurriculumSubjectDto, type PlannerResult, type SubjectStatus } from '@kaned/shared';
import { subjectTone } from '@/components/paper/profiles';
import { parseScore, type DraftEntry } from '@/features/grades/queries';
import { cn } from '@/lib/cn';
import { STATUS } from './status';

/** Left to right: what is still locked, what can start, what is running, then the outcome. */
const COLUMNS: SubjectStatus[] = ['blocked', 'available', 'in_progress', 'failed', 'passed'];

const EMPTY: Record<SubjectStatus, string> = {
  blocked: 'Không còn môn nào bị chặn.',
  available: 'Chưa có môn nào đủ điều kiện.',
  in_progress: 'Kéo môn từ “Học được” sang đây khi bắt đầu học.',
  failed: 'Không có môn nào phải học lại.',
  passed: 'Nhập điểm để môn chuyển sang đây.',
};

/** Where a card may be dropped, given where it is now. Scores and prerequisites decide the rest. */
function canDrop(from: SubjectStatus, to: SubjectStatus) {
  if (from === to || to === 'blocked' || from === 'blocked') return false;
  if (to === 'in_progress') return from === 'available' || from === 'failed';
  if (to === 'available') return from === 'in_progress';
  // Passed / failed come from a score: dropping there opens the score box.
  return to === 'passed' || to === 'failed';
}

const KIND = 'application/x-kaned-subject';

export function KanbanBoard({
  subjects,
  resultById,
  draft,
  statusByCode,
  visible,
  selectedId,
  onOpen,
  onStart,
  onStop,
  onNeedScore,
}: {
  subjects: CurriculumSubjectDto[];
  resultById: Map<string, PlannerResult>;
  draft: Record<string, DraftEntry>;
  statusByCode: Map<string, SubjectStatus>;
  visible: (s: CurriculumSubjectDto) => boolean;
  selectedId?: string;
  onOpen: (code: string) => void;
  onStart: (s: CurriculumSubjectDto) => void;
  onStop: (s: CurriculumSubjectDto) => void;
  /** A card was dropped on "Đã qua" / "Chưa qua": the score decides, so ask for it. */
  onNeedScore: (s: CurriculumSubjectDto) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; from: SubjectStatus } | null>(null);
  const [over, setOver] = useState<SubjectStatus | null>(null);
  const dragRef = useRef<{ id: string; from: SubjectStatus } | null>(null);

  const columns = useMemo(() => {
    const map = new Map<SubjectStatus, CurriculumSubjectDto[]>(COLUMNS.map((c) => [c, []]));
    for (const s of subjects) {
      const st = resultById.get(s.id)?.status;
      if (st && visible(s)) map.get(st)!.push(s);
    }
    for (const list of map.values()) list.sort((a, b) => (a.termNo ?? 99) - (b.termNo ?? 99) || a.code.localeCompare(b.code));
    return map;
  }, [subjects, resultById, visible]);

  const end = () => {
    dragRef.current = null;
    setDrag(null);
    setOver(null);
  };

  const drop = (to: SubjectStatus) => (e: DragEvent) => {
    e.preventDefault();
    const d = dragRef.current;
    end();
    if (!d || !canDrop(d.from, to)) return;
    const s = subjects.find((x) => x.id === d.id);
    if (!s) return;
    if (to === 'in_progress') onStart(s);
    else if (to === 'available') onStop(s);
    else onNeedScore(s);
  };

  return (
    <div className={cn('kb', drag && 'is-dragging')} role="list" aria-label="Bảng Kanban môn học">
      {COLUMNS.map((col) => {
        const S = STATUS[col];
        const list = columns.get(col)!;
        const credits = list.reduce((n, s) => n + s.credits, 0);
        const allowed = drag ? canDrop(drag.from, col) : false;
        return (
          <section
            key={col}
            role="listitem"
            className={cn('kb-col', `st-${col}`, drag && (allowed ? 'can-drop' : 'no-drop'), over === col && allowed && 'is-over')}
            aria-label={`${S.label}: ${list.length} môn`}
            onDragOver={(e) => {
              if (!dragRef.current || !canDrop(dragRef.current.from, col)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (over !== col) setOver(col);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col ? null : o));
            }}
            onDrop={drop(col)}
          >
            <header className="kb-head">
              <span className="kb-dot">
                <S.icon className="ic ic-xs" />
              </span>
              <h3>{S.label}</h3>
              <span className="kb-n">{list.length}</span>
              <span className="kb-cr">{credits} TC</span>
            </header>
            {drag && allowed && (col === 'passed' || col === 'failed') && <p className="kb-drop-hint">Thả để nhập điểm</p>}
            <ul className="kb-cards">
              {list.map((s, i) => {
                const r = resultById.get(s.id)!;
                const entry = draft[s.id];
                const score = entry && !entry.inProgress ? parseScore(entry.score) : null;
                const tone = subjectTone(s.code);
                const crit = s.passCriteria?.length ? evaluatePassCriteria(s.passCriteria, score, entry?.criteria) : null;
                const okCount = crit ? crit.checks.filter((c) => c.state === 'ok').length : 0;
                const waiting =
                  col === 'blocked'
                    ? [...new Set(r.checks.filter((c) => !c.ok).flatMap((c) => c.codes.filter((x) => statusByCode.get(x) !== 'passed')))].slice(0, 3)
                    : [];
                const draggable = col !== 'blocked';
                return (
                  <li
                    key={s.id}
                    className={cn('kb-card', selectedId === s.id && 'on', drag?.id === s.id && 'is-ghost')}
                    style={{ ['--tc' as string]: tone.c, ['--tt' as string]: tone.t, ['--i' as string]: Math.min(i, 8) }}
                    draggable={draggable}
                    onDragStart={(e) => {
                      const d = { id: s.id, from: col };
                      dragRef.current = d;
                      setDrag(d);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData(KIND, s.id);
                    }}
                    onDragEnd={end}
                  >
                    <button type="button" className="kb-card-btn" onClick={() => onOpen(s.code)} aria-label={`${s.code} ${s.nameVi}, ${STATUS[col].label}`}>
                      <span className="kb-card-top">
                        <span className="subj-chip">{s.code}</span>
                        <span className="kb-term">{s.termNo ? `Kỳ ${s.termNo}` : 'Tự chọn'}</span>
                        <span className="kb-cr2">{s.credits} TC</span>
                        {draggable && <GripVertical className="ic ic-xs kb-grip" aria-hidden />}
                      </span>
                      <span className="kb-name">{s.nameVi}</span>
                      <span className="kb-meta">
                        {score !== null && (col === 'passed' || col === 'failed') && <b className={cn('kb-score', col === 'passed' ? 'ok' : 'bad')}>{score}</b>}
                        {col === 'in_progress' && (
                          <span className="kb-chip amber">
                            <Clock className="ic ic-xs" />
                            Đang học
                          </span>
                        )}
                        {crit && (
                          <span className={cn('kb-chip', crit.met ? 'green' : crit.retakes ? 'amber' : '')} title="Điều kiện qua môn">
                            <ListChecks className="ic ic-xs" />
                            {okCount}/{crit.checks.length}
                          </span>
                        )}
                        {r.unlocks.length > 0 && col !== 'passed' && (
                          <span className="kb-chip" title={`Qua môn này sẽ mở: ${r.unlocks.join(', ')}`}>
                            <Unlock className="ic ic-xs" />
                            mở {r.unlocks.length}
                          </span>
                        )}
                        {waiting.length > 0 && <span className="kb-wait">Chờ {waiting.join(', ')}</span>}
                        {col === 'blocked' && !waiting.length && <span className="kb-wait">Chờ điều kiện nợ môn</span>}
                      </span>
                    </button>
                    {(col === 'available' || col === 'failed') && (
                      <button type="button" className="kb-quick" onClick={() => onStart(s)} title={col === 'failed' ? 'Đăng ký học lại kỳ này' : 'Bắt đầu học kỳ này'}>
                        {col === 'failed' ? 'Học lại' : 'Bắt đầu học'}
                        <ArrowRight className="ic ic-xs" />
                      </button>
                    )}
                  </li>
                );
              })}
              {!list.length && <li className="kb-empty">{EMPTY[col]}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
