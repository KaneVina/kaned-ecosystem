import type { FileFormat } from '@kaned/shared';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/cn';

/** "PDF 1.2 MB" in the format's colour. */
export function FileBadge({ format, bytes, solid, className }: { format: FileFormat; bytes?: number; solid?: boolean; className?: string }) {
  return (
    <span className={cn('ft', `ft-${format.toLowerCase()}`, solid && 'ft-solid', className)}>
      {format}
      {bytes !== undefined && <span>{fmtBytes(bytes)}</span>}
    </span>
  );
}

const FORMAT_COLOR: Record<FileFormat, string> = { PDF: '#CF3F35', DOCX: '#2D63CF', PPTX: '#CF5F22', XLSX: '#1C7F4F' };

/** The folded-corner file glyph with a coloured format band. */
export function FileIcon({ format, size, className }: { format: FileFormat; size?: 'xs' | 'sm' | 'lg'; className?: string }) {
  return (
    <span className={cn('file-icon', size && `fi-${size}`, className)} aria-hidden>
      <svg viewBox="0 0 40 48">
        <path d="M7 1.5h19.5L37.5 12.5V44a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 44V4A2.5 2.5 0 0 1 7 1.5z" fill="#fff" stroke="#D9D6E4" />
        <path d="M26.5 1.5V10a2.5 2.5 0 0 0 2.5 2.5h8.5" fill="#F4F3F8" stroke="#D9D6E4" />
        <rect x="0" y="25" width="31" height="14" rx="3" fill={FORMAT_COLOR[format]} />
        <text x="15.5" y="35" fontFamily="Be Vietnam Pro, sans-serif" fontSize="8.2" fontWeight="700" fill="#fff" textAnchor="middle" letterSpacing=".3">
          {format}
        </text>
      </svg>
    </span>
  );
}
