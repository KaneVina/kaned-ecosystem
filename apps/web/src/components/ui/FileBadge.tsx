import type { FileFormat } from '@kaned/shared';
import { fmtBytes, formatColor } from '@/lib/format';
import { cn } from '@/lib/cn';

/** The coloured rectangle that tells you what kind of file something is. */
export function FileBadge({ format, bytes, className }: { format: FileFormat; bytes?: number; className?: string }) {
  const color = formatColor(format);
  return (
    <span
      className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-[5px] px-1.5 text-[11px] font-bold', className)}
      style={{ background: `${color}1a`, color }}
    >
      {format}
      {bytes !== undefined && <span className="font-medium opacity-85">{fmtBytes(bytes)}</span>}
    </span>
  );
}

export function FileIcon({ format, className }: { format: FileFormat; className?: string }) {
  const color = formatColor(format);
  return (
    <span className={cn('relative inline-block shrink-0', className)} aria-hidden>
      <svg viewBox="0 0 40 48" className="size-full">
        <path d="M7 1.5h19.5L37.5 12.5V44a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 44V4A2.5 2.5 0 0 1 7 1.5z" fill="#fff" stroke="#D9D6E4" />
        <path d="M26.5 1.5V10a2.5 2.5 0 0 0 2.5 2.5h8.5" fill="#F4F3F8" stroke="#D9D6E4" />
        <rect x="0" y="25" width="31" height="14" rx="3" fill={color} />
        <text x="15.5" y="35" fontFamily="Be Vietnam Pro, sans-serif" fontSize="8.2" fontWeight="700" fill="#fff" textAnchor="middle">
          {format}
        </text>
      </svg>
    </span>
  );
}
