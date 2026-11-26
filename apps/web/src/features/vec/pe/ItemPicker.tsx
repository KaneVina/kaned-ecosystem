import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CloudUpload, Library, Plus, Search, X } from 'lucide-react';
import { fmtBytes, peFormatOf, PE_PAPER_FORMATS } from '@kaned/shared';
import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { toApiError } from '@/lib/api';
import { peApi, uploadDraft, type LibraryDoc } from './peApi';

export interface PickedItem {
  key: string;
  source: 'LIBRARY' | 'UPLOAD';
  /** documents.id, or the uploaded file id once it is ready */
  ref: string;
  name: string;
  format: string;
  bytes: number;
  status: 'ready' | 'uploading' | 'error';
  progress?: number;
  error?: string;
  subjectCode?: string;
  subjectName?: string;
}

const FMT_LABEL: Record<string, string> = { PDF: 'PDF', DOCX: 'Word', PPTX: 'Slide', XLSX: 'Excel', MD: 'MD', HTML: 'HTML', IMAGE: 'Ảnh', TEXT: 'Văn bản', ZIP: 'Nén', LINK: 'Liên kết', GITHUB: 'GitHub', DRAWIO: 'Sơ đồ', FILE: 'Tệp' };

export function FormatTag({ format }: { format: string }) {
  return <span className={cn('pe-fmt', `is-${format.toLowerCase()}`)}>{FMT_LABEL[format] ?? format}</span>;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Paper or given materials for a PE room: pick documents from the library, or upload
 * files from the computer (they go straight to private storage and only live with the room).
 */
export function ItemPicker({
  role,
  items,
  onChange,
  max,
  onLibraryPick,
}: {
  role: 'PAPER' | 'MATERIAL';
  items: PickedItem[];
  onChange: (fn: (prev: PickedItem[]) => PickedItem[]) => void;
  max: number;
  onLibraryPick?: (d: LibraryDoc) => void;
}) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const lib = useQuery({ queryKey: ['vec', 'pe', 'library', dq], queryFn: () => peApi.library(dq), staleTime: 60_000, enabled: tab === 'library' });
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const full = items.length >= max;

  const addDoc = (d: LibraryDoc) => {
    if (items.some((x) => x.source === 'LIBRARY' && x.ref === d.id) || full) return;
    onChange((p) => [...p, { key: `l:${d.id}`, source: 'LIBRARY', ref: d.id, name: d.title, format: d.format, bytes: d.bytes, status: 'ready', subjectCode: d.subjectCode, subjectName: d.subjectName }]);
    onLibraryPick?.(d);
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = [...list].slice(0, Math.max(0, max - items.length));
    for (const f of files) {
      const key = `u:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const format = peFormatOf(f.name);
      const bad = role === 'PAPER' && !(PE_PAPER_FORMATS as readonly string[]).includes(format) ? 'Đề cần là PDF, Word, PowerPoint, Excel, Markdown, văn bản hoặc ảnh.' : f.size > 100 * 1024 * 1024 ? 'Tệp lớn hơn 100 MB.' : '';
      onChange((p) => [...p, { key, source: 'UPLOAD', ref: '', name: f.name, format, bytes: f.size, status: bad ? 'error' : 'uploading', progress: 0, error: bad || undefined }]);
      if (bad) continue;
      void uploadDraft(role, f, (pr) => onChange((p) => p.map((x) => (x.key === key ? { ...x, progress: pr } : x))))
        .then((it) => onChange((p) => p.map((x) => (x.key === key ? { ...x, ref: it.id, bytes: it.bytes, status: 'ready', progress: 1 } : x))))
        .catch((e) => onChange((p) => p.map((x) => (x.key === key ? { ...x, status: 'error', error: toApiError(e).message || (e as Error).message } : x))));
    }
  };

  const remove = (it: PickedItem) => {
    onChange((p) => p.filter((x) => x.key !== it.key));
    if (it.source === 'UPLOAD' && it.ref) void peApi.drop(it.ref).catch(() => undefined);
  };

  return (
    <div className="pe-picker">
      <div className="vec-seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'library'} className={cn(tab === 'library' && 'is-on')} onClick={() => setTab('library')}><Library className="ic ic-sm" /> Từ kho tài liệu</button>
        <button type="button" role="tab" aria-selected={tab === 'upload'} className={cn(tab === 'upload' && 'is-on')} onClick={() => setTab('upload')}><CloudUpload className="ic ic-sm" /> Tải lên từ máy</button>
      </div>

      {tab === 'library' ? (
        <div className="pe-lib">
          <Input icon={<Search className="ic" />} placeholder="Tìm theo tên tài liệu hoặc mã môn, ví dụ PRM393" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="pe-lib-list" aria-busy={lib.isFetching}>
            {lib.isLoading && <li className="vec-muted pe-lib-empty">Đang tìm…</li>}
            {lib.data?.map((d) => {
              const ok = role === 'PAPER' ? d.paperOk : d.materialOk;
              const picked = items.some((x) => x.source === 'LIBRARY' && x.ref === d.id);
              return (
                <li key={d.id}>
                  <button type="button" disabled={!ok || picked || full} onClick={() => addDoc(d)} className={cn(picked && 'is-on')} title={!ok ? (role === 'PAPER' ? 'Liên kết không dùng làm đề được' : 'Tài liệu nội bộ không cho tải về') : undefined}>
                    <FormatTag format={d.format} />
                    <span className="pe-lib-main"><b className="clamp-1">{d.title}</b><small>{d.subjectCode} · {d.subjectName}{d.bytes ? ` · ${fmtBytes(d.bytes)}` : ''}</small></span>
                    {picked ? <span className="pe-lib-tag">Đã chọn</span> : ok ? <Plus className="ic ic-sm" /> : <span className="pe-lib-tag is-off">{role === 'PAPER' ? 'Liên kết' : 'Không tải được'}</span>}
                  </button>
                </li>
              );
            })}
            {lib.data && !lib.data.length && <li className="vec-muted pe-lib-empty">Không có tài liệu nào khớp “{dq}”.</li>}
          </ul>
        </div>
      ) : (
        <label
          className={cn('pe-drop', drag && 'is-drag', full && 'is-full')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        >
          <CloudUpload className="ic ic-lg" />
          <b>{full ? `Đã đủ ${max} tệp` : 'Kéo thả tệp vào đây, hoặc bấm để chọn'}</b>
          <small>{role === 'PAPER' ? 'PDF, Word, PowerPoint, Excel, Markdown, ảnh · tối đa 100 MB mỗi tệp' : 'Mọi loại tệp: mã nguồn mẫu, cơ sở dữ liệu, thư mục đã nén (.zip)… · tối đa 100 MB'}</small>
          <small className="pe-drop-fine">Tệp tải lên chỉ dùng cho phiên này và bị xóa cùng phiên.</small>
          <input ref={input} type="file" multiple disabled={full} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
      )}

      {items.length > 0 && (
        <ul className="pe-picked" aria-label="Đã chọn">
          {items.map((it, i) => (
            <li key={it.key} className={cn(it.status === 'error' && 'is-error')}>
              <span className="pe-picked-n">{i + 1}</span>
              <FormatTag format={it.format} />
              <span className="pe-picked-main">
                <b className="clamp-1">{it.name}</b>
                <small>
                  {it.source === 'LIBRARY' ? 'Từ kho tài liệu' : 'Tải lên'}
                  {it.bytes ? ` · ${fmtBytes(it.bytes)}` : ''}
                  {it.status === 'uploading' && ` · đang tải ${Math.round((it.progress ?? 0) * 100)}%`}
                </small>
                {it.status === 'uploading' && <i className="pe-bar"><i style={{ width: `${Math.round((it.progress ?? 0) * 100)}%` }} /></i>}
                {it.status === 'error' && <small className="pe-picked-err"><CircleAlert className="ic ic-xs" /> {it.error}</small>}
              </span>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(it)} aria-label={`Bỏ ${it.name}`}><X className="ic ic-sm" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
