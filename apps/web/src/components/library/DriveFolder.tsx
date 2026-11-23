import { useState } from 'react';
import { ChevronRight, ExternalLink, File, FileImage, FileText, Folder, FolderOpen, Presentation, Sheet, Video } from 'lucide-react';
import { detectLinkProvider, type DriveEntryDto } from '@kaned/shared';
import { EmbedFrame } from '@/components/library/LinkViewer';
import { useDriveFolder } from '@/features/library/queries';
import { fmtBytes, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

type Crumb = { id: string; name: string };

function kindOf(e: DriveEntryDto): { label: string; Icon: typeof File } {
  if (e.kind === 'folder') return { label: 'Thư mục', Icon: Folder };
  const m = e.mime ?? '';
  const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
  if (m.includes('presentation') || /^pptx?$/.test(ext)) return { label: 'Bài trình chiếu', Icon: Presentation };
  if (m.includes('spreadsheet') || m.includes('excel') || /^(xlsx?|csv)$/.test(ext)) return { label: 'Bảng tính', Icon: Sheet };
  if (m === 'application/pdf' || ext === 'pdf') return { label: 'PDF', Icon: FileText };
  if (m.includes('document') || m.includes('word') || /^(docx?|txt|md)$/.test(ext)) return { label: 'Văn bản', Icon: FileText };
  if (m.startsWith('image/') || /^(png|jpe?g|gif|webp)$/.test(ext)) return { label: 'Hình ảnh', Icon: FileImage };
  if (m.startsWith('video/') || /^(mp4|mov|mkv)$/.test(ext)) return { label: 'Video', Icon: Video };
  return { label: ext ? ext.toUpperCase() : 'Tệp', Icon: File };
}

/**
 * The inside of a Google Drive folder: files and sub-folders as a list, with
 * a way into each sub-folder and an inline preview of each file.
 */
export function DriveFolder({ folderId, rootName, fallbackEmbed }: { folderId: string; rootName: string; fallbackEmbed: string }) {
  const [trail, setTrail] = useState<Crumb[]>([{ id: folderId, name: rootName }]);
  const [open, setOpen] = useState<DriveEntryDto | null>(null);
  const here = trail[trail.length - 1];
  const { data, isLoading } = useDriveFolder(here.id);

  const goTo = (i: number) => {
    setTrail((t) => t.slice(0, i + 1));
    setOpen(null);
  };

  if (isLoading) {
    return (
      <div className="drv-state">
        <span className="spin" />
        Đang đọc thư mục…
      </div>
    );
  }
  if (!data || data.status !== 'ok') {
    return (
      <div>
        <p className="drv-note">
          {data?.status === 'private'
            ? 'Kaned chưa đọc được thư mục này. Chủ thư mục cần chia sẻ “Bất kỳ ai có đường liên kết”. Bạn vẫn xem được bên dưới nếu đã đăng nhập Google.'
            : 'Chưa lấy được danh sách tệp lúc này. Bạn vẫn xem được thư mục ở khung bên dưới.'}
        </p>
        <iframe className="drv-fallback" src={fallbackEmbed} title={rootName} loading="lazy" />
      </div>
    );
  }

  const folders = data.entries.filter((e) => e.kind === 'folder').length;
  const files = data.entries.length - folders;
  const preview = open ? detectLinkProvider(`https://drive.google.com/file/d/${open.id}/view`) : null;

  return (
    <div className="drv">
      <nav className="drv-crumbs" aria-label="Đường dẫn thư mục">
        {trail.map((c, i) => (
          <span key={c.id} className="drv-crumb">
            {i > 0 && <ChevronRight className="ic ic-xs" />}
            <button type="button" className={cn(i === trail.length - 1 && 'is-here')} onClick={() => goTo(i)} disabled={i === trail.length - 1 && !open}>
              {i === 0 ? <FolderOpen className="ic ic-xs" /> : null}
              {i === 0 ? data && trail.length === 1 && data.name ? data.name : c.name : c.name}
            </button>
          </span>
        ))}
        <span className="spacer" />
        <small className="drv-count">
          {folders ? `${folders} thư mục · ` : ''}
          {files} tệp
        </small>
      </nav>

      {open && preview?.embedUrl && (
        <div className="drv-preview">
          <div className="drv-preview-bar">
            <b className="clamp-1">{open.name}</b>
            <a className="btn btn-secondary btn-sm" href={`https://drive.google.com/file/d/${open.id}/view`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="ic ic-sm" />
              Mở trong Drive
            </a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>
              Đóng
            </button>
          </div>
          <EmbedFrame provider={preview} title={open.name} compact />
        </div>
      )}

      {data.entries.length === 0 ? (
        <p className="drv-note">Thư mục này trống, hoặc chưa được chia sẻ công khai.</p>
      ) : (
        <ul className="drv-list">
          {data.entries.map((e) => {
            const k = kindOf(e);
            const when = e.modifiedAt ? fmtDateTime(e.modifiedAt) : e.modifiedText;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className={cn('drv-row', open?.id === e.id && 'is-open')}
                  onClick={() => {
                    if (e.kind === 'folder') {
                      setTrail((t) => [...t, { id: e.id, name: e.name }]);
                      setOpen(null);
                    } else setOpen(e);
                  }}
                >
                  <span className={cn('drv-ic', e.kind === 'folder' && 'is-folder')}>
                    <k.Icon className="ic ic-sm" />
                  </span>
                  <span className="drv-name clamp-1">{e.name}</span>
                  <span className="drv-meta">{k.label}</span>
                  <span className="drv-meta drv-size">{e.size ? fmtBytes(e.size) : ''}</span>
                  <span className="drv-meta drv-when">{when ?? ''}</span>
                  {e.kind === 'folder' && <ChevronRight className="ic ic-sm drv-go" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {data.truncated && <p className="drv-note">Chỉ hiện {data.entries.length} mục đầu tiên. Mở trong Drive để xem đủ.</p>}
    </div>
  );
}
