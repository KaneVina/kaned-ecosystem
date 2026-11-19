import { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, ExternalLink, Pencil, Plus, SearchX, Trash2, UsersRound, X } from 'lucide-react';
import {
  LECTURER_GENDERS,
  LECTURER_GENDER_LABELS,
  LECTURER_LINK_LABELS,
  lecturerInputSchema,
  lecturerLinkKind,
  parseLecturerSheet,
  type LecturerDto,
  type LecturerGender,
} from '@kaned/shared';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { LecturerAvatar } from '@/features/lecturers/LecturerProfile';
import { useDeleteLecturer, useImportLecturers, useLecturersAdmin, useSaveLecturer, useUniversitiesAdmin } from './api';
import { ActionMenu, AdminHead, ConfirmDialog, Dialog, EmptyBlock, EmptyRow, Pager, SearchBox, Sheet, TableSkeleton, useDebounced, type ConfirmState } from './ui';
import { useAdminCrumbs } from './AdminShell';
import '@/features/lecturers/lecturers.css';

export function LecturersPage() {
  const toast = useToast();
  const { data: universities = [] } = useUniversitiesAdmin();
  const [q, setQ] = useState('');
  const [uni, setUni] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, isLoading } = useLecturersAdmin({ q: dq || undefined, universityId: uni || undefined, page, pageSize: 25 });
  const remove = useDeleteLecturer();
  const [editing, setEditing] = useState<LecturerDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  useAdminCrumbs([{ label: 'Giảng viên' }]);
  useEffect(() => setPage(1), [dq, uni]);

  const askDelete = (l: LecturerDto) =>
    setConfirm({
      title: `Xoá ${l.fullName}?`,
      body: (
        <>
          Hồ sơ <b>{l.code}</b> bị xoá khỏi danh bạ.
          {l.documentCount > 0 && ` ${l.documentCount} tài liệu đang gắn với giảng viên này vẫn giữ tên, nhưng không mở được hồ sơ nữa.`}
        </>
      ),
      confirmLabel: 'Xoá giảng viên',
      run: () =>
        remove.mutateAsync(l.id).then(
          () => toast.success('Đã xoá giảng viên', l.fullName),
          (e) => {
            toast.error('Không xoá được', toApiError(e).message);
            throw e;
          },
        ),
    });

  return (
    <>
      <AdminHead
        title="Giảng viên"
        count={data?.total}
        description="Danh bạ cho công cụ Tra cứu giảng viên. Người đăng tài liệu chọn giảng viên từ đây để tài liệu dẫn tới hồ sơ."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setImporting(true)}>
              <ClipboardPaste className="ic" />
              Dán từ Excel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus className="ic" />
              Thêm giảng viên
            </button>
          </>
        }
      />
      <section className="adm-panel">
        <div className="adm-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Tìm theo tên, mã, bộ môn, email…" />
          <select className="select" style={{ maxWidth: 260 }} value={uni} onChange={(e) => setUni(e.target.value)} aria-label="Lọc theo trường">
            <option value="">Tất cả trường</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} · {u.nameVi}
              </option>
            ))}
          </select>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table is-clickable">
            <thead>
              <tr>
                <th>Giảng viên</th>
                <th>Bộ môn</th>
                <th>Liên hệ</th>
                <th className="num">Tài liệu</th>
                <th className="w-menu" aria-label="Thao tác" />
              </tr>
            </thead>
            {isLoading ? (
              <TableSkeleton cols={5} rows={5} />
            ) : !data?.items.length ? (
              <EmptyRow cols={5}>
                {dq || uni ? (
                  <EmptyBlock icon={SearchX} title="Không có giảng viên khớp" text="Thử từ khoá khác hoặc bỏ bộ lọc trường." />
                ) : (
                  <EmptyBlock
                    icon={UsersRound}
                    title="Chưa có giảng viên nào"
                    text="Thêm từng người, hoặc dán cả danh sách từ Excel (Mã, Họ tên, Bộ môn, Giới tính, SĐT, Email, Mô tả, Liên kết)."
                    action={
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setImporting(true)}>
                        <ClipboardPaste className="ic" />
                        Dán từ Excel
                      </button>
                    }
                  />
                )}
              </EmptyRow>
            ) : (
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} onClick={() => setEditing(l)}>
                    <td style={{ maxWidth: 0, width: '36%' }}>
                      <div className="cell">
                        <LecturerAvatar l={l} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <span className="cell-title">{l.fullName}</span>
                          <span className="cell-sub">
                            <b>{l.code}</b> · {l.university.code}
                            {l.gender ? ` · ${LECTURER_GENDER_LABELS[l.gender]}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{l.department ?? <span className="cell-sub">—</span>}</td>
                    <td>
                      <span className="cell-title" style={{ fontWeight: 500 }}>
                        {l.email ?? '—'}
                      </span>
                      <span className="cell-sub">
                        {l.phone ?? 'Chưa có SĐT'}
                        {l.links.length ? ` · ${l.links.length} liên kết` : ''}
                      </span>
                    </td>
                    <td className="num">{fmtInt(l.documentCount)}</td>
                    <td className="w-menu" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        label={`Thao tác cho ${l.fullName}`}
                        items={[
                          { label: 'Sửa thông tin', icon: Pencil, onSelect: () => setEditing(l) },
                          { label: 'Xem hồ sơ', icon: ExternalLink, onSelect: () => window.open(`/app/lecturers/${l.id}`, '_blank', 'noopener') },
                          'separator',
                          { label: 'Xoá giảng viên', icon: Trash2, danger: true, onSelect: () => askDelete(l) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        {data && data.totalPages > 1 && <Pager page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} unit="giảng viên" />}
      </section>

      <LecturerForm
        open={creating || Boolean(editing)}
        lecturer={editing}
        defaultUniversity={uni || universities[0]?.id || ''}
        universities={universities}
        onClose={() => (setCreating(false), setEditing(null))}
      />
      <ImportDialog open={importing} onClose={() => setImporting(false)} universities={universities} defaultUniversity={uni || universities[0]?.id || ''} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

type Uni = { id: string; code: string; nameVi: string };

interface Draft {
  universityId: string;
  code: string;
  fullName: string;
  department: string;
  gender: LecturerGender | '';
  phone: string;
  email: string;
  description: string;
  links: Array<{ label: string; url: string }>;
}

const toDraft = (l: LecturerDto | null, uni: string): Draft =>
  l
    ? {
        universityId: l.university.id,
        code: l.code,
        fullName: l.fullName,
        department: l.department ?? '',
        gender: l.gender ?? '',
        phone: l.phone ?? '',
        email: l.email ?? '',
        description: l.description ?? '',
        links: l.links.map((x) => ({ label: x.label ?? '', url: x.url })),
      }
    : { universityId: uni, code: '', fullName: '', department: '', gender: '', phone: '', email: '', description: '', links: [] };

function LecturerForm({
  open,
  onClose,
  lecturer,
  universities,
  defaultUniversity,
}: {
  open: boolean;
  onClose: () => void;
  lecturer: LecturerDto | null;
  universities: Uni[];
  defaultUniversity: string;
}) {
  const toast = useToast();
  const save = useSaveLecturer();
  const [d, setD] = useState<Draft>(() => toDraft(null, defaultUniversity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const departments = useLecturersAdmin({ universityId: d.universityId || undefined, page: 1, pageSize: 60 });
  const deptOptions = useMemo(() => [...new Set((departments.data?.items ?? []).map((x) => x.department).filter(Boolean))] as string[], [departments.data]);

  useEffect(() => {
    if (!open) return;
    setD(toDraft(lecturer, defaultUniversity));
    setErrors({});
  }, [open, lecturer, defaultUniversity]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const links = d.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || null, url: l.url.trim() }));
    const parsed = lecturerInputSchema.safeParse({ ...d, gender: d.gender || null, links });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const key = i.path[0] === 'links' ? `links.${i.path[1]}` : String(i.path[0]);
        next[key] ??= i.message;
      }
      return setErrors(next);
    }
    try {
      const saved = await save.mutateAsync({ id: lecturer?.id, input: parsed.data });
      toast.success(lecturer ? 'Đã lưu giảng viên' : 'Đã thêm giảng viên', `${saved.fullName} (${saved.code})`);
      onClose();
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.fields) setErrors(apiErr.fields);
      toast.error('Không lưu được', apiErr.message);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={lecturer ? `Sửa ${lecturer.fullName}` : 'Thêm giảng viên'}
      description="Sinh viên đã đăng nhập xem được các thông tin này trong Tra cứu giảng viên."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={save.isPending}>
            Huỷ
          </button>
          <button type="submit" form="lec-form" className={cn('btn btn-primary', save.isPending && 'is-loading')} disabled={save.isPending}>
            {lecturer ? 'Lưu thay đổi' : 'Thêm giảng viên'}
          </button>
        </>
      }
    >
      <form id="lec-form" className="sheet-section" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Trường" htmlFor="lf-uni" required error={errors.universityId} className="span-2">
            <select id="lf-uni" className="select" value={d.universityId} onChange={(e) => set('universityId', e.target.value)}>
              <option value="">Chọn trường</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.nameVi}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Họ và tên" htmlFor="lf-name" required error={errors.fullName} className="span-2">
            <input id="lf-name" className="input" maxLength={120} placeholder="Nguyễn Thị Hoàng" value={d.fullName} onChange={(e) => set('fullName', e.target.value)} />
          </Field>
          <Field label="Mã giảng viên" htmlFor="lf-code" required error={errors.code} hint="Mã của trường, ví dụ HoangNT.">
            <input id="lf-code" className="input" maxLength={32} value={d.code} onChange={(e) => set('code', e.target.value)} />
          </Field>
          <Field label="Giới tính" htmlFor="lf-gender">
            <select id="lf-gender" className="select" value={d.gender} onChange={(e) => set('gender', e.target.value as LecturerGender | '')}>
              <option value="">Không ghi</option>
              {LECTURER_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {LECTURER_GENDER_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bộ môn" htmlFor="lf-dept" error={errors.department} className="span-2">
            <input id="lf-dept" className="input" list="lf-depts" maxLength={160} placeholder="Kỹ thuật phần mềm" value={d.department} onChange={(e) => set('department', e.target.value)} />
            <datalist id="lf-depts">
              {deptOptions.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="Số điện thoại" htmlFor="lf-phone" error={errors.phone}>
            <input id="lf-phone" className="input" inputMode="tel" maxLength={32} value={d.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="lf-email" error={errors.email}>
            <input id="lf-email" className="input" type="email" maxLength={160} value={d.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>

        <div className="field">
          <span className="label">Liên kết</span>
          <p className="hint" style={{ marginTop: 0 }}>
            Portfolio, GitHub, LinkedIn, Google Scholar, trang cá nhân… Tên trang được nhận tự động, nhãn có thể bỏ trống.
          </p>
          <div className="lf-links">
            {d.links.map((l, i) => (
              <div key={i} className={cn('lf-link', errors[`links.${i}`] && 'invalid')}>
                <input
                  className="input"
                  aria-label={`Nhãn liên kết ${i + 1}`}
                  placeholder={l.url ? LECTURER_LINK_LABELS[lecturerLinkKind(l.url)] : 'Nhãn'}
                  maxLength={40}
                  value={l.label}
                  onChange={(e) => set('links', d.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="input"
                  aria-label={`Địa chỉ liên kết ${i + 1}`}
                  placeholder="https://"
                  inputMode="url"
                  value={l.url}
                  onChange={(e) => set('links', d.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                <button type="button" className="icon-btn" aria-label={`Bỏ liên kết ${i + 1}`} onClick={() => set('links', d.links.filter((_, j) => j !== i))}>
                  <X className="ic ic-sm" />
                </button>
                {errors[`links.${i}`] && <p className="error-text lf-link-err">{errors[`links.${i}`]}</p>}
              </div>
            ))}
            {d.links.length < 10 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('links', [...d.links, { label: '', url: '' }])}>
                <Plus className="ic ic-sm" />
                Thêm liên kết
              </button>
            )}
          </div>
        </div>

        <Field label="Mô tả" htmlFor="lf-desc" error={errors.description} hint="Không bắt buộc. Ví dụ: môn đang dạy, giờ tiếp sinh viên, phòng làm việc.">
          <textarea id="lf-desc" className="textarea" rows={4} maxLength={2000} value={d.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}

function ImportDialog({ open, onClose, universities, defaultUniversity }: { open: boolean; onClose: () => void; universities: Uni[]; defaultUniversity: string }) {
  const toast = useToast();
  const run = useImportLecturers();
  const [uni, setUni] = useState(defaultUniversity);
  const [text, setText] = useState('');
  const [onExisting, setOnExisting] = useState<'update' | 'skip'>('update');
  useEffect(() => {
    if (open) {
      setUni(defaultUniversity);
      setText('');
    }
  }, [open, defaultUniversity]);
  const parsed = useMemo(() => parseLecturerSheet(text), [text]);

  const submit = async () => {
    try {
      const r = await run.mutateAsync({ universityId: uni, rows: parsed.rows, onExisting });
      toast.success('Đã nhập danh sách', `${r.created} mới, ${r.updated} cập nhật${r.skipped ? `, ${r.skipped} bỏ qua` : ''}.`);
      onClose();
    } catch (e) {
      toast.error('Không nhập được', toApiError(e).message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      icon={ClipboardPaste}
      title="Dán danh sách giảng viên"
      description="Chép các dòng từ Excel hoặc Google Sheets (kèm dòng tiêu đề) rồi dán vào đây. Cột: Mã, Họ tên, Bộ môn, Giới tính, SĐT, Email, Mô tả, Liên kết, thứ tự nào cũng được."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={run.isPending}>
            Huỷ
          </button>
          <button type="button" className={cn('btn btn-primary', run.isPending && 'is-loading')} disabled={!uni || !parsed.rows.length || run.isPending} onClick={submit}>
            Nhập {parsed.rows.length ? fmtInt(parsed.rows.length) : ''} giảng viên
          </button>
        </>
      }
    >
      <div className="lf-import">
        <select className="select" value={uni} onChange={(e) => setUni(e.target.value)} aria-label="Trường của các giảng viên">
          <option value="">Chọn trường</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code} · {u.nameVi}
            </option>
          ))}
        </select>
        <textarea
          className="textarea"
          rows={8}
          spellCheck={false}
          placeholder={'Mã\tHọ tên\tBộ môn\tGiới tính\tSĐT\tEmail\nHoangNT\tNguyễn Thị Hoàng\tKỹ thuật phần mềm\tNữ\t0912345678\thoangnt@fe.edu.vn'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Danh sách giảng viên"
        />
        {text.trim() && (
          <p className={cn('lf-sum', parsed.issues.length && 'has-issues')}>
            {fmtInt(parsed.rows.length)} dòng hợp lệ{parsed.issues.length ? `, ${parsed.issues.length} dòng lỗi sẽ bị bỏ qua` : ''}.
          </p>
        )}
        {parsed.issues.length > 0 && (
          <ul className="lf-issues">
            {parsed.issues.slice(0, 5).map((x) => (
              <li key={x}>{x}</li>
            ))}
            {parsed.issues.length > 5 && <li>… và {parsed.issues.length - 5} dòng khác</li>}
          </ul>
        )}
        <div className="radio-row" role="radiogroup" aria-label="Mã đã có">
          <label className="radio-tile">
            <input type="radio" name="lf-exist" checked={onExisting === 'update'} onChange={() => setOnExisting('update')} />
            <b>Cập nhật người đã có</b>
            <span>Mã trùng thì ghi đè thông tin mới.</span>
          </label>
          <label className="radio-tile">
            <input type="radio" name="lf-exist" checked={onExisting === 'skip'} onChange={() => setOnExisting('skip')} />
            <b>Giữ nguyên người đã có</b>
            <span>Chỉ thêm mã chưa có.</span>
          </label>
        </div>
      </div>
    </Dialog>
  );
}
