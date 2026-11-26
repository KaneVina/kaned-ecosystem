import type { MeetEventDto, MeetEventInput, MeetListItem, MeetSlots, MeetStateDto } from '@kaned/shared';
import { http } from '@/lib/api';

const TOKEN_KEY = (slug: string) => `meet:${slug}`;
export const meetToken = {
  get: (slug: string) => {
    try {
      return localStorage.getItem(TOKEN_KEY(slug)) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (slug: string, t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY(slug), t);
    } catch {
      /* private mode: works until the tab closes */
    }
  },
  clear: (slug: string) => {
    try {
      localStorage.removeItem(TOKEN_KEY(slug));
    } catch {
      /* ignore */
    }
  },
};
const tok = (slug: string) => {
  const t = meetToken.get(slug);
  return t ? { 'X-Meet-Token': t } : {};
};

export const meetApi = {
  mine: async () => (await http.get<MeetListItem[]>('/meet')).data,
  create: async (body: MeetEventInput) => (await http.post<MeetEventDto>('/meet', body)).data,
  get: async (id: string) => (await http.get<MeetEventDto>(`/meet/${id}`)).data,
  update: async (id: string, body: MeetEventInput) => (await http.put<MeetEventDto>(`/meet/${id}`, body)).data,
  remove: async (id: string) => (await http.delete(`/meet/${id}`)).data,
  finalize: async (id: string, body: { day: string; start: number; end: number; note?: string }) => (await http.post(`/meet/${id}/final`, body)).data,
  reopen: async (id: string) => (await http.delete(`/meet/${id}/final`)).data,
  kick: async (id: string, pid: string) => (await http.delete(`/meet/${id}/participants/${pid}`)).data,

  state: async (slug: string) => (await http.get<MeetStateDto>(`/meet/s/${slug}`, { headers: tok(slug) })).data,
  poll: async (slug: string, v: number) =>
    (await http.get<{ changed: false; v: number } | { changed: true; v: number; state: MeetStateDto }>(`/meet/s/${slug}/poll`, { params: { v }, headers: tok(slug) })).data,
  join: async (slug: string, name: string, pin?: string) => {
    const r = (await http.post<{ token: string; state: MeetStateDto }>(`/meet/s/${slug}/join`, { name, ...(pin ? { pin } : {}) })).data;
    meetToken.set(slug, r.token);
    return r.state;
  },
  save: async (slug: string, free: MeetSlots, busy: MeetSlots, busyNote: string) =>
    (await http.put<MeetStateDto>(`/meet/s/${slug}/me`, { free, busy, busyNote }, { headers: tok(slug) })).data,
  setPin: async (slug: string, pin: string) => (await http.put(`/meet/s/${slug}/me/pin`, { pin }, { headers: tok(slug) })).data,
  leave: async (slug: string) => {
    await http.delete(`/meet/s/${slug}/me`, { headers: tok(slug) });
    meetToken.clear(slug);
  },
};

export const meetLink = (slug: string) => `${location.origin}/m/${slug}`;
