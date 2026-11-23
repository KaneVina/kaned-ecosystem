import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { parsedQuery, validateQuery } from '../../middleware/validate.js';
import { isDriveId, listDriveFolder } from './drive.js';
import { previewLink } from './links.service.js';

export const linksRouter = Router();

const previewQuery = z.object({ url: z.string().trim().url().max(2000) });

/** Title, cover and visibility of a YouTube or Canva link, for the upload form. */
linksRouter.get('/preview', requireAuth, validateQuery(previewQuery), async (_req, res) => {
  const { url } = parsedQuery<z.infer<typeof previewQuery>>(res);
  res.set('Cache-Control', 'private, max-age=300');
  res.json(await previewLink(url));
});

const driveQuery = z.object({ id: z.string().trim().refine(isDriveId, 'Mã thư mục không hợp lệ') });

/** What is inside a Google Drive folder shared with "anyone with the link". */
linksRouter.get('/drive-folder', requireAuth, validateQuery(driveQuery), async (_req, res) => {
  const { id } = parsedQuery<z.infer<typeof driveQuery>>(res);
  res.set('Cache-Control', 'private, max-age=120');
  res.json(await listDriveFolder(id));
});
