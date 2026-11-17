import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CircleAlert, Download, Eye, EyeOff, FileText, FileUp, Layers, Pencil, Plus, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { DECK_TEMPLATE, parseDeck, type AdminDeckDto, type DeckStatus } from '@kaned/shared';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { useSubjects, useUniversities } from '@/features/catalog/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtInt } from '@/lib/format';
import { useCreateDeck, useDeckAdmin, useDecksAdmin, useDeleteDeck, useUpdateDeck } from './api';
import { ActionMenu, AdminHead, ConfirmDialog, EmptyBlock, EmptyRow, SearchBox, Sheet, TableSkeleton, UniMark, useDebounced, type ConfirmState } from './ui';
import { useAdminCrumbs } from './AdminShell';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const fileName = (d: Pick<AdminDeckDto, 'subject' | 'title'>) =>
  `${d.subject.code}-${d.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 50)}.md`;

/**
 * Bộ đề ôn tập: study decks for the "Thẻ ghi nhớ" module, each one a Kaned
 * deck file (.md) attached to a subject.
 */
export function DecksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const { data = [], isLoading } = useDecksAdmin({ q: query || undefined });
  const update = useUpdateDeck();
  const remove = useDeleteDeck();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const editing = params.get('edit');
  const creating = params.get('new') === '1';
  useAdminCrumbs([{ label: 'Bộ đề ôn tập' }]);

  const close = () => setParams({}, { replace: true });
  const learners = data.reduce((s, d) => s + d.learners, 0);

  return (
    <>
      <AdminHead
        title="Bộ đề ôn tập"
        count={data.length}
        description="Bộ đề cho mục Thẻ ghi nhớ. Mỗi bộ đề là một file .md theo định dạng Kaned, gắn với một môn học."
        actions={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('mau-bo-de-kaned.md', DECK_TEMPLATE)}>
              <Download className="ic ic-sm" />
              Tải file mẫu
            </button>
            {isAdmin && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setParams({ new: '1' })}>
                <Plus className="ic ic-sm" />
                Nhập bộ đề
              </button>
            )}
          </>
        }
      />

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-top">
            Bộ đề
            <Layers className="ic" />
          </span>
          <b>{fmtInt(data.length)}</b>
          <small>{fmtInt(data.filter((d) => d.status === 'PUBLISHED').length)} đang hiện cho sinh viên</small>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-top">
            Câu hỏi
            <FileText className="ic" />
          </span>
          <b>{fmtInt(data.reduce((s, d) => s + d.questionCount, 0))}</b>
          <small>{fmtInt(data.reduce((s, d) => s + d.tipCount, 0))} mẹo nhớ</small>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-top">
            Lượt người học
            <Eye className="ic" />
          </span>
          <b>{fmtInt(learners)}</b>
          <small>Tài khoản đã mở ít nhất một bộ đề</small>
        </div>
      </div>

      <section className="adm-panel">
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm theo tên bộ đề, mã môn…" />
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Bộ đề</th>
                <th>Môn</th>
                <th className="num">Câu</th>
                <th className="num">Mẹo</th>
                <th className="num">Người học</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={8} />
              ) : !data.length ? (
                <EmptyRow cols={8}>
                  <EmptyBlock
                    icon={Layers}
                    title={query ? 'Không có bộ đề nào khớp' : 'Chưa có bộ đề nào'}
                    text={query ? undefined : 'Tải file mẫu, viết câu hỏi theo mẫu rồi bấm “Nhập bộ đề”.'}
                  />
                </EmptyRow>
              ) : (
                data.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b className="clamp-1">{d.title}</b>
                      {d.description && <small className="muted clamp-1">{d.description}</small>}
                    </td>
                    <td>
                      <span className="dke-subj">
                        <UniMark u={d.subject.university} size={20} />
                        <b>{d.subject.code}</b>
                      </span>
                    </td>
                    <td className="num">{fmtInt(d.questionCount)}</td>
                    <td className="num">{fmtInt(d.tipCount)}</td>
                    <td className="num">{fmtInt(d.learners)}</td>
                    <td>
                      <span className={cn('badge', d.status === 'PUBLISHED' ? 'badge-green' : 'badge-amber')}>{d.status === 'PUBLISHED' ? 'Đang hiện' : 'Bản nháp'}</span>
                    </td>
                    <td className="muted">{fmtDate(d.updatedAt)}</td>
                    <td className="row-actions">
                      <ActionMenu
                        items={[
                          { label: 'Mở như sinh viên', icon: Eye, onSelect: () => navigate(`/app/flashcards/${d.id}`) },
                          { label: 'Sửa / thay file', icon: Pencil, onSelect: () => setParams({ edit: d.id }), hidden: !isAdmin },
                          { label: 'Tải file .md', icon: Download, onSelect: () => void exportDeck(d) },
                          {
                            label: d.status === 'PUBLISHED' ? 'Ẩn khỏi sinh viên' : 'Hiện cho sinh viên',
                            icon: d.status === 'PUBLISHED' ? EyeOff : Eye,
                            hidden: !isAdmin,
                            onSelect: () =>
                              update
                                .mutateAsync({ id: d.id, input: { status: d.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' } })
                                .then(() => toast.success(d.status === 'PUBLISHED' ? 'Đã ẩn bộ đề' : 'Đã hiện bộ đề'))
                                .catch((e) => toast.error('Không đổi được', toApiError(e).message)),
                          },
                          'separator',
                          {
                            label: 'Xoá bộ đề',
                            icon: Trash2,
                            danger: true,
                            hidden: !isAdmin,
                            onSelect: () =>
                              setConfirm({
                                title: `Xoá “${d.title}”?`,
                                body: `Bộ đề và tiến độ học của ${fmtInt(d.learners)} người sẽ bị xoá. Nên tải file .md về trước để giữ bản gốc.`,
                                confirmLabel: 'Xoá bộ đề',
                                typeToConfirm: d.subject.code,
                                run: () => remove.mutateAsync(d.id).then(() => toast.success('Đã xoá bộ đề')),
                              }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <DeckEditor open={creating || Boolean(editing)} id={editing} onClose={close} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );

  async function exportDeck(d: AdminDeckDto) {
    try {
      const { http } = await import('@/lib/api');
      const full = (await http.get<{ source: string }>(`/admin/decks/${d.id}`)).data;
      download(fileName(d), full.source);
    } catch (e) {
      toast.error('Không tải được file', toApiError(e).message);
    }
  }
}

/* ─────────────────────────────── editor ─────────────────────────────── */

function DeckEditor({ open, id, onClose }: { open: boolean; id: string | null; onClose: () => void }) {
  const toast = useToast();
  const { data: existing, isLoading } = useDeckAdmin(id ?? undefined);
  const create = useCreateDeck();
  const update = useUpdateDeck();
  const [source, setSource] = useState('');
  const [fileLabel, setFileLabel] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<DeckStatus>('PUBLISHED');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const touched = useRef({ title: false, description: false, subject: false });

  // Reset when opened; fill from the deck when editing.
  useEffect(() => {
    if (!open) return;
    touched.current = { title: false, description: false, subject: false };
    setFileLabel('');
    setDrag(false);
    if (!id) {
      setSource('');
      setUniversityId('');
      setSubjectId('');
      setTitle('');
      setDescription('');
      setStatus('PUBLISHED');
    }
  }, [open, id]);
  useEffect(() => {
    if (!open || !existing) return;
    touched.current = { title: true, description: true, subject: true };
    setSource(existing.source);
    setUniversityId(existing.subject.university.id);
    setSubjectId(existing.subject.id);
    setTitle(existing.title);
    setDescription(existing.description ?? '');
    setStatus(existing.status);
  }, [open, existing]);

  // Parsing a large file on every keystroke would lag; wait for a pause.
  const [parsedSource, setParsedSource] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setParsedSource(source), source.length > 50_000 ? 350 : 120);
    return () => window.clearTimeout(t);
  }, [source]);
  const parsed = useMemo(() => (parsedSource.trim() ? parseDeck(parsedSource) : null), [parsedSource]);
  const errors = parsed?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = parsed?.issues.filter((i) => i.level === 'warning') ?? [];

  // The file's own "môn:", "tên:", "mô tả:" fill the form unless already set by hand.
  const { data: universities = [] } = useUniversities();
  const metaCode = parsed?.meta.subject?.trim();
  const { data: codeMatches } = useSubjects({ q: metaCode, pageSize: 20 }, { enabled: Boolean(open && metaCode && !touched.current.subject) });
  useEffect(() => {
    if (!parsed) return;
    if (!touched.current.title && parsed.meta.title) setTitle(parsed.meta.title);
    if (!touched.current.description && parsed.meta.description) setDescription(parsed.meta.description);
  }, [parsed]);
  useEffect(() => {
    if (touched.current.subject || !metaCode || !codeMatches) return;
    const exact = codeMatches.items.filter((s) => s.code.toLowerCase() === metaCode.toLowerCase());
    if (exact.length === 1) {
      setUniversityId(exact[0].universityId);
      setSubjectId(exact[0].id);
    }
  }, [codeMatches, metaCode]);
  const { data: subjectPage } = useSubjects({ universityId: universityId || undefined, pageSize: 200 }, { enabled: Boolean(universityId) });

  const readFile = async (file: File) => {
    if (file.size > 950_000) return toast.error('File quá lớn', 'Tối đa khoảng 900 KB. Hãy tách thành nhiều bộ đề.');
    setSource(await file.text());
    setFileLabel(`${file.name} · ${fmtInt(Math.round(file.size / 1024))} KB`);
  };

  const busy = create.isPending || update.isPending;
  const save = async () => {
    if (!parsed || errors.length) return toast.error('File còn lỗi', 'Sửa các dòng được đánh dấu đỏ rồi lưu lại.');
    if (!subjectId) return toast.error('Chưa chọn môn', 'Chọn trường và môn mà bộ đề thuộc về.');
    if (title.trim().length < 3) return toast.error('Thiếu tên bộ đề', 'Đặt tên cho bộ đề, ví dụ “Ôn thi cuối kỳ MLN122”.');
    try {
      if (id && existing) {
        await update.mutateAsync({
          id,
          input: {
            subjectId,
            title: title.trim(),
            description: description.trim() || null,
            status,
            ...(source !== existing.source ? { source } : {}),
          },
        });
        toast.success('Đã lưu bộ đề', `${fmtInt(parsed.content.questions.length)} câu, ${fmtInt(parsed.content.tips.length)} mẹo.`);
      } else {
        await create.mutateAsync({ subjectId, source, title: title.trim(), description: description.trim() || null, status });
        toast.success('Đã nhập bộ đề', `${fmtInt(parsed.content.questions.length)} câu, ${fmtInt(parsed.content.tips.length)} mẹo — ${status === 'PUBLISHED' ? 'sinh viên đã thấy trong Thẻ ghi nhớ' : 'đang là bản nháp'}.`);
      }
      onClose();
    } catch (e) {
      toast.error('Không lưu được', toApiError(e).message);
    }
  };

  const c = parsed?.content;
  const multi = c?.questions.filter((q) => q.answers.length > 1).length ?? 0;
  const warn = c?.questions.filter((q) => q.warning).length ?? 0;
  const variants = c?.questions.filter((q) => q.parent).length ?? 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={id ? 'Sửa bộ đề' : 'Nhập bộ đề'}
      description={id ? existing?.title : 'Chọn file .md theo định dạng Kaned, hoặc dán nội dung vào ô bên dưới.'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className={cn('btn btn-primary', busy && 'is-loading')} onClick={save} disabled={busy || !parsed || errors.length > 0}>
            {id ? 'Lưu thay đổi' : 'Nhập bộ đề'}
          </button>
        </>
      }
    >
      {id && isLoading ? (
        <p className="muted">Đang tải bộ đề…</p>
      ) : (
        <div className="dke">
          <div
            className={cn('dke-drop', drag && 'is-drag')}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void readFile(f);
            }}
          >
            <FileUp className="ic" />
            <div>
              <b>{fileLabel || (id ? 'Thay bằng file mới' : 'Kéo file .md vào đây')}</b>
              <small>File văn bản theo định dạng bộ đề Kaned (.md hoặc .txt)</small>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}>
              <Upload className="ic ic-sm" />
              Chọn file
            </button>
            <input
              ref={input}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="dke-src">
              Nội dung bộ đề
            </label>
            <textarea id="dke-src" className="textarea dke-src" spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} placeholder={DECK_TEMPLATE.slice(0, 420) + '…'} />
          </div>

          {parsed && (
            <div className={cn('dke-check', errors.length ? 'is-bad' : 'is-ok')}>
              <div className="dke-sum">
                {errors.length ? <CircleAlert className="ic" /> : <Layers className="ic" />}
                <div>
                  <b>{errors.length ? `${fmtInt(errors.length)} lỗi cần sửa trước khi lưu` : 'File hợp lệ'}</b>
                  <span>
                    {fmtInt(c!.questions.length)} câu
                    {variants ? ` (${fmtInt(variants)} kiểu hỏi khác)` : ''} · {fmtInt(c!.tips.length)} mẹo · {fmtInt(c!.chapters.length)} chương
                    {multi ? ` · ${fmtInt(multi)} câu nhiều đáp án` : ''}
                    {warn ? ` · ${fmtInt(warn)} lưu ý đáp án` : ''}
                  </span>
                </div>
              </div>
              {(errors.length > 0 || warnings.length > 0) && (
                <ul className="dke-issues">
                  {[...errors, ...warnings].slice(0, 60).map((x, i) => (
                    <li key={i} className={x.level === 'error' ? 'is-err' : 'is-warn'}>
                      {x.level === 'error' ? <CircleAlert className="ic ic-xs" /> : <TriangleAlert className="ic ic-xs" />}
                      <span>Dòng {x.line}</span>
                      {x.message}
                    </li>
                  ))}
                  {errors.length + warnings.length > 60 && <li className="muted">… và {errors.length + warnings.length - 60} dòng khác</li>}
                </ul>
              )}
              {c!.chapters.length > 0 && !errors.length && (
                <ol className="dke-chapters">
                  {c!.chapters.map((ch) => (
                    <li key={ch.n}>
                      <span>{ch.n ? `Chương ${ch.n}` : '—'}</span>
                      {ch.name}
                      <small>
                        {fmtInt(c!.questions.filter((q) => q.chapter === ch.n).length)} câu · {fmtInt(c!.tips.filter((t) => t.chapter === ch.n).length)} mẹo
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="dke-uni">
                Trường <span className="req">*</span>
              </label>
              <SearchSelect
                id="dke-uni"
                value={universityId}
                placeholder="Chọn trường"
                searchPlaceholder="Gõ tên hoặc mã trường…"
                options={universities.map((u) => ({ value: u.id, code: u.code, label: u.nameVi, keywords: u.name }))}
                onChange={(v) => {
                  touched.current.subject = true;
                  setUniversityId(v);
                  setSubjectId('');
                }}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="dke-subject">
                Môn học <span className="req">*</span>
              </label>
              <SearchSelect
                id="dke-subject"
                value={subjectId}
                disabled={!universityId}
                placeholder={universityId ? 'Chọn môn' : 'Chọn trường trước'}
                searchPlaceholder="Gõ mã môn, vd. MLN122"
                options={(subjectPage?.items ?? []).map((s) => ({ value: s.id, code: s.code, label: s.nameVi, keywords: s.name }))}
                onChange={(v) => {
                  touched.current.subject = true;
                  setSubjectId(v);
                }}
              />
              {metaCode && !subjectId && <p className="hint">File ghi môn “{metaCode}” nhưng chưa tìm thấy đúng một môn có mã này — hãy chọn tay.</p>}
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="dke-title">
              Tên bộ đề <span className="req">*</span>
            </label>
            <input
              id="dke-title"
              className="input"
              value={title}
              maxLength={160}
              onChange={(e) => {
                touched.current.title = true;
                setTitle(e.target.value);
              }}
              placeholder="Ôn thi cuối kỳ MLN122"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="dke-desc">
              Mô tả
            </label>
            <textarea
              id="dke-desc"
              className="textarea"
              rows={2}
              maxLength={600}
              value={description}
              onChange={(e) => {
                touched.current.description = true;
                setDescription(e.target.value);
              }}
              placeholder="Bộ đề gồm những gì, dùng cho kỳ thi nào"
            />
          </div>
          <div className="field">
            <span className="label">Hiển thị</span>
            <div className="seg">
              <button type="button" aria-pressed={status === 'PUBLISHED'} onClick={() => setStatus('PUBLISHED')}>
                Hiện cho sinh viên
              </button>
              <button type="button" aria-pressed={status === 'DRAFT'} onClick={() => setStatus('DRAFT')}>
                Bản nháp
              </button>
            </div>
            {id && <p className="hint">Tiến độ của người học được giữ theo số câu. Đổi số của một câu thì tiến độ của câu đó bắt đầu lại.</p>}
          </div>

          <details className="dke-guide">
            <summary>Cách viết file bộ đề</summary>
            <ul>
              <li>
                Phần đầu file giữa hai dòng <code>---</code>: <code>môn:</code> mã môn, <code>tên:</code>, <code>mô tả:</code>.
              </li>
              <li>
                <code># Chương 3: Tên chương</code> mở một chương. Không có chương cũng được.
              </li>
              <li>
                <code>## Câu 12</code> mở một câu; dòng sau là câu hỏi. Mỗi phương án một dòng <code>- [ ]</code>, đáp án đúng là <code>- [x]</code> (nhiều đáp án thì đánh dấu nhiều dòng).
              </li>
              <li>
                <code>## Câu 12.1</code> là kiểu hỏi khác của câu 12.
              </li>
              <li>
                Dòng bắt đầu bằng <code>&gt;</code>: <code>&gt; Ghi chú:</code>, <code>&gt; Đề khác:</code> (đề khác dùng đáp án khác), <code>&gt; Hỏi cách khác: câu hỏi → đáp án</code>,{' '}
                <code>&gt; Lưu ý đáp án:</code> (luôn hiện cho người học).
              </li>
              <li>
                <code>## Mẹo 4: Tên mẹo</code> rồi nội dung, <code>**chữ đậm**</code> cho từ khoá. Câu dùng mẹo ghi <code>Mẹo: 4</code>; câu dễ nhầm ghi <code>Dễ nhầm: 8, 9</code>.
              </li>
            </ul>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('mau-bo-de-kaned.md', DECK_TEMPLATE)}>
              <Download className="ic ic-sm" />
              Tải file mẫu
            </button>
          </details>
        </div>
      )}
    </Sheet>
  );
}
