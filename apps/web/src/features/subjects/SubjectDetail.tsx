import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, ClipboardList, FileText, KeyRound, ListChecks, PieChart, Target, X } from 'lucide-react';
import { evaluatePassCriteria, gradeBandFor, type CurriculumSubjectDto, type PassCriteriaValues, type PlannerResult, type SubjectStatus } from '@kaned/shared';
import { Skeleton } from '@/components/ui/Feedback';
import { subjectTone } from '@/components/paper/profiles';
import { useSubject } from '@/features/catalog/queries';
import { isInvalidScore, parseScore, type DraftEntry } from '@/features/grades/queries';
import { cn } from '@/lib/cn';
import { RequirementList } from './RequirementList';
import { PassCriteriaPanel } from './PassCriteriaPanel';
import { AssessmentPanel } from './AssessmentPanel';
import { STATUS } from './status';
import { SubjectDocuments } from './SubjectDocuments';

/** Where the subject sits in the programme; three terms make an academic year. */
const termLabel = (termNo: number | null) =>
  termNo ? `Kỳ ${termNo} trong chương trình · năm thứ ${Math.ceil(termNo / 3)}` : 'Môn tự chọn';

export function SubjectDetail({
  subject,
  result,
  entry,
  passMark,
  statusByCode,
  softUnlocks,
  onScore,
  onInProgress,
  onCriteria,
  onPick,
  onClose,
}: {
  subject: CurriculumSubjectDto;
  result: PlannerResult;
  entry: DraftEntry | undefined;
  passMark: number;
  statusByCode: Map<string, SubjectStatus>;
  /** Later subjects this score already satisfies even though it is not a pass. */
  softUnlocks: string[];
  onScore: (value: string) => void;
  onInProgress: (value: boolean) => void;
  onCriteria: (value: PassCriteriaValues) => void;
  onPick: (code: string) => void;
  onClose?: () => void;
}) {
  const { data: detail, isLoading } = useSubject(subject.code);
  const tone = subjectTone(subject.code);
  const status = STATUS[result.status];
  const raw = entry?.score ?? '';
  const score = parseScore(raw);
  const invalid = isInvalidScore(raw);
  const band = score !== null && !entry?.inProgress ? gradeBandFor(score) : null;
  const known = new Set(statusByCode.keys());
  const criteria = subject.passCriteria ?? [];
  const scheme = subject.assessmentScheme ?? [];
  const crit = evaluatePassCriteria(criteria, entry?.inProgress ? null : score, entry?.criteria, scheme);
  const unmet = crit.checks.filter((c) => c.state !== 'ok').map((c) => (c.state === 'retake' ? `${c.text} (còn thi lại lần 2)` : c.text));

  return (
    <article className="sd" style={{ ['--tc' as string]: tone.c, ['--tt' as string]: tone.t }} aria-label={`Chi tiết ${subject.code}`}>
      <header className="sd-head">
        {onClose && (
          <button type="button" className="icon-btn sd-close" onClick={onClose} aria-label="Đóng chi tiết">
            <X className="ic" />
          </button>
        )}
        <div className="sd-head-top">
          <span className="subj-chip">{subject.code}</span>
          <span className={cn('badge', `badge-${status.tone}`)}>
            <status.icon className="ic ic-xs" />
            {status.label}
          </span>
          {subject.choiceGroup && <span className="badge badge-blue">Chọn 1 trong nhóm</span>}
        </div>
        <h2 className="sd-title">{subject.nameVi}</h2>
        <p className="sd-en">{subject.name}</p>
        <p className="sd-meta">
          <b>{subject.credits}</b> tín chỉ <i>·</i> {termLabel(subject.termNo)}
        </p>
      </header>

      {/* Grade entry */}
      <section className="sd-grade" aria-label="Điểm của bạn">
        <div className="sd-grade-in">
          <label htmlFor="sd-score" className="sd-label">
            Điểm của bạn
          </label>
          <div className={cn('sd-score-box', invalid && 'invalid', entry?.inProgress && 'is-progress')}>
            <input
              id="sd-score"
              inputMode="decimal"
              autoComplete="off"
              placeholder="—"
              value={entry?.inProgress ? '' : raw}
              disabled={entry?.inProgress}
              onChange={(e) => onScore(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              aria-describedby="sd-score-hint"
              aria-invalid={invalid || undefined}
            />
            <span className="sd-of">/10</span>
          </div>
          <label className="check sd-progress">
            <input type="checkbox" checked={Boolean(entry?.inProgress)} onChange={(e) => onInProgress(e.target.checked)} />
            <span className="box">
              <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span className="check-l">Đang học kỳ này</span>
          </label>
        </div>

        <div className="sd-grade-out" id="sd-score-hint" aria-live="polite">
          {invalid ? (
            <p className="sd-verdict is-bad">Điểm phải là số từ 0 đến 10.</p>
          ) : entry?.inProgress ? (
            <p className="sd-verdict is-wait">Đang học — các môn cần {subject.code} sẽ chờ tới khi có điểm.</p>
          ) : band ? (
            <>
              <div className="sd-band">
                <span className={cn('sd-letter', band.gpa4 >= 3.5 ? 'g-hi' : band.gpa4 >= 2 ? 'g-mid' : 'g-lo')}>{band.letter}</span>
                <span className="sd-gpa4">
                  <b>{band.gpa4.toFixed(1)}</b> hệ 4
                </span>
              </div>
              {score! >= passMark && criteria.length > 0 && !crit.met ? (
                <p className="sd-verdict is-wait">Điểm đủ nhưng chưa qua môn: còn thiếu {unmet.join(', ')}.</p>
              ) : score! >= passMark ? (
                <p className="sd-verdict is-ok">Qua môn (cần ≥ {passMark.toFixed(1)}{criteria.length ? ' và đủ điều kiện bên dưới' : ''}).</p>
              ) : (
                <p className="sd-verdict is-bad">
                  Chưa qua môn (cần ≥ {passMark.toFixed(1)}).
                  {softUnlocks.length > 0 && (
                    <>
                      {' '}
                      Vẫn đủ điều kiện “≥ 4.0” để học{' '}
                      {softUnlocks.map((c, i) => (
                        <span key={c}>
                          {i > 0 && ', '}
                          <button type="button" className="req-code" onClick={() => onPick(c)}>
                            {c}
                          </button>
                        </span>
                      ))}
                      .
                    </>
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="sd-verdict">Nhập điểm hệ 10 để xem điểm chữ, hệ 4 và môn nào được mở.</p>
          )}
        </div>
      </section>

      {scheme.length > 0 && (
        <section className="sd-sec">
          <h3 className="sd-h">
            <PieChart className="ic ic-sm" />
            Cơ cấu điểm
          </h3>
          <AssessmentPanel
            scheme={scheme}
            values={entry?.criteria ?? {}}
            onChange={onCriteria}
            passMark={passMark}
            score={entry?.inProgress ? null : score}
            onUseTotal={(t) => onScore(String(t))}
          />
        </section>
      )}

      {criteria.length > 0 && (
        <section className="sd-sec">
          <h3 className="sd-h">
            <ListChecks className="ic ic-sm" />
            Điều kiện qua môn
            <span className={cn('sd-count', crit.met && 'is-ok')}>
              {crit.checks.filter((c) => c.state === 'ok').length}/{crit.checks.length}
            </span>
          </h3>
          <PassCriteriaPanel result={crit} criteria={criteria} values={entry?.criteria ?? {}} onChange={onCriteria} />
        </section>
      )}

      {/* Requirements */}
      <section className="sd-sec">
        <h3 className="sd-h">
          <KeyRound className="ic ic-sm" />
          Điều kiện để học môn này
        </h3>
        {result.checks.length ? (
          <RequirementList checks={result.checks} known={known} onPick={onPick} />
        ) : (
          <p className="sd-empty">Không có điều kiện tiên quyết — học được ngay từ kỳ {subject.termNo ?? 1}.</p>
        )}
      </section>

      {result.unlocks.length > 0 && (
        <section className="sd-sec">
          <h3 className="sd-h">
            <ChevronRight className="ic ic-sm" />
            Môn này mở khoá
          </h3>
          <div className="sd-unlocks">
            {result.unlocks.map((code) => {
              const st = statusByCode.get(code);
              return (
                <button key={code} type="button" className={cn('unlock', st && `st-${st}`)} onClick={() => onPick(code)}>
                  {st && (() => { const S = STATUS[st].icon; return <S className="ic ic-xs" />; })()}
                  {code}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* About */}
      <section className="sd-sec">
        <h3 className="sd-h">
          <BookOpen className="ic ic-sm" />
          Môn này học gì
        </h3>
        {isLoading ? (
          <>
            <Skeleton style={{ height: 13, width: '95%' }} />
            <Skeleton style={{ height: 13, width: '80%', marginTop: 8 }} />
          </>
        ) : (
          <>
            <dl className="sd-facts">
              <div>
                <dt>Mã môn</dt>
                <dd>{subject.code}</dd>
              </div>
              <div>
                <dt>Tín chỉ</dt>
                <dd>{subject.credits}</dd>
              </div>
              <div>
                <dt>Kỳ</dt>
                <dd>{subject.termNo ? `Kỳ ${subject.termNo}` : 'Tự chọn'}</dd>
              </div>
              <div>
                <dt>Loại</dt>
                <dd>{subject.choiceGroup ? 'Chọn 1 trong nhóm' : subject.isRequired ? 'Bắt buộc' : 'Tự chọn'}</dd>
              </div>
              {detail?.university && (
                <div>
                  <dt>Trường</dt>
                  <dd>{detail.university.code}</dd>
                </div>
              )}
              {detail?.majors && detail.majors.length > 0 && (
                <div className="wide">
                  <dt>Thuộc ngành</dt>
                  <dd>{detail.majors.map((m) => `${m.major.code ?? m.major.name}${m.termNo ? ` (kỳ ${m.termNo})` : ''}`).join(', ')}</dd>
                </div>
              )}
            </dl>
            {detail?.description ? <p className="sd-desc">{detail.description}</p> : <p className="sd-empty">Môn chưa có mô tả.</p>}
            {detail?.topics && detail.topics.length > 0 && (
              <ol className="syl-list sd-syl">
                {detail.topics.map((t, i) => (
                  <li key={t}>
                    <span className="syl-n">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>

      {detail?.outcomes && detail.outcomes.length > 0 && (
        <section className="sd-sec">
          <h3 className="sd-h">
            <Target className="ic ic-sm" />
            Học xong làm được gì
          </h3>
          <ul className="sd-outcomes">
            {detail.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      {detail?.assessment && (
        <section className="sd-sec">
          <h3 className="sd-h">
            <ClipboardList className="ic ic-sm" />
            Cách đánh giá
          </h3>
          <p className="sd-desc">{detail.assessment}</p>
        </section>
      )}

      <section className="sd-sec">
        <h3 className="sd-h">
          <FileText className="ic ic-sm" />
          Tài liệu cho {subject.code}
          <span className="sd-count">{detail?.documentCount ?? subject.documentCount ?? 0}</span>
        </h3>
        <SubjectDocuments subjectId={subject.id} universityId={subject.universityId} />
        <div className="sd-doc-actions">
          <Link className="btn btn-secondary btn-sm" to={`/app/library?subjectId=${subject.id}`}>
            Mở trong thư viện
          </Link>
          <Link className="btn btn-ghost btn-sm" to={`/app/upload?university=${subject.universityId}&subject=${subject.id}`}>
            Chia sẻ tài liệu
          </Link>
        </div>
      </section>
    </article>
  );
}
