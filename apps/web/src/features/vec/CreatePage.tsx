import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FileUp, Search, Shield, Sparkles } from 'lucide-react';
import {
  INTEGRITY_PRESETS, PRESET_HINT, PRESET_LABEL, RETAKE_MODE_LABEL, RETAKE_MODES, RETAKE_SCORING, RETAKE_SCORING_LABEL, computeEndsAt, defaultVecSettings, fmtDuration, fmtVnDate, fmtVnFull,
  fmtVnTime, foldVi, formatRoomCode, parseDeck, vnParts, vnToIso, vnToMs, MAX_DURATION_MIN, MIN_DURATION_MIN, MAX_RETAKES, type ResultRelease, type VecSessionDto, type VecSettings,
} from '@kaned/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { PageHead } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Feedback';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useServerTick } from './hooks';
import { vec, vecKeys, useHostDecks, type HostDeck } from './api';
import './vec.css';

const pad = (n: number) => String(n).padStart(2, '0');
function defaultStart() {
  const t = Date.now() + 20 * 60_000;
  const rounded = Math.ceil(t / (5 * 60_000)) * 5 * 60_000;
  const p = vnParts(rounded);
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}
/** A number box that keeps what you type but never hands on a value outside its range. */
export function NumberBox({ value, min, max, onChange, suffix, id }: { value: number; min: number; max: number; onChange: (n: number) => void; suffix?: string; id?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text.replace(/\D/g, '')) || min);
    const c = Math.max(min, Math.min(max, n));
    setText(String(c));
    onChange(c);
  };
  return (
    <div className="vec-num">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Giảm" disabled={value <= min}>−</button>
      <input id={id} inputMode="numeric" value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Tăng" disabled={value >= max}>+</button>
      {suffix && <span>{suffix}</span>}
    </div>
  );
}

const RELEASE: Array<[ResultRelease, string]> = [['AFTER_SUBMIT', 'Ngay sau khi nộp'], ['AFTER_END', 'Khi phiên kết thúc'], ['MANUAL', 'Khi tôi công bố'], ['NEVER', 'Không công bố']];

export default function CreatePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  useServerTick(30_000);
  const decks = useHostDecks();
  const [source, setSource] = useState<'deck' | 'md'>('deck');
  const [search, setSearch] = useState('');
  const [deck, setDeck] = useState<HostDeck | null>(null);
  const [md, setMd] = useState<{ name: string; text: string; count: number; chapters: number } | null>(null);
  const [mdErr, setMdErr] = useState('');
  const [chapters, setChapters] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [lecturer, setLecturer] = useState(user?.name ?? '');
  const [st, setSt] = useState(defaultStart);
  const [duration, setDuration] = useState(45);
  const [s, setS] = useState<VecSettings>(() => defaultVecSettings());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<VecSessionDto | null>(null);
  // The form is long: after creating, the page would stay scrolled down at the footer.
  useEffect(() => {
    if (created) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [created]);
  const [copied, setCopied] = useState('');

  const patch = <K extends Exclude<keyof VecSettings, 'settingsVersion'>>(k: K, v: Partial<VecSettings[K]>) => setS((p) => ({ ...p, [k]: { ...p[k], ...v } }));
  const available = md ? md.count : deck ? (chapters.length ? deck.chapters.filter((c) => chapters.includes(c.n)).reduce((n, c) => n + c.count, 0) + (chapters.includes(0) ? deck.unassigned : 0) : deck.questionCount) : 0;
  const count = Math.min(s.paper.questionCount, Math.max(available, 1));

  useEffect(() => {
    if (deck && !title) setTitle(`${deck.subjectCode} – Kiểm tra`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck]);
  useEffect(() => {
    if (available && s.paper.questionCount > available) patch('paper', { questionCount: available });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const filtered = useMemo(() => {
    const k = foldVi(search.trim());
    return (decks.data ?? []).filter((d) => !k || foldVi(`${d.title} ${d.subjectCode} ${d.subjectName}`).includes(k));
  }, [decks.data, search]);

  const startMs = vnToMs(st.date, st.time);
  const endsAt = Number.isFinite(startMs) ? computeEndsAt(startMs, duration, s.retake.max, s.retake.extendWindow) : NaN;
  const startErr = !Number.isFinite(startMs) ? 'Chọn ngày và giờ.' : startMs < Date.now() + 5 * 60_000 ? 'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.' : '';

  const readFile = async (f: File | undefined) => {
    setMdErr('');
    setMd(null);
    if (!f) return;
    if (f.size > 900_000) return setMdErr('File quá lớn (tối đa 900 KB).');
    const text = await f.text();
    const parsed = parseDeck(text);
    const errors = parsed.issues.filter((i) => i.level === 'error');
    if (errors.length) return setMdErr(`Dòng ${errors[0]!.line}: ${errors[0]!.message}`);
    if (!parsed.content.questions.length) return setMdErr('Không tìm thấy câu hỏi nào trong file.');
    setMd({ name: f.name, text, count: parsed.content.questions.length, chapters: parsed.content.chapters.length });
    if (!title) setTitle(parsed.meta.title ?? f.name.replace(/\.md$/i, ''));
  };

  const submit = async () => {
    setErr('');
    const f: Record<string, string> = {};
    if (!deck && !md) f.source = 'Chọn một bộ đề hoặc tải file .md.';
    if (title.trim().length < 3) f.title = 'Tiêu đề tối thiểu 3 ký tự.';
    if (startErr) f.startsAt = startErr;
    setFieldErr(f);
    if (Object.keys(f).length) return setErr('Còn thông tin chưa hợp lệ, xem các ô báo đỏ.');
    setBusy(true);
    try {
      const out = await vec.create({
        kind: 'FE',
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        lecturerDisplay: lecturer.trim() || undefined,
        deckId: md ? undefined : deck!.id,
        markdown: md?.text,
        startsAt: vnToIso(st.date, st.time),
        durationMin: duration,
        settings: { ...s, paper: { ...s.paper, questionCount: count, chapters: md ? [] : chapters } },
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
        <PageHead crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Giảng viên', to: '/app/vec/lecturer' }, { label: 'Đã tạo' }]} title="Phiên thi đã sẵn sàng" description="Đưa mã phòng cho sinh viên. Phòng chờ mở trước giờ thi theo thiết lập của bạn." />
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
                  <div className="vec-digits" aria-label={created.otp}>
                    {created.otp.split('').map((d, k) => <span key={k} className="vec-digit">{d}</span>)}
                  </div>
                  <p>Đọc mã này cho sinh viên ngay trong phòng thi, đừng đăng trước.</p>
                </section>
              )}
            </div>
            <dl className="vec-dl vec-card vec-done-info">
              <div><dt>Tiêu đề</dt><dd>{created.title}</dd></div>
              <div><dt>Bắt đầu</dt><dd>{fmtVnFull(created.startsAt)}</dd></div>
              <div><dt>Phòng chờ mở</dt><dd>{created.lobbyOpenMin} phút trước giờ thi</dd></div>
              <div><dt>Đóng phiên</dt><dd>{fmtVnFull(created.endsAt)}</dd></div>
              <div><dt>Số câu</dt><dd>{created.questionCount}</dd></div>
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
      <PageHead crumbs={[{ label: 'Phòng thi ảo', to: '/app/vec' }, { label: 'Giảng viên', to: '/app/vec/lecturer' }, { label: 'Tạo phiên thi' }]} title="Tạo phiên thi trắc nghiệm" description="Chọn đề, đặt giờ và mức giám sát. Bên phải là bản xem trước thẻ dự thi sinh viên sẽ thấy." />
      <div className="container vec-body">
        <div className="vec-create">
          <div className="vec-create-form">
            <section className="vec-card">
              <h2><span className="vec-n">1</span> Nguồn đề thi</h2>
              <div className="vec-seg" role="tablist">
                <button type="button" role="tab" aria-selected={source === 'deck'} className={cn(source === 'deck' && 'is-on')} onClick={() => setSource('deck')}>Bộ đề có sẵn</button>
                <button type="button" role="tab" aria-selected={source === 'md'} className={cn(source === 'md' && 'is-on')} onClick={() => setSource('md')}>Tải file .md</button>
              </div>
              {fieldErr.source && <p className="vec-err">{fieldErr.source}</p>}
              {source === 'deck' ? (
                <>
                  <Input icon={<Search className="ic" />} placeholder="Tìm theo tên đề hoặc mã môn" value={search} onChange={(e) => setSearch(e.target.value)} />
                  {decks.isLoading ? <Skeleton style={{ height: 120 }} /> : (
                    <ul className="vec-decks">
                      {filtered.map((d) => (
                        <li key={d.id}>
                          <button type="button" className={cn(deck?.id === d.id && 'is-on')} onClick={() => { setDeck(d); setMd(null); setChapters([]); }}>
                            <i style={{ background: d.color ?? 'var(--brand)' }} />
                            <span><b>{d.title}</b><small>{d.subjectCode} · {d.questionCount} câu · {d.chapters.length} chương</small></span>
                            {deck?.id === d.id && <Check className="ic" />}
                          </button>
                        </li>
                      ))}
                      {!filtered.length && <li className="vec-muted">Không có bộ đề nào khớp.</li>}
                    </ul>
                  )}
                  {deck && deck.chapters.length > 0 && (
                    <div className="vec-chapters">
                      <div className="vec-chapters-head"><b>Phạm vi chương</b><button type="button" className="vec-link" onClick={() => setChapters([])}>Lấy tất cả</button></div>
                      <div className="vec-chips">
                        {deck.chapters.map((c) => (
                          <button key={c.n} type="button" className={cn('vec-chip-btn', chapters.includes(c.n) && 'is-on')} onClick={() => setChapters((cs) => (cs.includes(c.n) ? cs.filter((x) => x !== c.n) : [...cs, c.n]))} aria-pressed={chapters.includes(c.n)}>
                            {c.name}<small>{c.count}</small>
                          </button>
                        ))}
                      </div>
                      <p className="vec-fine">{chapters.length ? `${available} câu trong phạm vi đã chọn.` : 'Không chọn chương nào: lấy cả bộ đề.'}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="vec-upload">
                  <label className="vec-drop">
                    <FileUp className="ic ic-lg" />
                    <b>{md ? md.name : 'Chọn file .md'}</b>
                    <small>{md ? `${md.count} câu, ${md.chapters} chương. File chỉ dùng để tạo phiên, không lưu thành bộ đề.` : 'Định dạng giống bộ đề trong Thẻ ghi nhớ'}</small>
                    <input type="file" accept=".md,text/markdown,text/plain" onChange={(e) => void readFile(e.target.files?.[0])} />
                  </label>
                  {mdErr && <p className="vec-err">{mdErr}</p>}
                </div>
              )}
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">2</span> Thông tin phiên</h2>
              <div className="vec-form2">
                <Field label="Tiêu đề" required error={fieldErr.title} className="vec-span2"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ví dụ: Giữa kỳ MLN122 – lớp SE1801" /></Field>
                <Field label="Tên giảng viên hiển thị"><Input value={lecturer} onChange={(e) => setLecturer(e.target.value)} maxLength={80} /></Field>
                <Field label="Hướng dẫn cho thí sinh" className="vec-span2"><textarea className="textarea" rows={3} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Ví dụ: Không dùng tài liệu. Làm bài trên máy tính." /></Field>
              </div>
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">3</span> Đề và thời gian</h2>
              <div className="vec-form3">
                <Field label={`Số câu (tối đa ${available || '…'})`}><NumberBox value={count} min={1} max={Math.max(available, 1)} onChange={(n) => patch('paper', { questionCount: n })} suffix="câu" /></Field>
                <Field label="Thời gian làm bài"><NumberBox value={duration} min={MIN_DURATION_MIN} max={MAX_DURATION_MIN} onChange={setDuration} suffix="phút" /></Field>
                <Field label="Phòng chờ mở trước"><NumberBox value={s.timing.lobbyOpenMin} min={0} max={60} onChange={(n) => patch('timing', { lobbyOpenMin: n })} suffix="phút" /></Field>
                <Field label="Ngày thi (GMT+7)" error={fieldErr.startsAt || startErr}><Input type="date" value={st.date} onChange={(e) => setSt({ ...st, date: e.target.value })} /></Field>
                <Field label="Giờ bắt đầu (GMT+7)"><Input type="time" value={st.time} onChange={(e) => setSt({ ...st, time: e.target.value })} /></Field>
                <Field label="Cho vào muộn tối đa"><NumberBox value={s.timing.lateJoinMin} min={0} max={MAX_DURATION_MIN} onChange={(n) => patch('timing', { lateJoinMin: n })} suffix="phút" /></Field>
              </div>
              <div className="vec-toggles">
                <Toggle label="Đảo thứ tự câu hỏi" on={s.paper.shuffleQuestions} onChange={(v) => patch('paper', { shuffleQuestions: v })} />
                <Toggle label="Đảo thứ tự đáp án" hint="Câu có “Tất cả các đáp án trên” luôn giữ nguyên." on={s.paper.shuffleOptions} onChange={(v) => patch('paper', { shuffleOptions: v })} />
                <Toggle label="Chia đều theo chương" on={s.paper.balanceByChapter} onChange={(v) => patch('paper', { balanceByChapter: v })} />
                <Toggle label="Mỗi nhóm câu biến thể chỉ lấy một câu" on={s.paper.dedupeVariants} onChange={(v) => patch('paper', { dedupeVariants: v })} />
              </div>
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">4</span> Làm lại</h2>
              <div className="vec-form3">
                <Field label="Số lần được làm lại"><NumberBox value={s.retake.max} min={0} max={MAX_RETAKES} onChange={(n) => patch('retake', { max: n })} suffix="lần" /></Field>
                {s.retake.max > 0 && (
                  <>
                    <Field label="Cách duyệt"><select className="input" value={s.retake.mode} onChange={(e) => patch('retake', { mode: e.target.value as VecSettings['retake']['mode'] })}>{RETAKE_MODES.map((m) => <option key={m} value={m}>{RETAKE_MODE_LABEL[m]}</option>)}</select></Field>
                    <Field label="Điểm tính cho môn"><select className="input" value={s.retake.scoring} onChange={(e) => patch('retake', { scoring: e.target.value as VecSettings['retake']['scoring'] })}>{RETAKE_SCORING.map((m) => <option key={m} value={m}>{RETAKE_SCORING_LABEL[m]}</option>)}</select></Field>
                    <Field label="Nghỉ giữa các lượt"><NumberBox value={s.retake.cooldownMin} min={0} max={60} onChange={(n) => patch('retake', { cooldownMin: n })} suffix="phút" /></Field>
                    <Field label="Giờ còn lại tối thiểu"><NumberBox value={s.retake.minRemainingMin} min={0} max={MAX_DURATION_MIN} onChange={(n) => patch('retake', { minRemainingMin: n })} suffix="phút" /></Field>
                  </>
                )}
              </div>
              {s.retake.max > 0 && <Toggle label="Kéo dài phiên theo số lượt" hint={`Phiên kết thúc lúc ${Number.isFinite(endsAt) ? fmtVnTime(endsAt) + ', ' + fmtVnDate(endsAt) : '…'} để ai cũng đủ giờ làm lại.`} on={s.retake.extendWindow} onChange={(v) => patch('retake', { extendWindow: v })} />}
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">5</span> Giám sát và truy cập</h2>
              <div className="vec-presets" role="radiogroup" aria-label="Mức giám sát">
                {INTEGRITY_PRESETS.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={s.integrity.preset === p} className={cn('vec-preset', s.integrity.preset === p && 'is-on')} onClick={() => patch('integrity', { preset: p })}>
                    <Shield className="ic" /><b>{PRESET_LABEL[p]}</b><small>{PRESET_HINT[p]}</small>
                  </button>
                ))}
              </div>
              <div className="vec-toggles">
                <Toggle label="Chặn sao chép nội dung đề" on={s.integrity.blockCopy} onChange={(v) => patch('integrity', { blockCopy: v })} />
                <Toggle label="Hình mờ tên thí sinh trên đề" on={s.integrity.watermark} onChange={(v) => patch('integrity', { watermark: v })} />
                <Toggle label="Chỉ cho thi trên máy tính" on={s.integrity.desktopOnly} onChange={(v) => patch('integrity', { desktopOnly: v })} />
                <Toggle label="Yêu cầu mã OTP khi vào phòng" hint="Hệ thống tự sinh OTP 6 số và hiện cho bạn sau khi tạo." on={s.access.otp} onChange={(v) => patch('access', { otp: v })} />
                <Toggle label="Bắt buộc nhập mã sinh viên" on={s.access.requireStudentCode} onChange={(v) => patch('access', { requireStudentCode: v })} />
              </div>
            </section>

            <section className="vec-card">
              <h2><span className="vec-n">6</span> Công bố kết quả</h2>
              <div className="vec-form3">
                <Field label="Điểm"><select className="input" value={s.results.score} onChange={(e) => patch('results', { score: e.target.value as ResultRelease })}>{RELEASE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Đúng/sai từng câu"><select className="input" value={s.results.rightWrong} onChange={(e) => patch('results', { rightWrong: e.target.value as ResultRelease })}>{RELEASE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Đáp án đúng"><select className="input" value={s.results.correctAnswers} onChange={(e) => patch('results', { correctAnswers: e.target.value as ResultRelease })}>{RELEASE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Điểm đạt (thang 10)"><NumberBox value={s.scoring.passMark} min={0} max={10} onChange={(n) => patch('scoring', { passMark: n })} /></Field>
              </div>
            </section>

            {err && <p className="vec-err vec-err-block" role="alert">{err}</p>}
            <div className="vec-row vec-submitbar">
              <Link className="btn btn-secondary" to="/app/vec/lecturer">Hủy</Link>
              <Button size="lg" loading={busy} onClick={submit} icon={<Sparkles className="ic" />}>Tạo phiên thi</Button>
            </div>
          </div>

          <aside className="vec-preview" aria-label="Xem trước thẻ dự thi">
            <div className="vec-admit">
              <div className="vec-admit-top" style={{ ['--uni' as string]: deck?.color ?? '#2448D8' }}><span>THẺ DỰ THI</span><b>000 0000</b></div>
              <div className="vec-admit-who"><span className="vec-avatar">SV</span><div><b>Họ và tên thí sinh</b><small>Mã sinh viên · Lớp</small></div></div>
              <h3>{title || 'Tiêu đề phiên thi'}</h3>
              <p className="vec-muted">{deck ? `${deck.subjectCode} · ${deck.subjectName}` : md ? md.name : 'Chưa chọn đề'}</p>
              <dl className="vec-dl vec-dl-tight">
                <div><dt>Giảng viên</dt><dd>{lecturer || '—'}</dd></div>
                <div><dt>Bắt đầu</dt><dd>{Number.isFinite(startMs) ? fmtVnFull(startMs) : '—'}</dd></div>
                <div><dt>Thời gian</dt><dd>{fmtDuration(duration * 60)}</dd></div>
                <div><dt>Số câu</dt><dd>{available ? `${count} câu` : '—'}</dd></div>
                <div><dt>Đóng phiên</dt><dd>{Number.isFinite(endsAt) ? fmtVnFull(endsAt) : '—'}</dd></div>
              </dl>
              <div className="vec-admit-foot">
                <span>Giám sát: {PRESET_LABEL[s.integrity.preset]}</span>
                <span>{s.retake.max > 0 ? `Làm lại tối đa ${s.retake.max} lần (${RETAKE_SCORING_LABEL[s.retake.scoring].toLowerCase()})` : 'Không làm lại'}</span>
                {s.access.otp && <span>Có mã OTP</span>}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="vec-toggle">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden />
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  );
}
