import { Fragment } from 'react';
import { cn } from '@/lib/cn';

/** http(s) addresses, without the punctuation that usually ends a sentence. */
const URL = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

/**
 * Text people typed: keeps their line breaks and turns addresses into links
 * that open in a new tab. Nothing else is interpreted, so it is safe for any
 * user-written text.
 */
export function RichText({ text, className, as: Tag = 'div' }: { text: string; className?: string; as?: 'div' | 'p' }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return (
    <Tag className={cn('rich-text', className)}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line.split(URL).map((part, j) =>
            j % 2 === 1 ? (
              <a key={j} href={part} target="_blank" rel="noopener noreferrer nofollow ugc">
                {part}
              </a>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </Tag>
  );
}
