import { Router } from 'express';

/**
 * The banner across the top of every page. Open pages ask for it every
 * 20 seconds, so a new text shows up without anyone reloading. Change the
 * id to show it again to people who closed the previous one; null hides it.
 */
export const ANNOUNCEMENT: { id: string; text: string } | null = {
  id: '2026-11-20-duy-minh',
  text: 'Thằng Duy Minh lén học bài he!',
};

export const announcementRouter = Router();

announcementRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(ANNOUNCEMENT);
});
