import { Router } from 'express';
import {
  createDocumentSchema,
  documentQuerySchema,
  reviewSchema,
  updateDocumentSchema,
  type DocumentQuery,
} from '@kaned/shared';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { idempotent } from '../../middleware/idempotency.js';
import { parsedQuery, validateBody, validateQuery } from '../../middleware/validate.js';
import * as service from './documents.service.js';
import { trackEvent } from '../../lib/track.js';

export const documentsRouter = Router();

/** Every write below needs an Idempotency-Key (see middleware/idempotency.ts). */
const once = idempotent();

documentsRouter.get('/', optionalAuth, validateQuery(documentQuerySchema), async (req, res) => {
  const query = parsedQuery<DocumentQuery>(res);
  const result = await service.listDocuments(query, req.user?.id);
  if (req.user && query.q && query.page === 1) void trackEvent(req.user.id, 'search', { q: query.q, results: result.total }, req);
  res.json(result);
});

documentsRouter.get('/facets', validateQuery(documentQuerySchema), async (_req, res) => {
  res.json(await service.documentFacets(parsedQuery<DocumentQuery>(res)));
});

documentsRouter.post('/', requireAuth, once, validateBody(createDocumentSchema), async (req, res) => {
  const created = await service.createDocument(req.user!.id, req.body);
  void trackEvent(req.user!.id, 'upload', { documentId: created.id, title: created.title }, req);
  res.status(201).json(created);
});

documentsRouter.get('/saved/mine', requireAuth, async (req, res) => {
  res.json(await service.listBookmarked(req.user!.id));
});

/** Cover picture of an internal link (see documentCover). Images carry no sign-in, so this is open. */
documentsRouter.get('/:id/cover', async (req, res) => {
  const cover = await service.documentCover(req.params.id);
  if (!cover) return void res.status(404).end();
  res.set({ 'Content-Type': cover.type, 'Cache-Control': 'public, max-age=86400', 'Cross-Origin-Resource-Policy': 'same-origin' });
  res.send(Buffer.from(cover.body));
});

documentsRouter.get('/:id', optionalAuth, async (req, res) => {
  res.json(await service.getDocument(req.params.id, req.user));
});

documentsRouter.patch('/:id', requireAuth, once, validateBody(updateDocumentSchema), async (req, res) => {
  res.json(await service.updateDocument(req.params.id, req.user!.id, req.user!.role, req.body));
});

documentsRouter.delete('/:id', requireAuth, once, async (req, res) => {
  await service.deleteDocument(req.params.id, req.user!.id, req.user!.role);
  res.status(204).end();
});

documentsRouter.post('/:id/download', optionalAuth, once, async (req, res) => {
  const result = await service.registerDownload(req.params.id, req.user);
  void trackEvent(req.user?.id, 'download', { documentId: req.params.id, title: result.title }, req);
  res.json(result);
});

documentsRouter.post('/:id/bookmark', requireAuth, once, async (req, res) => {
  const result = await service.toggleBookmark(req.params.id, req.user!.id);
  void trackEvent(req.user!.id, 'bookmark', { documentId: req.params.id, saved: result.bookmarked }, req);
  res.json(result);
});

documentsRouter.post('/:id/reviews', requireAuth, once, validateBody(reviewSchema), async (req, res) => {
  const review = await service.upsertReview(req.params.id, req.user!.id, req.body);
  void trackEvent(req.user!.id, 'review', { documentId: req.params.id, score: req.body.score }, req);
  res.status(201).json(review);
});
