import { Router } from 'express';
import { lecturerQuerySchema, type LecturerQuery } from '@kaned/shared';
import { requireAuth } from '../../middleware/auth.js';
import { parsedQuery, validateQuery } from '../../middleware/validate.js';
import * as service from './lecturers.service.js';

/** Lecturer lookup for signed-in members: contact details are not shown to guests. */
export const lecturersRouter = Router();

lecturersRouter.get('/', requireAuth, validateQuery(lecturerQuerySchema), async (_req, res) => {
  const q = parsedQuery<Required<Pick<LecturerQuery, 'page' | 'pageSize'>> & LecturerQuery>(res);
  res.json(await service.listLecturers(q as Parameters<typeof service.listLecturers>[0]));
});

lecturersRouter.get('/departments', requireAuth, async (req, res) => {
  const universityId = typeof req.query.universityId === 'string' ? req.query.universityId : undefined;
  res.json(await service.listDepartments(universityId));
});

lecturersRouter.get('/:id', requireAuth, async (req, res) => {
  res.json(await service.getLecturer(req.params.id, req.user!.id));
});
