import { useMemo, useState } from 'react';
import { Calculator, Download, Info, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  computeGpa,
  gradeBandFor,
  GRADE_SCALE,
  requiredAverage,
  type GradeEntryInput,
  type SaveGradesInput,
} from '@kaned/shared';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { useCurriculum, useMajors } from '@/features/catalog/queries';
import { useGrades, useSaveGrades } from '@/features/grades/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Row {
  key: string;
  subjectId: string | null;
  code: string;
  name: string;
  credits: number;
  termNo: number | null;
  score: string;
}

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

const CLASSIFICATION_TONE: Record<string, 'brand' | 'ok' | 'warn' | 'danger'> = {
  Xuất: 'brand',
  Giỏi: 'ok',
  Khá: 'ok',
  'Trung bình': 'warn',
  Yếu: 'danger',
};

function toneFor(classification: string) {
  const key = Object.keys(CLASSIFICATION_TONE).find((k) => classification.startsWith(k));
  return key ? CLASSIFICATION_TONE[key] : 'brand';
}

export function GpaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [majorId, setMajorId] = useState(user?.majorId ?? '');
  const [rows, setRows] = useState<Row[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [targetGpa, setTargetGpa] = useState('3.2');
  const [plannedCredits, setPlannedCredits] = useState('15');

  const { data: majors = [] } = useMajors(user?.universityId ?? undefined);
  const { data: curriculum } = useCurriculum(majorId || undefined);
  const { data: savedGrades } = useGrades();
  const saveGrades = useSaveGrades();

  // Seed the table once from whatever the account already has stored.
  if (!hydrated && savedGrades && curriculum) {
    const byId = new Map(curriculum.subjects.map((s) => [s.id, s]));
    const seeded = savedGrades
      .map((grade): Row | null => {
        const subject = byId.get(grade.subjectId);
        if (!subject) return null;
        return {
          key: newKey(),
          subjectId: subject.id,
          code: subject.code,
          name: subject.name,
          credits: subject.credits,
          termNo: subject.termNo ?? null,
          score: grade.score10 === null ? '' : String(grade.score10),
        };
      })
      .filter((row): row is Row => row !== null);
    if (seeded.length) setRows(seeded);
    setHydrated(true);
  }

  const takenIds = new Set(rows.map((row) => row.subjectId).filter(Boolean));
  const available = (curriculum?.subjects ?? []).filter((s) => !takenIds.has(s.id));

  const entries = useMemo<GradeEntryInput[]>(
    () =>
      rows
        .filter((row) => row.score !== '' && Number.isFinite(Number(row.score)))
        .map((row) => ({
          subjectId: row.subjectId ?? row.key,
          subjectCode: row.code,
          subjectName: row.name,
          credits: row.credits,
          score10: Number(row.score),
          termNo: row.termNo,
        })),
    [rows],
  );

  const summary = useMemo(() => computeGpa(entries), [entries]);

  const curriculumCredits = curriculum?.subjects.reduce((sum, subject) => sum + subject.credits, 0);

  const target = Number(targetGpa);
  const planned = Number(plannedCredits);
  const requirement =
    Number.isFinite(target) && Number.isFinite(planned) && planned > 0
      ? requiredAverage(summary, planned, target)
      : null;

  const addFromCurriculum = (subjectId: string) => {
    const subject = curriculum?.subjects.find((s) => s.id === subjectId);
    if (!subject) return;
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        subjectId: subject.id,
        code: subject.code,
        name: subject.name,
        credits: subject.credits,
        termNo: subject.termNo ?? null,
        score: '',
      },
    ]);
  };

  const addBlank = () =>
    setRows((prev) => [
      ...prev,
      { key: newKey(), subjectId: null, code: '', name: '', credits: 3, termNo: null, score: '' },
    ]);

  const patch = (key: string, next: Partial<Row>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...next } : row)));

  const persist = async () => {
    const payload: SaveGradesInput = {
      entries: rows
        .filter((row) => row.subjectId)
        .map((row) => ({
          subjectId: row.subjectId!,
          score10: row.score === '' ? null : Number(row.score),
          termNo: row.termNo,
          inProgress: false,
        })),
    };
    if (!payload.entries.length) {
      toast.error('Chưa có gì để lưu', 'Chỉ môn chọn từ chương trình học mới lưu được.');
      return;
    }
    try {
      await saveGrades.mutateAsync(payload);
      toast.success('Đã lưu điểm', 'Công cụ kế hoạch học tập sẽ dùng luôn điểm này.');
    } catch (error) {
      toast.error('Không lưu được', toApiError(error).message);
    }
  };

  const exportCsv = () => {
    const header = 'Mã môn,Tên môn,Tín chỉ,Học kỳ,Điểm hệ 10,Điểm chữ,Điểm hệ 4\n';
    const body = entries
      .map((entry) => {
        const band = gradeBandFor(entry.score10 ?? 0);
        return [
          entry.subjectCode ?? '',
          `"${entry.subjectName ?? ''}"`,
          entry.credits,
          entry.termNo ?? '',
          entry.score10 ?? '',
          band.letter,
          band.gpa4,
        ].join(',');
      })
      .join('\n');
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'kaned-gpa.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tính GPA"
        subtitle="Nhập điểm hệ 10, Kaned quy đổi sang điểm chữ và hệ 4 theo thang của trường."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!entries.length}>
              Xuất CSV
            </Button>
            <Button icon={<Save className="size-4" />} onClick={persist} loading={saveGrades.isPending}>
              Lưu điểm
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="GPA hệ 4"
          value={summary.totalCredits ? summary.gpa4.toFixed(2) : '—'}
          hint={`${summary.earnedCredits}/${summary.totalCredits} tín chỉ đạt`}
          icon={<Calculator className="size-[18px]" />}
        />
        <StatCard label="Điểm trung bình hệ 10" value={summary.totalCredits ? summary.gpa10.toFixed(2) : '—'} hint="Trọng số theo tín chỉ" />
        <StatCard label="Tín chỉ tích luỹ" value={summary.earnedCredits} hint={`Trên ${curriculumCredits ?? '—'} tín chỉ toàn khoá`} />
        <Card>
          <CardBody>
            <p className="text-xs tracking-wide text-ink-4 uppercase">Xếp loại</p>
            <p className="mt-2">
              {summary.totalCredits ? (
                <Badge tone={toneFor(summary.classification.vi)}>{summary.classification.vi}</Badge>
              ) : (
                <span className="text-ink-4">Chưa có điểm</span>
              )}
            </p>
            <p className="mt-2 text-xs text-ink-3">
              {Object.entries(summary.letterCounts)
                .filter(([, count]) => count > 0)
                .map(([letter, count]) => `${count}×${letter}`)
                .join(' · ') || 'Nhập điểm để xem phân bố'}
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0">
          <CardHeader
            title="Bảng điểm"
            subtitle="Chọn môn từ chương trình học để lưu được, hoặc thêm dòng trống cho môn tự do."
            actions={
              <IconButton label="Xoá hết" onClick={() => setRows([])} disabled={!rows.length}>
                <RotateCcw className="size-[18px]" />
              </IconButton>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ngành" htmlFor="majorId">
                <Select id="majorId" value={majorId} onChange={(e) => setMajorId(e.target.value)}>
                  <option value="">Chọn ngành để lấy danh sách môn</option>
                  {majors.map((major) => (
                    <option key={major.id} value={major.id}>
                      {major.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Thêm môn từ chương trình học" htmlFor="addSubject">
                <Select
                  id="addSubject"
                  value=""
                  disabled={!available.length}
                  onChange={(e) => e.target.value && addFromCurriculum(e.target.value)}
                >
                  <option value="">{majorId ? 'Chọn môn để thêm' : 'Chọn ngành trước'}</option>
                  {available.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      HK{subject.termNo ?? '—'} · {subject.code} — {subject.name} ({subject.credits} TC)
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={<Calculator className="size-7" />}
                title="Bảng điểm đang trống"
                description="Chọn ngành rồi thêm các môn bạn đã học, hoặc thêm một dòng trống để nhập tay."
                action={
                  <Button variant="secondary" onClick={addBlank} icon={<Plus className="size-4" />}>
                    Thêm dòng trống
                  </Button>
                }
              />
            ) : (
              <>
                <div className="-mx-4 overflow-x-auto px-4">
                  <table className="w-full min-w-[620px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs tracking-wide text-ink-4 uppercase">
                        <th className="pb-2.5 font-semibold">Mã môn</th>
                        <th className="pb-2.5 font-semibold">Tên môn</th>
                        <th className="w-20 pb-2.5 text-center font-semibold">TC</th>
                        <th className="w-24 pb-2.5 text-center font-semibold">Điểm 10</th>
                        <th className="w-20 pb-2.5 text-center font-semibold">Chữ</th>
                        <th className="w-20 pb-2.5 text-center font-semibold">Hệ 4</th>
                        <th className="w-10 pb-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const score = Number(row.score);
                        const valid = row.score !== '' && Number.isFinite(score);
                        const band = valid ? gradeBandFor(score) : null;
                        return (
                          <tr key={row.key} className="border-b border-line last:border-b-0">
                            <td className="py-2 pr-2">
                              <Input
                                sizeVariant="sm"
                                value={row.code}
                                readOnly={Boolean(row.subjectId)}
                                onChange={(e) => patch(row.key, { code: e.target.value.toUpperCase() })}
                                placeholder="MAE101"
                                className={row.subjectId ? 'font-semibold' : undefined}
                                aria-label="Mã môn"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <Input
                                sizeVariant="sm"
                                value={row.name}
                                readOnly={Boolean(row.subjectId)}
                                onChange={(e) => patch(row.key, { name: e.target.value })}
                                placeholder="Tên môn học"
                                aria-label="Tên môn"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <Input
                                sizeVariant="sm"
                                type="number"
                                min={1}
                                max={12}
                                value={row.credits}
                                onChange={(e) => patch(row.key, { credits: Number(e.target.value) })}
                                className="tabular text-center"
                                aria-label="Tín chỉ"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <Input
                                sizeVariant="sm"
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                value={row.score}
                                onChange={(e) => patch(row.key, { score: e.target.value })}
                                className="tabular text-center"
                                placeholder="—"
                                aria-label="Điểm hệ 10"
                              />
                            </td>
                            <td className="py-2 text-center">
                              {band ? (
                                <span
                                  className={cn(
                                    'inline-grid h-7 min-w-9 place-items-center rounded-md px-1.5 text-[13px] font-bold',
                                    band.gpa4 >= 3.5
                                      ? 'bg-[color-mix(in_oklab,var(--color-ok)_14%,transparent)] text-[var(--color-ok)]'
                                      : band.gpa4 >= 2
                                        ? 'bg-brand-50 text-brand-700'
                                        : 'bg-[color-mix(in_oklab,var(--color-margin)_12%,transparent)] text-[var(--color-margin)]',
                                  )}
                                >
                                  {band.letter}
                                </span>
                              ) : (
                                <span className="text-ink-4">—</span>
                              )}
                            </td>
                            <td className="tabular py-2 text-center font-medium">
                              {band ? band.gpa4.toFixed(1) : <span className="text-ink-4">—</span>}
                            </td>
                            <td className="py-2 text-right">
                              <IconButton
                                label={`Xoá ${row.code || 'dòng'}`}
                                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                              >
                                <Trash2 className="size-4" />
                              </IconButton>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Button variant="secondary" size="sm" onClick={addBlank} icon={<Plus className="size-4" />}>
                  Thêm dòng
                </Button>
              </>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-[88px] lg:self-start">
          <Card>
            <CardHeader title="Cần bao nhiêu để đạt mục tiêu" />
            <CardBody className="space-y-3.5">
              <Field label="GPA mục tiêu" htmlFor="targetGpa">
                <Input
                  id="targetGpa"
                  type="number"
                  min={0}
                  max={4}
                  step={0.05}
                  value={targetGpa}
                  onChange={(e) => setTargetGpa(e.target.value)}
                  className="tabular"
                />
              </Field>
              <Field label="Tín chỉ kỳ tới" htmlFor="plannedCredits">
                <Input
                  id="plannedCredits"
                  type="number"
                  min={1}
                  max={30}
                  value={plannedCredits}
                  onChange={(e) => setPlannedCredits(e.target.value)}
                  className="tabular"
                />
              </Field>

              <div className="rounded-xl border border-line bg-paper-2 p-3.5">
                {requirement === null ? (
                  <p className="text-[13px] text-ink-3">Nhập mục tiêu và số tín chỉ để xem mức điểm cần thiết.</p>
                ) : requirement.needed <= 0 ? (
                  <p className="text-[13.5px] font-medium text-[var(--color-ok)]">
                    Bạn đã vượt mục tiêu — giữ nguyên phong độ là đủ.
                  </p>
                ) : !requirement.reachable ? (
                  <p className="text-[13.5px] font-medium text-[var(--color-margin)]">
                    Mục tiêu này không đạt được chỉ trong một kỳ. Hãy giãn ra nhiều kỳ hoặc nâng số tín chỉ.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-ink-4">Điểm hệ 4 trung bình cần đạt</p>
                    <p className="tabular mt-1 text-3xl font-semibold text-brand">{requirement.needed.toFixed(2)}</p>
                    <p className="mt-1.5 text-[12.5px] text-ink-3">
                      Tương đương khoảng{' '}
                      {requirement.needed >= 3.75
                        ? 'toàn A'
                        : requirement.needed >= 3.25
                          ? 'A và B+'
                          : requirement.needed >= 2.75
                            ? 'B+ và B'
                            : 'B và C+'}{' '}
                      cho {planned} tín chỉ.
                    </p>
                  </>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Thang quy đổi" />
            <CardBody>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-wide text-ink-4 uppercase">
                    <th className="pb-2 font-semibold">Hệ 10</th>
                    <th className="pb-2 font-semibold">Chữ</th>
                    <th className="pb-2 text-right font-semibold">Hệ 4</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_SCALE.map((step) => (
                    <tr key={step.letter} className="border-b border-line last:border-b-0">
                      <td className="tabular py-1.5">{step.min === 0 ? '< 4.0' : `≥ ${step.min.toFixed(1)}`}</td>
                      <td className="py-1.5 font-semibold">{step.letter}</td>
                      <td className="tabular py-1.5 text-right">{step.gpa4.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 flex gap-2 text-[12px] leading-relaxed text-ink-4">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Thang này theo quy chế phổ biến ở các trường Việt Nam. Trường bạn có thể khác, hãy đối chiếu quy chế trước
                khi dùng con số này cho hồ sơ.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
