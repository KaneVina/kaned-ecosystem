import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/Feedback';
import { useActivity } from './api';
import { AdminHead, Pager } from './ui';
import { ActivityLine } from './OverviewPage';
import { useAdminCrumbs } from './AdminShell';

const ENTITIES: Array<[string, string]> = [
  ['', 'Tất cả'],
  ['document', 'Tài liệu'],
  ['university', 'Trường'],
  ['faculty', 'Khoa'],
  ['major', 'Ngành'],
  ['curriculum', 'Chương trình'],
  ['subject', 'Môn học'],
  ['term', 'Kỳ học'],
  ['user', 'Người dùng'],
];

export function ActivityPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useActivity({ page, pageSize: 30, entity: entity || undefined });
  useAdminCrumbs([{ label: 'Nhật ký thay đổi' }]);
  useEffect(() => setPage(1), [entity]);

  return (
    <>
      <AdminHead title="Nhật ký thay đổi" description="Mọi thao tác trong trang quản trị, mới nhất trước. Nhật ký chỉ được thêm, không sửa hay xoá được." />
      <section className="adm-panel">
        <div className="tabs adm-tabs" role="tablist">
          {ENTITIES.map(([key, label]) => (
            <button key={key || 'all'} type="button" role="tab" aria-selected={entity === key} onClick={() => setEntity(key)}>
              {label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div style={{ padding: 18 }}>
            <div className="skel" style={{ height: 240 }} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="Chưa có thay đổi nào" description="Các thao tác thêm, sửa, xoá và duyệt sẽ được ghi lại ở đây." />
        ) : (
          <ul className="feed">
            {data.items.map((a) => (
              <ActivityLine key={a.id} a={a} />
            ))}
          </ul>
        )}
        {data && <Pager page={page} totalPages={data.totalPages} total={data.total} unit="thay đổi" onPage={setPage} />}
      </section>
    </>
  );
}
