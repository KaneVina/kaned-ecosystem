import { useState } from 'react';
import { Search } from 'lucide-react';
import { Typewriter } from '@/components/ui/Typewriter';
import { cn } from '@/lib/cn';

/** The library's large search box, with example searches typed out while it is empty. */
export function BigSearch({ id, value, onChange, placeholder, hints, label }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; hints: string[]; label: string }) {
  const [focus, setFocus] = useState(false);
  const typing = !value && !focus && hints.length > 0;
  return (
    <div className="ex-search dk-bigsearch">
      <div className="input-group ex-search-box">
        <Search className="ic" />
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          id={id}
          type="search"
          className={cn('input input-lg', typing && 'has-tw')}
          placeholder={placeholder}
          value={value}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        {typing && (
          <span className="ex-tw" aria-hidden>
            Thử tìm <Typewriter phrases={hints} typeMs={45} holdMs={1800} />
          </span>
        )}
      </div>
    </div>
  );
}
