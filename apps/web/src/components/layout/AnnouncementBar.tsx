import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { http } from '@/lib/api';

const KEY = 'kaned.announcement.closed';
const readClosed = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * A white-on-purple line scrolling right to left across the top of every
 * page. The text comes from the API and is asked for again every 20 seconds
 * and whenever the tab comes back, so it appears without a reload. Closing
 * it hides that announcement on this browser.
 */
export function AnnouncementBar() {
  const [closed, setClosed] = useState(readClosed);
  const { data } = useQuery({
    queryKey: ['announcement'],
    queryFn: async () => (await http.get<{ id: string; text: string } | null>('/announcement')).data,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
  if (!data?.text || closed === data.id) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, data.id);
    } catch {
      /* private mode: closes for this visit only */
    }
    setClosed(data.id);
  };
  return (
    <div className="announce" role="status">
      <div className="announce-track" aria-hidden>
        <span className="announce-text" key={data.id}>
          {data.text}
        </span>
      </div>
      <span className="sr-only">{data.text}</span>
      <button type="button" className="announce-x" aria-label="Tắt thông báo" onClick={close}>
        <X className="ic ic-sm" />
      </button>
    </div>
  );
}
