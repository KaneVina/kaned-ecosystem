import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

/** The "Lưu hành nội bộ" mark on cards, rows and the document page. */
export function InternalBadge({ long, className }: { long?: boolean; className?: string }) {
  return (
    <span className={cn('internal-badge', long && 'is-long', className)} title="Tài liệu lưu hành nội bộ: chỉ thành viên Kaned xem được, link gốc được ẩn">
      <ShieldCheck className="ic ic-xs" aria-hidden />
      {long ? 'Lưu hành nội bộ' : 'Nội bộ'}
    </span>
  );
}
