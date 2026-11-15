import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Feedback';
import { Wordmark } from '@/components/ui/Wordmark';

export function NotFoundPage({ inShell = false }: { inShell?: boolean }) {
  const body = (
    <EmptyState
      title="Không có trang này"
      description="Đường dẫn bạn mở không tồn tại, hoặc module đó chưa được phát hành."
      action={
        <Link to={inShell ? '/app' : '/'} className="btn btn-primary">
          {inShell ? 'Về Tổng quan' : 'Về trang chủ'}
        </Link>
      }
    />
  );
  if (inShell) return <div className="container nf">{body}</div>;
  return (
    <div className="booting">
      <div>
        <Wordmark />
        {body}
      </div>
    </div>
  );
}
