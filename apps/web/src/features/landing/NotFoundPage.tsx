import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/Feedback';
import { Wordmark } from '@/components/ui/Wordmark';

export function NotFoundPage({ inShell = false }: { inShell?: boolean }) {
  const body = (
    <EmptyState
      icon={<Compass className="size-7" />}
      title="Không có trang này"
      description="Đường dẫn bạn mở không tồn tại, hoặc module đó chưa được phát hành."
      action={
        <Link
          to={inShell ? '/app' : '/'}
          className="inline-flex h-10 items-center rounded-[11px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {inShell ? 'Về bảng điều khiển' : 'Về trang chủ'}
        </Link>
      }
    />
  );

  if (inShell) return body;

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-5">
      <div className="w-full max-w-md text-center">
        <Wordmark />
        <div className="mt-6">{body}</div>
      </div>
    </div>
  );
}
