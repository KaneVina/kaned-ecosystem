import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronRight, FilePlus2, Files, Folder, FolderInput, FolderMinus, FolderOpen, FolderPlus, Inbox, Pencil, Plus, Trash2, X } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS, MAX_FOLDER_DEPTH, type AdminDocumentDto } from '@kaned/shared';
import { Field } from '@/components/ui/Field';
import { FileIcon } from '@/components/ui/FileBadge';
import { useToast } from '@/providers/ToastProvider';
import { toApiError } from '@/lib/api';
import { buildFolderTree, flattenTree, folderPath, type FolderNode } from '@/lib/folders';
import { cn } from '@/lib/cn';
import { useDeleteFolder, useDeleteSubject, useDocumentsAdmin, useFoldersAdmin, useMoveDocuments, useSaveFolder, useSubjectAdmin } from './api';
import { ActionMenu, ConfirmDialog, Dialog, EmptyBlock, EmptyRow, StatusBadge, TableCheck, TableSkeleton, type ConfirmState } from './ui';
import { DocumentEditor } from './DocumentEditor';
import { SubjectForm } from './SubjectsPage';
import { shortDate, useDocumentActions } from './DocumentsPage';
import { useAdminCrumbs } from './AdminShell';

type Scope = 'all' | 'none' | string;
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

/** Create or rename a folder. */
function FolderDialog({
  state,
  subjectId,
  onClose,
}: {
  state: { mode: 'create'; parent: FolderNode | null } | { mode: 'rename'; folder: FolderNode } | null;
  subjectId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveFolder();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (state) {
      setName(state.mode === 'rename' ? state.folder.name : '');
      setError('');
    }
  }, [state]);
  const submit = async () => {
    if (!state) return;
    if (!name.trim()) return setError('Đặt tên thư mục.');
    try {
      if (state.mode === 'create') {
        await save.mutateAsync({ input: { subjectId, parentId: state.parent?.id ?? null, name: name.trim() } });
        toast.success('Đã tạo thư mục', name.trim());
      } else {
        await save.mutateAsync({ id: state.folder.id, input: { name: name.trim() } });
        toast.success('Đã đổi tên thư mục', name.trim());
      }
      onClose();
    } catch (e) {
      const err = toApiError(e);
      setError(err.fields?.name ?? err.message);
    }
  };
  return (
    <Dialog
      open={Boolean(state)}
      onClose={onClose}
      icon={state?.mode === 'rename' ? Pencil : FolderPlus}
      title={state?.mode === 'rename' ? 'Đổi tên thư mục' : state?.parent ? `Thư mục mới trong “${state.parent.name}”` : 'Thư mục mới'}
      description={state?.mode === 'create' ? 'Ví dụ: Đề thi, Slide bài giảng, Bài tập. Thư mục lồng tối đa 3 cấp.' : undefined}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className={cn('btn btn-primary', save.isPending && 'is-loading')} onClick={submit} disabled={save.isPending}>
            {state?.mode === 'rename' ? 'Lưu' : 'Tạo thư mục'}
          </button>
        </>
      }
    >
      <Field label="Tên thư mục" htmlFor="folder-name" error={error}>
        <input
          id="folder-name"
          className="input"
          maxLength={80}
          value={name}
          placeholder="Đề thi"
          onChange={(e) => (setName(e.target.value), setError(''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>
    </Dialog>
  );
}

/** Pick a destination folder for one or more documents. */
function MoveDialog({ ids, folders, onClose }: { ids: string[] | null; folders: FolderNode[]; onClose: () => void }) {
  const toast = useToast();
  const move = useMoveDocuments();
  const [target, setTarget] = useState('');
  useEffect(() => setTarget(''), [ids]);
  return (
    <Dialog
      open={Boolean(ids)}
      onClose={onClose}
      icon={FolderInput}
      title={`Chuyển ${ids?.length ?? 0} tài liệu`}
      description="Chọn thư mục đích trong môn này."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className={cn('btn btn-primary', move.isPending && 'is-loading')}
            disabled={move.isPending}
            onClick={() =>
              move.mutate(
                { ids: ids!, folderId: target || null },
                {
                  onSuccess: (r) => {
                    toast.success(`Đã chuyển ${r.moved} tài liệu`);
                    onClose();
                  },
                  onError: (e) => toast.error('Không chuyển được', toApiError(e).message),
                },
              )
            }
          >
            Chuyển
          </button>
        </>
      }
    >
      <Field label="Thư mục đích" htmlFor="move-target">
        <select id="move-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Ngoài thư mục (gốc của môn)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {' '.repeat(f.depth)}
              {f.name}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}

export function SubjectDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: subject, isError } = useSubjectAdmin(id);
  const { data: folders = [] } = useFoldersAdmin(id);
  const [scope, setScope] = useState<Scope>('all');
  const { data: docPage, isLoading } = useDocumentsAdmin({ subjectId: id, folderId: scope === 'all' ? undefined : scope, page: 1, pageSize: 100, sort: 'title' });
  const allDocs = useDocumentsAdmin({ subjectId: id, page: 1, pageSize: 1 });
  const unfiled = useDocumentsAdmin({ subjectId: id, folderId: 'none', page: 1, pageSize: 1 });
  const saveFolder = useSaveFolder();
  const deleteFolder = useDeleteFolder();
  const move = useMoveDocuments();
  const removeSubject = useDeleteSubject();
  const { menu, confirm, setConfirm } = useDocumentActions();

  const [folderDialog, setFolderDialog] = useState<Parameters<typeof FolderDialog>[0]['state']>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminDocumentDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [editSubject, setEditSubject] = useState(false);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  // Read by the drop targets; state alone can lag a fast drag.
  const dragRef = useRef<string[] | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  useAdminCrumbs([{ label: 'Môn học', to: '/admin/subjects' }, { label: subject?.code ?? '…' }], [subject?.code]);
  useEffect(() => setSelected(new Set()), [scope]);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const current = flat.find((f) => f.id === scope) ?? null;
  const path = folderPath(folders, current?.id);
  const children = scope === 'all' ? tree : current?.children ?? [];
  const docs = useMemo(() => [...(docPage?.items ?? [])].sort((a, b) => collator.compare(a.title, b.title)), [docPage]);
  const allChecked = docs.length > 0 && docs.every((d) => selected.has(d.id));

  if (isError) {
    return <EmptyBlock icon={BookOpen} title="Không tìm thấy môn học" text="Môn này có thể đã bị xoá." action={<Link to="/admin/subjects" className="btn btn-secondary btn-sm">Về danh sách môn</Link>} />;
  }

  const moveTo = (ids: string[], folderId: string | null, name: string) =>
    move.mutate(
      { ids, folderId },
      {
        onSuccess: (r) => {
          toast.success(`Đã chuyển ${r.moved} tài liệu`, folderId ? `vào “${name}”` : 'ra ngoài thư mục');
          setSelected(new Set());
        },
        onError: (e) => toast.error('Không chuyển được', toApiError(e).message),
      },
    );

  const KIND = 'application/x-kaned-docs';
  const dropProps = (target: string | null, name: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragRef.current && !e.dataTransfer.types.includes(KIND)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropOn !== (target ?? 'none')) setDropOn(target ?? 'none');
    },
    onDragLeave: () => setDropOn(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropOn(null);
      const raw = e.dataTransfer.getData(KIND);
      const ids = raw ? raw.split(',') : dragRef.current;
      if (ids?.length) moveTo(ids, target, name);
      dragRef.current = null;
      setDragIds(null);
    },
  });

  const folderMenu = (f: FolderNode) => [
    { label: 'Thư mục con', icon: FolderPlus, onSelect: () => setFolderDialog({ mode: 'create', parent: f }), hidden: f.depth + 1 >= MAX_FOLDER_DEPTH },
    { label: 'Đổi tên', icon: Pencil, onSelect: () => setFolderDialog({ mode: 'rename', folder: f }) },
    {
      label: 'Chuyển ra cấp ngoài',
      icon: FolderMinus,
      hidden: !f.parentId,
      onSelect: () => {
        const parent = folders.find((x) => x.id === f.parentId);
        saveFolder.mutate(
          { id: f.id, input: { parentId: parent?.parentId ?? null } },
          { onSuccess: () => toast.success('Đã chuyển thư mục', f.name), onError: (e) => toast.error('Không chuyển được', toApiError(e).message) },
        );
      },
    },
    'separator' as const,
    {
      label: 'Xoá thư mục',
      icon: Trash2,
      danger: true,
      onSelect: () =>
        setConfirm({
          title: `Xoá thư mục “${f.name}”?`,
          body: (
            <>
              {f.total ? (
                <>
                  <b>{f.total} tài liệu</b> bên trong không bị xoá — chúng được chuyển lên {f.parentId ? `“${folders.find((x) => x.id === f.parentId)?.name}”` : 'gốc của môn'}.
                </>
              ) : (
                'Thư mục đang trống.'
              )}{' '}
              {f.children.length > 0 && `${f.children.length} thư mục con cũng được chuyển lên.`}
            </>
          ),
          confirmLabel: 'Xoá thư mục',
          run: () =>
            deleteFolder.mutateAsync(f.id).then(
              () => {
                toast.success('Đã xoá thư mục', f.name);
                if (scope === f.id) setScope(f.parentId ?? 'all');
              },
              (e) => {
                toast.error('Không xoá được', toApiError(e).message);
                throw e;
              },
            ),
        }),
    },
  ];

  const prog = subject?.programmes ?? [];

  return (
    <>
      {subject ? (
        <div className="uni-hero">
          <span className="adm-uni-mark" style={{ background: subject.university?.color ?? '#4433B4', width: 'auto', padding: '0 10px', minWidth: 44 }}>
            {subject.code}
          </span>
          <div style={{ minWidth: 0 }}>
            <h1>{subject.nameVi}</h1>
            <p>
              {subject.university?.code} · {subject.credits} tín chỉ
              {subject.faculty ? ` · ${subject.faculty.nameVi}` : ''}
              {prog.length > 0 && ` · ${prog.map((p) => `${p.majorCode}${p.termNo ? ` kỳ ${p.termNo}` : ''}`).join(', ')}`}
            </p>
          </div>
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditSubject(true)}>
            <Pencil className="ic" />
            Sửa môn
          </button>
          <ActionMenu
            label="Thao tác khác"
            items={[
              { label: 'Mở trang môn của sinh viên', icon: BookOpen, onSelect: () => window.open(`/app/subjects/${subject.code}`, '_blank', 'noopener') },
              'separator',
              {
                label: 'Xoá môn',
                icon: Trash2,
                danger: true,
                onSelect: () =>
                  setConfirm({
                    title: `Xoá ${subject.code}?`,
                    body: subject.documentCount ? (
                      <>
                        Môn còn <b>{subject.documentCount} tài liệu</b>. Chuyển tài liệu sang môn khác trước khi xoá.
                      </>
                    ) : (
                      <>
                        <b>{subject.nameVi}</b> sẽ bị xoá khỏi danh mục{prog.length ? ` và ${prog.length} chương trình` : ''}, cùng điểm sinh viên đã nhập cho môn.
                      </>
                    ),
                    confirmLabel: 'Xoá môn',
                    typeToConfirm: prog.length ? subject.code : undefined,
                    run: () =>
                      removeSubject.mutateAsync(subject.id).then(
                        () => {
                          toast.success('Đã xoá môn', subject.code);
                          navigate('/admin/subjects');
                        },
                        (e) => {
                          toast.error('Không xoá được', toApiError(e).message);
                          throw e;
                        },
                      ),
                  }),
              },
            ]}
          />
        </div>
      ) : (
        <div className="skel" style={{ height: 78, borderRadius: 12, marginBottom: 16 }} />
      )}

      <div className="sj-layout">
        <aside className="adm-panel" aria-label="Thư mục">
          <div className="adm-panel-head">
            <h2>Thư mục</h2>
            <span className="spacer" />
            <button type="button" className="icon-btn" onClick={() => setFolderDialog({ mode: 'create', parent: null })} aria-label="Thư mục mới" title="Thư mục mới">
              <FolderPlus className="ic" />
            </button>
          </div>
          <div className="ftree">
            <button type="button" className={cn('ftree-item', scope === 'all' && 'active')} onClick={() => setScope('all')}>
              <Files className="ic" />
              <span>Tất cả tài liệu</span>
              <small>{allDocs.data?.total ?? ''}</small>
            </button>
            <button
              type="button"
              className={cn('ftree-item', scope === 'none' && 'active', dropOn === 'none' && 'is-drop')}
              onClick={() => setScope('none')}
              {...dropProps(null, '')}
            >
              <Inbox className="ic" />
              <span>Chưa xếp thư mục</span>
              <small>{unfiled.data?.total ?? ''}</small>
            </button>
            {flat.length > 0 && <div className="ftree-sep" />}
            {flat.map((f) => (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                className={cn('ftree-item', scope === f.id && 'active', dropOn === f.id && 'is-drop')}
                style={{ ['--depth' as string]: f.depth }}
                onClick={() => setScope(f.id)}
                onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setScope(f.id))}
                {...dropProps(f.id, f.name)}
              >
                {scope === f.id ? <FolderOpen className="ic ic-folder" /> : <Folder className="ic ic-folder" />}
                <span>{f.name}</span>
                <small>{f.total || ''}</small>
                <ActionMenu label={`Thao tác cho thư mục ${f.name}`} items={folderMenu(f)} />
              </div>
            ))}
            <button type="button" className="ftree-add" onClick={() => setFolderDialog({ mode: 'create', parent: null })}>
              <Plus className="ic" />
              Thư mục mới
            </button>
          </div>
        </aside>

        <section className="adm-panel">
          <div className="adm-panel-head">
            <nav className="folder-crumbs" aria-label="Vị trí">
              {scope === 'all' || scope === 'none' ? (
                <span aria-current="location">{scope === 'all' ? 'Tất cả tài liệu' : 'Chưa xếp thư mục'}</span>
              ) : (
                <>
                  <button type="button" onClick={() => setScope('all')}>
                    {subject?.code ?? 'Môn'}
                  </button>
                  {path.map((p, i) => (
                    <span key={p.id} style={{ display: 'contents' }}>
                      <ChevronRight className="ic" />
                      {i === path.length - 1 ? (
                        <span aria-current="location">{p.name}</span>
                      ) : (
                        <button type="button" onClick={() => setScope(p.id)}>
                          {p.name}
                        </button>
                      )}
                    </span>
                  ))}
                </>
              )}
            </nav>
            <span className="spacer" />
            {current && current.depth + 1 < MAX_FOLDER_DEPTH && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFolderDialog({ mode: 'create', parent: current })}>
                <FolderPlus className="ic" />
                Thư mục con
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <FilePlus2 className="ic" />
              Đăng tài liệu{current ? ' vào đây' : ''}
            </button>
          </div>

          {scope !== 'none' && children.length > 0 && (
            <div className="subfolders">
              {children.map((f) => (
                <button key={f.id} type="button" className={cn('subfolder', dropOn === f.id && 'is-drop')} onClick={() => setScope(f.id)} {...dropProps(f.id, f.name)}>
                  <Folder className="ic" />
                  <div>
                    <b>{f.name}</b>
                    <span>
                      {f.total} tài liệu{f.children.length ? ` · ${f.children.length} thư mục` : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="adm-table-wrap">
            <table className="adm-table is-clickable">
              <thead>
                <tr>
                  <th className="w-check">
                    <TableCheck checked={allChecked} label="Chọn tất cả" onChange={() => setSelected(allChecked ? new Set() : new Set(docs.map((d) => d.id)))} />
                  </th>
                  <th style={{ width: '52%' }}>Tài liệu</th>
                  {scope === 'all' && <th>Thư mục</th>}
                  <th>Trạng thái</th>
                  <th>Ngày đăng</th>
                  <th className="w-menu" aria-label="Thao tác" />
                </tr>
              </thead>
              {isLoading ? (
                <TableSkeleton cols={scope === 'all' ? 6 : 5} rows={4} />
              ) : !docs.length ? (
                <EmptyRow cols={scope === 'all' ? 6 : 5}>
                  <EmptyBlock
                    icon={current ? FolderOpen : Files}
                    title={current ? `“${current.name}” chưa có tài liệu` : scope === 'none' ? 'Mọi tài liệu đều đã có thư mục' : 'Môn chưa có tài liệu nào'}
                    text={current ? 'Đăng tài liệu vào đây, hoặc kéo tài liệu từ “Tất cả tài liệu” thả vào thư mục bên trái.' : undefined}
                    action={
                      scope !== 'none' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                          <FilePlus2 className="ic" />
                          Đăng tài liệu
                        </button>
                      )
                    }
                  />
                </EmptyRow>
              ) : (
                <tbody>
                  {docs.map((d) => (
                    <tr
                      key={d.id}
                      draggable
                      className={cn(selected.has(d.id) && 'is-selected', dragIds?.includes(d.id) && 'is-dragging')}
                      onDragStart={(e) => {
                        const ids = selected.has(d.id) ? [...selected] : [d.id];
                        dragRef.current = ids;
                        setDragIds(ids);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData(KIND, ids.join(','));
                        e.dataTransfer.setData('text/plain', d.title);
                      }}
                      onDragEnd={() => {
                        dragRef.current = null;
                        setDragIds(null);
                        setDropOn(null);
                      }}
                      onClick={() => setEditing(d)}
                    >
                      <td className="w-check">
                        <TableCheck
                          checked={selected.has(d.id)}
                          label={`Chọn ${d.title}`}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(d.id)) n.delete(d.id);
                              else n.add(d.id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td style={{ maxWidth: 0 }}>
                        <div className="cell">
                          <FileIcon format={d.format} size="xs" />
                          <div>
                            <span className="cell-title" title={d.title}>
                              {d.title}
                            </span>
                            <span className="cell-sub">
                              {DOCUMENT_TYPE_LABELS[d.type].vi} · {d.uploader.name}
                            </span>
                          </div>
                        </div>
                      </td>
                      {scope === 'all' && (
                        <td>
                          {d.folder ? (
                            <span className="chip-x">
                              <Folder className="ic ic-folder" />
                              {d.folder.name}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      )}
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="w-date">{shortDate(d.createdAt)}</td>
                      <td className="w-menu" onClick={(e) => e.stopPropagation()}>
                        <ActionMenu
                          label={`Thao tác cho ${d.title}`}
                          items={[
                            { label: 'Chuyển tới thư mục…', icon: FolderInput, onSelect: () => setMoveIds([d.id]) },
                            { label: 'Bỏ khỏi thư mục', icon: FolderMinus, onSelect: () => moveTo([d.id], null, ''), hidden: !d.folder },
                            'separator',
                            ...menu(d, () => setEditing(d)),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </section>
      </div>

      {selected.size > 0 && (
        <div className="adm-bulk" role="toolbar" aria-label="Thao tác với tài liệu đã chọn">
          <b>Đã chọn {selected.size}</b>
          <button type="button" className="btn btn-ghost" onClick={() => setMoveIds([...selected])}>
            <FolderInput className="ic" />
            Chuyển tới thư mục…
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => moveTo([...selected], null, '')}>
            <FolderMinus className="ic" />
            Bỏ khỏi thư mục
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSelected(new Set())} aria-label="Bỏ chọn">
            <X className="ic" />
          </button>
        </div>
      )}

      <FolderDialog state={folderDialog} subjectId={id} onClose={() => setFolderDialog(null)} />
      <MoveDialog ids={moveIds} folders={flat} onClose={() => setMoveIds(null)} />
      <DocumentEditor
        open={creating || Boolean(editing)}
        doc={editing}
        defaults={subject ? { universityId: subject.universityId, subjectId: subject.id, folderId: current?.id ?? null } : undefined}
        onClose={() => (setCreating(false), setEditing(null))}
      />
      <SubjectForm open={editSubject} subject={subject} onClose={() => setEditSubject(false)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
