import { Router, type Request } from 'express';
import { z } from 'zod';
import { deckListQuerySchema, deckProgressSchema, STAFF_ROLES, type DeckListQuery } from '@kaned/shared';
import { requireAuth } from '../../middleware/auth.js';
import { parsedQuery, validateBody, validateQuery } from '../../middleware/validate.js';
import * as service from './decks.service.js';

/**
 * /api/decks — study decks for learners. Progress saves are plain PUTs of the
 * whole state: repeating one changes nothing, so no idempotency store is needed.
 */
export const decksRouter = Router();

decksRouter.use(requireAuth);

const isStaff = (req: Request) => STAFF_ROLES.includes(req.user!.role);

decksRouter.get('/', validateQuery(deckListQuerySchema), async (req, res) => {
  res.json(await service.listDecks(req.user!.id, parsedQuery<DeckListQuery>(res)));
});

decksRouter.get('/:id', async (req, res) => {
  res.json(await service.getDeck(req.user!.id, req.params.id, isStaff(req)));
});

decksRouter.put('/:id/progress', validateBody(z.object({ state: deckProgressSchema })), async (req, res) => {
  res.json(await service.saveProgress(req.user!.id, req.params.id, req.body.state, isStaff(req)));
});
