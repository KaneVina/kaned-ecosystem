import { Router } from 'express';
import { plannerQuerySchema, saveGradesSchema, type PlannerQuery } from '@kaned/shared';
import { idempotentWrites } from '../../middleware/idempotency.js';
import { requireAuth } from '../../middleware/auth.js';
import { parsedQuery, validateBody, validateQuery } from '../../middleware/validate.js';
import * as service from './grades.service.js';

export const gradesRouter = Router();

gradesRouter.use(requireAuth, idempotentWrites());

gradesRouter.get('/', async (req, res) => {
  res.json(await service.listGrades(req.user!.id));
});

gradesRouter.put('/', validateBody(saveGradesSchema), async (req, res) => {
  res.json(await service.saveGrades(req.user!.id, req.body));
});

gradesRouter.get('/summary', async (req, res) => {
  res.json(await service.gradeSummary(req.user!.id));
});

gradesRouter.get('/planner', validateQuery(plannerQuerySchema), async (req, res) => {
  res.json(await service.plan(req.user!.id, parsedQuery<PlannerQuery>(res)));
});
