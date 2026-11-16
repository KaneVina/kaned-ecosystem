import { Router } from 'express';
import { subjectQuerySchema, type SubjectQuery } from '@kaned/shared';
import { parsedQuery, validateQuery } from '../../middleware/validate.js';
import * as service from './catalog.service.js';
import { listTerms } from '../admin/institutions.service.js';
import { listFolders } from '../admin/folders.service.js';

export const catalogRouter = Router();

catalogRouter.get('/universities', async (_req, res) => {
  res.json(await service.listUniversities());
});

/** A university's own terms ("Fall 2025", "HK1 2025–2026"), newest first. */
catalogRouter.get('/universities/:id/terms', async (req, res) => {
  res.json(await listTerms(req.params.id));
});

catalogRouter.get('/faculties', async (req, res) => {
  res.json(await service.listFaculties(req.query.universityId as string | undefined));
});

catalogRouter.get('/majors', async (req, res) => {
  res.json(
    await service.listMajors({
      universityId: req.query.universityId as string | undefined,
      facultyId: req.query.facultyId as string | undefined,
    }),
  );
});

catalogRouter.get('/majors/:id/curriculum', async (req, res) => {
  res.json(await service.getCurriculum(req.params.id));
});

catalogRouter.get('/subjects', validateQuery(subjectQuerySchema), async (_req, res) => {
  res.json(await service.searchSubjects(parsedQuery<SubjectQuery>(res)));
});

/** Folders of a subject with how many published documents each holds. */
catalogRouter.get('/subjects/:id/folders', async (req, res) => {
  res.json(await listFolders(req.params.id, true));
});

catalogRouter.get('/subjects/:idOrCode', async (req, res) => {
  res.json(await service.getSubject(req.params.idOrCode));
});
