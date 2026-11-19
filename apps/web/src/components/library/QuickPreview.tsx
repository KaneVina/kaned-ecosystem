import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Download, Eye, X } from 'lucide-react';
import type { DocumentSummaryDto } from '@kaned/shared';
import { Modal } from '@/components/ui/Modal';
import { FileIcon } from '@/components/ui/FileBadge';
import { RatingInline } from '@/components/ui/Stars';
import { Viewer } from '@/components/paper/Paper';
import { GithubViewer } from '@/components/library/GithubViewer';
import { LinkViewer } from '@/components/library/LinkViewer';
import { isPreviewableLink } from '@kaned/shared';
import { useGithubDocument } from '@/components/library/useGithubDocument';
import { useDownload } from '@/features/library/queries';
import { fmtInt, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Full-size preview in a modal, opened from the eye button on a card. */
export function QuickPreview({
  doc,
  onClose,
  onToggleBookmark,
  onDownload,
  downloading,
}: {
  doc: DocumentSummaryDto | null;
  onClose: () => void;
  onToggleBookmark: (id: string) => void;
  onDownload: (doc: DocumentSummaryDto) => void;
  downloading?: boolean;
}) {
  // A GitHub document previews as its real file list, and downloads from GitHub.
  const { mutate: count } = useDownload();
  const docId = doc?.id;
  const onCount = useCallback(() => docId && count(docId), [docId, count]);
  const gh = useGithubDocument(doc?.format === 'GITHUB' ? { format: doc.format, fileUrl: doc.linkUrl ?? '' } : null, onCount);
  const ghBusy = Boolean(gh.job && gh.target && gh.job.path === gh.target.path);

  return (
    <Modal open={Boolean(doc)} onClose={onClose} title="" size="xl" bare>
      {doc && (
        <div className="preview-modal-inner">
          <div className="pv-head">
            <FileIcon format={doc.format} />
            <div className="pv-titles">
              <h2 className="t-h3 clamp-2">{doc.title}</h2>
              <p className="t-small">
                {doc.subject.nameVi}, {doc.university.name}. {doc.uploader.name} chia sẻ {timeAgo(doc.createdAt)}
              </p>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng xem trước">
              <X className="ic" />
            </button>
          </div>
          {gh.target ? (
            <div className="pv-github">
              <GithubViewer gh={gh} />
            </div>
          ) : doc.format === 'LINK' && doc.linkUrl && isPreviewableLink(doc.linkUrl) ? (
            <div className="pv-link">
              <LinkViewer doc={doc} url={doc.linkUrl} onOpen={() => onDownload(doc)} />
            </div>
          ) : (
            <Viewer doc={doc} thumbs={false} onDownload={() => onDownload(doc)} downloading={downloading} />
          )}
          <div className="modal-foot">
            <div className="pv-stats">
              <RatingInline value={doc.ratingAvg} count={doc.ratingCount} />
              <span className="stat-inline">
                <Download className="ic" />
                {fmtInt(doc.downloads)}
              </span>
              <span className="stat-inline">
                <Eye className="ic" />
                {fmtInt(doc.views)}
              </span>
            </div>
            <span className="spacer" />
            <Link className="btn btn-ghost" to={`/app/library/${doc.id}`} onClick={onClose}>
              Mở chi tiết
            </Link>
            <button
              type="button"
              className={cn('btn btn-secondary', doc.isBookmarked && 'is-on')}
              aria-pressed={Boolean(doc.isBookmarked)}
              onClick={() => onToggleBookmark(doc.id)}
            >
              {doc.isBookmarked ? <BookmarkCheck className="ic ic-sm" /> : <Bookmark className="ic ic-sm" />}
              {doc.isBookmarked ? 'Đã lưu' : 'Lưu'}
            </button>
            {gh.target && gh.primary ? (
              <button type="button" className={cn('btn btn-primary', ghBusy && 'is-loading')} onClick={gh.primary.run} disabled={Boolean(gh.job)}>
                <Download className="ic ic-sm" />
                {gh.primary.label}
              </button>
            ) : (
              <button type="button" className={cn('btn btn-primary', downloading && 'is-loading')} onClick={() => onDownload(doc)}>
                <Download className="ic ic-sm" />
                Tải xuống
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
