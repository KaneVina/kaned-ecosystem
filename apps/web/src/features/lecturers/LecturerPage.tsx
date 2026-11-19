import { useParams } from 'react-router-dom';
import { PageHead } from '@/components/ui/Panel';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { fmtInt } from '@/lib/format';
import { useLecturer } from './api';
import { LecturerContacts, LecturerDocuments, LecturerFacts, LecturerHeader, LecturerLinks, LecturerSubjects } from './LecturerProfile';
import './lecturers.css';

export function LecturerPage() {
  const { id } = useParams();
  const { data, isLoading, isError, refetch } = useLecturer(id);
  const crumbs = [
    { label: 'Tổng quan', to: '/app' },
    { label: 'Tra cứu giảng viên', to: '/app/lecturers' },
    { label: data?.fullName ?? 'Giảng viên' },
  ];
  if (isLoading)
    return (
      <div className="container lec-body">
        <Skeleton style={{ height: 160, borderRadius: 16, marginTop: 24 }} />
      </div>
    );
  if (isError || !data)
    return (
      <div className="container lec-body">
        <ErrorState title="Không mở được hồ sơ giảng viên" onRetry={() => void refetch()} />
      </div>
    );
  return (
    <>
      <PageHead crumbs={crumbs} title={<span className="sr-only">{data.fullName}</span>}>
        <LecturerHeader l={data} />
      </PageHead>
      <div className="container lec-body lec-page">
        <aside className="lec-side">
          <section className="panel lec-panel">
            <h2 className="t-h4">Liên hệ</h2>
            <LecturerContacts l={data} />
          </section>
          {data.links.length > 0 && (
            <section className="panel lec-panel">
              <h2 className="t-h4">Liên kết</h2>
              <LecturerLinks l={data} />
            </section>
          )}
          <section className="panel lec-panel">
            <h2 className="t-h4">Thông tin</h2>
            <LecturerFacts l={data} />
          </section>
        </aside>
        <div className="lec-main">
          {data.description && (
            <section className="panel lec-panel">
              <h2 className="t-h4">Giới thiệu</h2>
              <p className="lec-desc">{data.description}</p>
            </section>
          )}
          {data.subjects.length > 0 && (
            <section className="lec-section">
              <h2 className="t-h3">Môn đã dạy trên Kaned</h2>
              <LecturerSubjects l={data} />
            </section>
          )}
          <section className="lec-section">
            <h2 className="t-h3">
              Tài liệu <span className="lec-n">{fmtInt(data.documentCount)}</span>
            </h2>
            <LecturerDocuments l={data} />
          </section>
        </div>
      </div>
    </>
  );
}
