import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Dices, FolderUp, Sparkles, Trash2 } from 'lucide-react';
import {
  computeEndsAt, defaultVecSettings, fmtDuration, fmtVnFull, formatRoomCode, newExamCode, vnParts, vnToIso, vnToMs, MAX_DURATION_MIN, MIN_DURATION_MIN,
  PE_EXT_GROUPS, PE_MAX_MATERIAL_ITEMS, PE_MAX_PAPER_ITEMS, PE_RETENTION_DAYS, type ResultRelease, type VecSessionDto, type VecSettings, type PeSubmissionConfig,
} from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { PageHead } from '@/components/ui/Panel';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useServerTick } from '../hooks';
import { vec, vecKeys } from '../api';
import { NumberBox, Toggle } from '../CreatePage';
import { ItemPicker, type PickedItem } from './ItemPicker';
import '../vec.css';
import './pe.css';

const pad = (n: number) => String(n).padStart(2, '0');
function defaultStart() {
  const t = Date.now() + 20 * 60_000;
  const rounded = Math.ceil(t / (5 * 60_000)) * 5 * 60_000;
  const p = vnParts(rounded);
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}
const SCORE_RELEASE: Array<[ResultRelease, string]> = [['AFTER_SUBMIT', 'Ngay khi tôi chấm xong'], ['AFTER_END', 'Khi phiên kết thúc'], ['MANUAL', 'Khi tôi bấm công bố'], ['NEVER', 'Không hiện cho sinh viên']];
const defaultSubmission = (): PeSubmissionConfig => ({ allowFolder: true, allowFiles: true, allowedExts: [], maxSizeMb: 50, skipBuildDirs: true, keepVersions: 5, required: true });

export default function CreatePePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  useServerTick(30_000);
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [examCode, setExamCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [instructions, setInstructions] = useState('Làm bài trên máy tính của phòng thi. Lưu bài vào thư mục được hướng dẫn, nộp bằng nút Submit và có thể nộp lại; hệ thống giữ bản nộp mới nhất.');
  const [lecturer, setLecturer] = useState(user?.name ?? '');
  const [st, setSt] = useState(defaultStart);
  const [duration, setDuration] = useState(90);
  const [s, setS] = useState<VecSettings>(() => {
    const d = defaultVecSettings();
    return { ...d, integrity: { ...d.integrity, desktopOnly: true }, results: { ...d.results, score: 'AFTER_END' } };
  });
  const [paper, setPaper] = useState<PickedItem[]>([]);
  const [materials, setMaterials] = useState<PickedItem[]>([]);
  const [protect, setProtect] = useState({ noCopy: true, watermark: true });
  const [sub, setSub] = useState<PeSubmissionConfig>(defaultSubmission);
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<VecSessionDto | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (created) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [created]);

  const patch = <K extends Exclude<keyof VecSettings, 'settingsVersion'>>(k: K, v: Partial<VecSettings[K]>) => setS((p) => ({ ...p, [k]: { ...p[k], ...v } }));

  // The exam code follows the subject until the lecturer types their own.
  useEffect(() => {
    if (!codeTouched) setExamCode(subjectCode.trim() ? newExamCode(subjectCode) : '');
  }, [subjectCode, codeTouched]);
  useEffect(() => {
    if (!titleTouched) setTitle(subjectCode.trim() ? `${subjectCode.trim().toUpperCase()} – Thi thực hành` : '');
  }, [subjectCode, titleTouched]);

  const allowedExts = useMemo(() => PE_EXT_GROUPS.filter((g) => groups.includes(g.key)).flatMap((g) => g.exts), [groups]);
  const startMs = vnToMs(st.date, st.time);
  const endsAt = Number.isFinite(startMs) ? computeEndsAt(startMs, duration, 0, false) : NaN;
  const startErr = !Number.isFinite(startMs) ? 'Chọn ngày và giờ.' : startMs < Date.now() + 5 * 60_000 ? 'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.' : '';
  const uploading = [...paper, ...materials].some((x) => x.status === 'uploading');

  const submit = async () => {
    setErr('');
    const f: Record<string, string> = {};
    if (!subjectCode.trim()) f.subjectCode = 'Nhập mã môn, ví dụ PRM393.';
    if (!/^[A-Za-z0-9_\-.]{3,40}$/.test(examCode.trim())) f.examCode = 'Mã đề 3–40 ký tự: chữ, số, dấu _ - .';
    if (title.trim().length < 3) f.title = 'Tiêu đề tối thiểu 3 ký tự.';
    if (!paper.some((x) => x.status === 'ready')) f.paper = 'Thêm ít nhất một tệp đề thi.';
    if (!sub.allowFolder && !sub.allowFiles) f.submission = 'Cho phép nộp thư mục hoặc tệp (ít nhất một).';
    if (startErr) f.startsAt = startErr;
    setFieldErr(f);
    if (uploading) return setErr('Đợi các tệp tải lên xong đã.');
    if (Object.keys(f).length) return setErr('Còn thông tin chưa hợp lệ, xem các ô báo đỏ.');
    const item = (x: PickedItem) => (x.source === 'LIBRARY' ? { source: 'LIBRARY' as const, documentId: x.ref } : { source: 'UPLOAD' as const, fileId: x.ref });
    setBusy(true);
    try {
      const out = await vec.create({
        kind: 'PE',
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        lecturerDisplay: lecturer.trim() || undefined,
        subjectCode: subjectCode.trim().toUpperCase(),
        subjectName: subjectName.trim() || undefined,
        startsAt: vnToIso(st.date, st.time),
        durationMin: duration,
        settings: s,
        pe: {
          examCode: examCode.trim().toUpperCase(),
          paper: paper.filter((x) => x.status === 'ready').map(item),
          materials: materials.filter((x) => x.status === 'ready').map(item),
          protect,
          submission: { ...sub, allowedExts },
        },
      });
      void qc.invalidateQueries({ queryKey: vecKeys.hosted });
      void qc.invalidateQueries({ queryKey: vecKeys.me });
      setCreated(out);
    } catch (e) {
      const x = toApiError(e);
      setErr(x.message);
      if (x.fields) setFieldErr(x.fields);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      toast.error('Không sao chép được', 'Hãy chọn và chép thủ công.');
    }
  };

  if (created) {
    return (
      <>
        <PageHead crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Giảng viên', to: '/app/vec/lecturer' }, { label: 'Đã tạo' }]} title="Phòng thi thực hành đã sẵn sàng" description="Đưa mã phòng cho sinh viên. Bài nộp và tài liệu của phòng được giữ 7 ngày sau khi phiên kết thúc." />
        <div className="container vec-body">
          <div className="vec-done">
            <div className="vec-codes">
              <section className="vec-codecard" aria-label="Mã phòng">
                <header><span>Mã phòng</span>
                  <Button variant="secondary" size="sm" onClick={() => copy('code', created.roomCode)} icon={copied === 'code' ? <Check className="ic" /> : <Copy className="ic" />}>{copied === 'code' ? 'Đã chép' : 'Chép mã'}</Button>
                </header>
                <div className="vec-digits" aria-label={formatRoomCode(created.roomCode)}>
                  {created.roomCode.split('').map((d, k) => <span key={k} className={cn('vec-digit', k === 2 && 'has-gap')}>{d}</span>)}
                </div>
                <p>Sinh viên vào <b>Phòng thi ảo → Vào phòng thi</b> rồi nhập mã này.</p>
              </section>
              {created.otp && (
                <section className="vec-codecard is-otp" aria-label="Mã OTP">
                  <header><span>Mã OTP</span>
                    <Button variant="secondary" size="sm" onClick={() => copy('otp', created.otp!)} icon={copied === 'otp' ? <Check className="ic" /> : <Copy className="ic" />}>{copied === 'otp' ? 'Đã chép' : 'Chép OTP'}</Button>
                  </header>
                  <div className="vec-digits" aria-label={created.otp}>{created.otp.split('').map((d, k) => <span key={k} className="vec-digit">{d}</span>)}</div>
                  <p>Đọc mã này cho sinh viên ngay trong phòng thi, đừng đăng trước.</p>
                </section>
              )}
            </div>
            <dl className="vec-dl vec-card vec-done-info">
              <div><dt>Tiêu đề</dt><dd>{created.title}</dd></div>
              <div><dt>Mã đề</dt><dd className="vec-mono">{created.pe?.examCode}</dd></div>
              <div><dt>Bắt đầu</dt><dd>{fmtVnFull(created.startsAt)}</dd></div>
              <div><dt>Đóng phiên</dt><dd>{fmtVnFull(created.endsAt)}</dd></div>
              <div><dt>Đề thi</dt><dd>{created.pe?.paper.length} tệp · tài liệu kèm theo {created.pe?.materials.length} tệp</dd></div>
            </dl>
            <div className="vec-row">
              <Link className="btn btn-primary" to={`/app/vec/lecturer/${created.id}`}>Mở trang giám sát</Link>
              <Link className="btn btn-secondary" to="/app/vec/lecturer">Danh sách phiên</Link>
              <Button variant="ghost" onClick={() => copy('link', `${location.origin}/app/vec/student?code=${created.roomCode}`)} icon={copied === 'link' ? <Check className="ic" /> : <Copy className="ic" />}>{copied === 'link' ? 'Đã chép liên kết' : 'Chép liên kết vào phòng'}</Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Giảng viên', to: '/app/vec/lecturer' }, { label: 'Tạo phiên PE' }]}
        title="Tạo phiên thi thực hành (PE)"
        description="Sinh viên xem đề trong cửa sổ riêng, tải tài liệu kèm theo, làm bài trên máy rồi nộp thư mục bài làm. Bạn tải bài về và chấm điểm."
        actions={<Link to="/app/vec/lecturer/new" className="btn btn-secondary">Tạo phiên trắc nghiệm</Link>}
      />
      <div className="container vec-body">
        <div className="vec-create">
          <div className="vec-create-form">
            <section className="vec-card">
              <h2><span className="vec-n">1</span> Môn thi và mã đề</h2>
              <div className="vec-form2">
                <Field label="Mã môn" required error={fieldErr.subjectCode}><Input value={subjectCode} onChange={(e) => setSubjectCode(e.target.value.replace(/\s+/g, '').slice(0, 24))} placeholder="PRM393" /></Field>
                <Field label="Tên môn"><Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} maxLength={160} placeholder="Mobile Programming" /></Field>
                <Field label="Mã đề (Paper no)" required error={fieldErr.examCode} hint="Tự tạo từ mã môn và 4 ký tự ngẫu nhiên. Có thể sửa.">
                  <div className="pe-code">
                    <Input className="vec-mono" value={examCode} onChange={(e) => { setCodeTouched(true); setExamCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_\-.]/g, '').slice(0, 40)); }} placeholder="PRM393_PE_7KQ2" />
                    <button type="button" className="btn btn-secondary btn-icon" onClick={() => { setCodeTouched(false); setExamCode(newExamCode(subjectCode)); }} aria-label="Tạo mã đề khác" title="Tạo mã đề khác"><Dices className="ic" /></button>
                  </div>
                </Field>
                <Field label="Tên giảng viên hiển thị"><Input value={lecturer} onChange={(e) => setLecturer(e.target.value)} maxLength={80} /></Field>
                <Field label="Tên bài thi (Test name)" required error={fieldErr.title} className="vec-span2"><Input value={title} onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }} maxLength={160} placeholder="PRM393 – Thi thực hành – SE1801" /></Field>
                <Field label="Hướng dẫn nộp bài (Submit guide)" className="vec-span2"><textarea className="textarea" rows={3} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
              </div>
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">2</span> Đề thi</h2>
              <p className="vec-fine pe-sub">Sinh viên bấm <b>Show paper</b> để mở đề trong một cửa sổ riêng. Đề không có nút tải về và không lộ địa chỉ tệp.</p>
              <ItemPicker
                role="PAPER"
                items={paper}
                onChange={setPaper}
                max={PE_MAX_PAPER_ITEMS}
                onLibraryPick={(d) => {
                  if (!subjectCode) setSubjectCode(d.subjectCode);
                  if (!subjectName) setSubjectName(d.subjectName);
                }}
              />
              {fieldErr.paper && <p className="vec-err">{fieldErr.paper}</p>}
              <div className="vec-toggles">
                <Toggle label="Chặn sao chép nội dung đề" hint="Không bôi đen, không chuột phải, không kéo thả. Vẫn cuộn đọc bình thường." on={protect.noCopy} onChange={(v) => setProtect((p) => ({ ...p, noCopy: v }))} />
                <Toggle label="Hình mờ trên đề" hint="Chữ KANED và mã sinh viên mờ phủ trên đề, không che nội dung." on={protect.watermark} onChange={(v) => setProtect((p) => ({ ...p, watermark: v }))} />
              </div>
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">3</span> Tài liệu kèm theo <small className="pe-opt">không bắt buộc</small></h2>
              <p className="vec-fine pe-sub">Thư mục mã nguồn mẫu, cơ sở dữ liệu, ảnh… Sinh viên tải về bằng nút <b>Download given materials</b>. Nhiều tệp hoặc cả thư mục thì nên nén thành .zip.</p>
              <ItemPicker role="MATERIAL" items={materials} onChange={setMaterials} max={PE_MAX_MATERIAL_ITEMS} />
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">4</span> Thời gian</h2>
              <div className="vec-form3">
                <Field label="Ngày thi (GMT+7)" error={fieldErr.startsAt || startErr}><Input type="date" value={st.date} onChange={(e) => setSt({ ...st, date: e.target.value })} /></Field>
                <Field label="Giờ bắt đầu (GMT+7)"><Input type="time" value={st.time} onChange={(e) => setSt({ ...st, time: e.target.value })} /></Field>
                <Field label="Thời gian làm bài"><NumberBox value={duration} min={MIN_DURATION_MIN} max={MAX_DURATION_MIN} onChange={setDuration} suffix="phút" /></Field>
                <Field label="Phòng chờ mở trước"><NumberBox value={s.timing.lobbyOpenMin} min={0} max={60} onChange={(n) => patch('timing', { lobbyOpenMin: n })} suffix="phút" /></Field>
                <Field label="Cho vào muộn tối đa"><NumberBox value={s.timing.lateJoinMin} min={0} max={MAX_DURATION_MIN} onChange={(n) => patch('timing', { lateJoinMin: n })} suffix="phút" /></Field>
              </div>
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">5</span> Nộp bài</h2>
              {fieldErr.submission && <p className="vec-err">{fieldErr.submission}</p>}
              <div className="vec-toggles">
                <Toggle label="Nộp cả thư mục bài làm" hint="Trình duyệt nén thư mục thành .zip rồi gửi, giữ nguyên cấu trúc thư mục." on={sub.allowFolder} onChange={(v) => setSub((p) => ({ ...p, allowFolder: v }))} />
                {sub.allowFolder && <Toggle label="Bỏ qua thư mục build và thư viện" hint="bin, obj, node_modules, .git, .vs, build, target… Bài nhẹ hơn, nộp nhanh hơn." on={sub.skipBuildDirs} onChange={(v) => setSub((p) => ({ ...p, skipBuildDirs: v }))} />}
                <Toggle label="Nộp từng tệp" on={sub.allowFiles} onChange={(v) => setSub((p) => ({ ...p, allowFiles: v }))} />
                <Toggle label="Bắt buộc nộp bài trước khi đóng phòng" on={sub.required} onChange={(v) => setSub((p) => ({ ...p, required: v }))} />
              </div>
              {sub.allowFiles && (
                <div className="pe-exts">
                  <b>Loại tệp được nộp</b>
                  <div className="vec-chips">
                    <button type="button" className={cn('vec-chip-btn', !groups.length && 'is-on')} aria-pressed={!groups.length} onClick={() => setGroups([])}>Mọi loại</button>
                    {PE_EXT_GROUPS.map((g) => (
                      <button key={g.key} type="button" className={cn('vec-chip-btn', groups.includes(g.key) && 'is-on')} aria-pressed={groups.includes(g.key)} onClick={() => setGroups((p) => (p.includes(g.key) ? p.filter((x) => x !== g.key) : [...p, g.key]))} title={g.exts.map((e) => `.${e}`).join(' ')}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <p className="vec-fine">{groups.length ? allowedExts.map((e) => `.${e}`).join(' ') : 'Mọi loại trừ tệp chạy được (.exe, .bat, .msi, .ps1…), luôn bị chặn.'}</p>
                </div>
              )}
              <div className="vec-form3">
                <Field label="Dung lượng tối đa mỗi lần nộp"><NumberBox value={sub.maxSizeMb} min={1} max={100} onChange={(n) => setSub((p) => ({ ...p, maxSizeMb: n }))} suffix="MB" /></Field>
                <Field label="Giữ lại số bản nộp gần nhất"><NumberBox value={sub.keepVersions} min={1} max={10} onChange={(n) => setSub((p) => ({ ...p, keepVersions: n }))} suffix="bản" /></Field>
              </div>
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">6</span> Truy cập và điểm</h2>
              <div className="vec-toggles">
                <Toggle label="Yêu cầu mã OTP khi vào phòng" hint="Hệ thống tự sinh OTP 6 số và hiện cho bạn sau khi tạo." on={s.access.otp} onChange={(v) => patch('access', { otp: v })} />
                <Toggle label="Bắt buộc nhập mã sinh viên" on={s.access.requireStudentCode} onChange={(v) => patch('access', { requireStudentCode: v })} />
                <Toggle label="Chỉ cho thi trên máy tính" on={s.integrity.desktopOnly} onChange={(v) => patch('integrity', { desktopOnly: v })} />
              </div>
              <div className="vec-form3">
                <Field label="Hiện điểm và ghi chú cho sinh viên"><select className="input" value={s.results.score} onChange={(e) => patch('results', { score: e.target.value as ResultRelease })}>{SCORE_RELEASE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Điểm đạt (thang 10)"><NumberBox value={s.scoring.passMark} min={0} max={10} onChange={(n) => patch('scoring', { passMark: n })} /></Field>
              </div>
              <p className="pe-retention"><Trash2 className="ic ic-sm" /> <span>Đề tải lên, tài liệu kèm theo và mọi bài nộp tự xóa <b>{PE_RETENTION_DAYS} ngày</b> sau khi phiên kết thúc. Xóa phiên thì xóa ngay, không khôi phục được. Tài liệu chọn từ kho vẫn ở trong kho.</span></p>
            </section>

            {err && <p className="vec-err vec-err-block" role="alert">{err}</p>}
            <div className="vec-row vec-submitbar">
              <Link className="btn btn-secondary" to="/app/vec/lecturer">Hủy</Link>
              <Button size="lg" loading={busy} disabled={uploading} onClick={submit} icon={<Sparkles className="ic" />}>{uploading ? 'Đang tải tệp lên…' : 'Tạo phòng thi PE'}</Button>
            </div>
          </div>

          <aside className="vec-preview" aria-label="Xem trước màn hình nộp bài">
            <div className="pe-mini">
              <div className="pe-mini-top"><span>Submit Solution</span><i /><i /><i /></div>
              <dl>
                <div><dt>Test name</dt><dd>{title || '—'}</dd></div>
                <div><dt>Student</dt><dd>Họ tên · Mã SV</dd></div>
                <div><dt>Paper no</dt><dd className="vec-mono">{examCode || '—'}</dd></div>
              </dl>
              <div className="pe-mini-btns">
                <span className="is-primary">Show paper</span>
                <span className={cn(!materials.length && 'is-off')}>Download given materials</span>
              </div>
              <div className="pe-mini-step"><FolderUp className="ic ic-sm" /> {sub.allowFolder ? 'Chọn thư mục bài làm' : 'Chọn tệp bài làm'} · tối đa {sub.maxSizeMb} MB</div>
              <ul className="pe-mini-meta">
                <li><span>Bắt đầu</span><b>{Number.isFinite(startMs) ? fmtVnFull(startMs) : '—'}</b></li>
                <li><span>Thời gian</span><b>{fmtDuration(duration * 60)}</b></li>
                <li><span>Đóng phiên</span><b>{Number.isFinite(endsAt) ? fmtVnFull(endsAt) : '—'}</b></li>
                <li><span>Đề thi</span><b>{paper.length} tệp</b></li>
                <li><span>Tài liệu kèm</span><b>{materials.length} tệp</b></li>
              </ul>
              <p className="pe-mini-warn">If you close this window without proctor&apos;s agreement, you will get ZERO.</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
