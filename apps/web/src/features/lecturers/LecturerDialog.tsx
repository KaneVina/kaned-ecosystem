import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { LECTURER_KIND_LABELS } from '@kaned/shared';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useLecturer } from './api';
import { LecturerContacts, LecturerFacts, LecturerHeader, LecturerLinks, LecturerSubjects } from './LecturerProfile';
import './lecturers.css';

/** A lecturer's profile over the document page. */
export function LecturerDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useLecturer(id);
  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      title={data ? LECTURER_KIND_LABELS[data.kind] : 'Giảng viên'}
      size="md"
      className="lec-dialog"
      footer={
        data ? (
          <Link to={`/app/lecturers/${data.id}`} className="btn btn-secondary" onClick={onClose}>
            Xem hồ sơ và tài liệu
            <ArrowRight className="ic ic-sm" />
          </Link>
        ) : undefined
      }
    >
      {isLoading ? (
        <Skeleton style={{ height: 220, borderRadius: 12 }} />
      ) : isError || !data ? (
        <ErrorState title="Không mở được hồ sơ" onRetry={() => void refetch()} />
      ) : (
        <div className="lec-dlg">
          <LecturerHeader l={data} as="h2" />
          <LecturerContacts l={data} />
          <LecturerLinks l={data} compact />
          {data.description && <p className="lec-desc">{data.description}</p>}
          <LecturerFacts l={data} />
          {data.subjects.length > 0 && (
            <div>
              <h3 className="t-h5 lec-sub-h">Môn đã dạy trên Kaned</h3>
              <LecturerSubjects l={data} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
