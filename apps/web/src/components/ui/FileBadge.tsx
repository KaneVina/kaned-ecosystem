import { FILE_FORMAT_COLORS, detectLinkProvider, linkProviderLabel, type FileFormat, type LinkProviderId } from '@kaned/shared';
import { fmtBytes } from '@/lib/format';
import { cn } from '@/lib/cn';

/** The GitHub mark as a single stroke (Lucide's outline). */
const GITHUB_PATH =
  'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4';

/** "PDF 1.2 MB" in the format's colour; a link shows where it lives instead ("Google Slides"). */
export function FileBadge({
  format,
  bytes,
  linkUrl,
  provider,
  solid,
  className,
}: {
  format: FileFormat;
  bytes?: number;
  linkUrl?: string | null;
  /** Where a link lives when its address is hidden (internal documents). */
  provider?: LinkProviderId | null;
  solid?: boolean;
  className?: string;
}) {
  if (format === 'GITHUB') {
    return (
      <span className={cn('ft', 'ft-github', solid && 'ft-solid', className)}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={GITHUB_PATH} />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
        GitHub
      </span>
    );
  }
  if (format === 'LINK') {
    return (
      <span className={cn('ft', 'ft-link', solid && 'ft-solid', className)}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
        {linkUrl ? detectLinkProvider(linkUrl).label : provider ? linkProviderLabel(provider) : 'Liên kết'}
      </span>
    );
  }
  return (
    <span className={cn('ft', `ft-${format.toLowerCase()}`, solid && 'ft-solid', className)}>
      {format}
      {bytes !== undefined && bytes > 0 && <span>{fmtBytes(bytes)}</span>}
    </span>
  );
}

/** The folded-corner file glyph with a coloured format band. */
export function FileIcon({ format, size, className }: { format: FileFormat; size?: 'xs' | 'sm' | 'lg'; className?: string }) {
  return (
    <span className={cn('file-icon', size && `fi-${size}`, className)} aria-hidden>
      <svg viewBox="0 0 40 48">
        <path d="M7 1.5h19.5L37.5 12.5V44a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 44V4A2.5 2.5 0 0 1 7 1.5z" fill="#fff" stroke="#D9D6E4" />
        <path d="M26.5 1.5V10a2.5 2.5 0 0 0 2.5 2.5h8.5" fill="#F4F3F8" stroke="#D9D6E4" />
        <rect x="0" y="25" width="31" height="14" rx="3" fill={FILE_FORMAT_COLORS[format]} />
        {format === 'GITHUB' ? (
          <g transform="translate(9.6 26.1) scale(.49)" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={GITHUB_PATH} />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </g>
        ) : format === 'LINK' ? (
          <path
            d="M13.6 32.6a2.6 2.6 0 0 0 3.9.3l1.6-1.6a2.6 2.6 0 0 0-3.7-3.7l-.9.9M17.4 31.4a2.6 2.6 0 0 0-3.9-.3l-1.6 1.6a2.6 2.6 0 0 0 3.7 3.7l.9-.9"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ) : (
          <text x="15.5" y="35" fontFamily="Be Vietnam Pro, sans-serif" fontSize="8.2" fontWeight="700" fill="#fff" textAnchor="middle" letterSpacing=".3">
            {format}
          </text>
        )}
      </svg>
    </span>
  );
}
