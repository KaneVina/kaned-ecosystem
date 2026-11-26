import { Router } from 'express';
import { assistantSearchSchema } from '@kaned/shared';
import type { z } from 'zod';
import { optionalAuth } from '../../middleware/auth.js';
import { parsedQuery, validateQuery } from '../../middleware/validate.js';
import { trackEvent } from '../../lib/track.js';
import { assistantSearch } from './assistant.service.js';

export const assistantRouter = Router();

/** Kai's one server call: ranked documents, decks, subjects and lecturers for a parsed question. */
assistantRouter.get('/search', optionalAuth, validateQuery(assistantSearchSchema), async (req, res) => {
  const query = parsedQuery<z.output<typeof assistantSearchSchema>>(res);
  const result = await assistantSearch(query, req.user?.id);
  if (req.user && (query.q || query.subject)) {
    void trackEvent(req.user.id, 'search', { q: [query.subject, query.q].filter(Boolean).join(' '), results: result.docs.total, via: 'kai' }, req);
  }
  res.set('Cache-Control', 'private, max-age=30').json(result);
});
