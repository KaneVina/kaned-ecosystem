import { Router } from 'express';
import {
  createDocumentSchema,
  documentQuerySchema,
  reviewSchema,
  updateDocumentSchema,
  type DocumentQuery,
} from '@kaned/shared';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { parsedQuery, validateBody, validateQuery } from '../../middleware/validate.js';
import * as service from './documents.service.js';

export const documentsRouter = Router();

documentsRouter.get('/', optionalAuth, validateQuery(documentQuerySchema), async (req, res) => {
  res.json(await service.listDocuments(parsedQuery<DocumentQuery>(res), req.user?.id));
});

documentsRouter.get('/facets', validateQuery(documentQuerySchema), async (_req, res) => {
  res.json(await service.documentFacets(parsedQuery<DocumentQuery>(res)));
});

documentsRouter.post('/', requireAuth, validateBody(createDocumentSchema), async (req, res) => {
  res.status(201).json(await service.createDocument(req.user!.id, req.body));
});

documentsRouter.get('/saved/mine', requireAuth, async (req, res) => {
  res.json(await service.listBookmarked(req.user!.id));
});

documentsRouter.get('/:id', optionalAuth, async (req, res) => {
  res.json(await service.getDocument(req.params.id, req.user?.id));
});

documentsRouter.patch('/:id', requireAuth, validateBody(updateDocumentSchema), async (req, res) => {
  res.json(await service.updateDocument(req.params.id, req.user!.id, req.user!.role, req.body));
});

documentsRouter.delete('/:id', requireAuth, async (req, res) => {
  await service.deleteDocument(req.params.id, req.user!.id, req.user!.role);
  res.status(204).end();
});

documentsRouter.post('/:id/download', optionalAuth, async (req, res) => {
  res.json(await service.registerDownload(req.params.id));
});

documentsRouter.post('/:id/bookmark', requireAuth, async (req, res) => {
  res.json(await service.toggleBookmark(req.params.id, req.user!.id));
});

documentsRouter.post('/:id/reviews', requireAuth, validateBody(reviewSchema), async (req, res) => {
  res.status(201).json(await service.upsertReview(req.params.id, req.user!.id, req.body));
});
