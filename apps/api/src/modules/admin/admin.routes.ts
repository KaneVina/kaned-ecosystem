import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  academicTermInputSchema,
  academicTermUpdateSchema,
  activityQuerySchema,
  adminDocumentQuerySchema,
  adminDocumentUpdateSchema,
  adminUserQuerySchema,
  adminGradesQuerySchema,
  createDocumentSchema,
  deckInputSchema,
  deckListQuerySchema,
  deckUpdateSchema,
  type DeckListQuery,
  curriculumAddSchema,
  curriculumEntryUpdateSchema,
  documentBulkSchema,
  DOCUMENT_STATUSES,
  facultyInputSchema,
  folderInputSchema,
  folderUpdateSchema,
  moveDocumentsSchema,
  facultyUpdateSchema,
  majorInputSchema,
  majorUpdateSchema,
  subjectInputSchema,
  subjectUpdateSchema,
  universityInputSchema,
  universityUpdateSchema,
  userRoleSchema,
  userEventsQuerySchema,
  userViewsQuerySchema,
  type UserEventsQuery,
  type UserViewsQuery,
  type ActivityQuery,
  type AdminDocumentQuery,
  type AdminUserQuery,
  type AdminGradesQuery,
} from '@kaned/shared';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idempotentWrites } from '../../middleware/idempotency.js';
import { parsedQuery, validateBody, validateQuery } from '../../middleware/validate.js';
import * as institutions from './institutions.service.js';
import * as monitoring from './monitoring.service.js';
import * as gradeAdmin from './grades.service.js';
import * as subjects from './subjects.service.js';
import * as docs from './documents.service.js';
import * as people from './people.service.js';
import * as folders from './folders.service.js';
import { getCurriculum } from '../catalog/catalog.service.js';
import * as deckAdmin from '../decks/decks.service.js';

/**
 * /api/admin — the dashboard's API.
 *
 * Moderators and admins get in; moderators may read everything and change
 * documents, everything else is admin only. Every write carries an
 * Idempotency-Key, so a retried or double-clicked action happens once.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN', 'MODERATOR'), idempotentWrites());

const adminOnly = requireRole('ADMIN');
const actor = (req: Request) => req.user!.id;

const subjectListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  universityId: z.string().uuid().optional(),
  facultyId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
});

/* overview & activity */
adminRouter.get('/overview', async (_req, res) => res.json(await people.overview()));
adminRouter.get('/activity', validateQuery(activityQuerySchema), async (_req, res) =>
  res.json(await people.listActivity(parsedQuery<ActivityQuery>(res))),
);

/* universities */
adminRouter.get('/universities', async (_req, res) => res.json(await institutions.listUniversities()));
adminRouter.get('/universities/:id', async (req, res) => res.json(await institutions.getUniversity(req.params.id)));
adminRouter.post('/universities', adminOnly, validateBody(universityInputSchema), async (req, res) =>
  res.status(201).json(await institutions.createUniversity(actor(req), req.body)),
);
adminRouter.patch('/universities/:id', adminOnly, validateBody(universityUpdateSchema), async (req, res) =>
  res.json(await institutions.updateUniversity(actor(req), req.params.id, req.body)),
);
adminRouter.delete('/universities/:id', adminOnly, async (req, res) => {
  await institutions.deleteUniversity(actor(req), req.params.id);
  res.status(204).end();
});

/* faculties */
adminRouter.get('/universities/:id/faculties', async (req, res) => res.json(await institutions.listFaculties(req.params.id)));
adminRouter.post('/faculties', adminOnly, validateBody(facultyInputSchema), async (req, res) =>
  res.status(201).json(await institutions.createFaculty(actor(req), req.body)),
);
adminRouter.patch('/faculties/:id', adminOnly, validateBody(facultyUpdateSchema), async (req, res) =>
  res.json(await institutions.updateFaculty(actor(req), req.params.id, req.body)),
);
adminRouter.delete('/faculties/:id', adminOnly, async (req, res) => {
  await institutions.deleteFaculty(actor(req), req.params.id);
  res.status(204).end();
});

/* majors & their curriculum */
adminRouter.get('/majors', async (req, res) =>
  res.json(await institutions.listMajors(typeof req.query.universityId === 'string' ? req.query.universityId : undefined)),
);
adminRouter.get('/majors/:id', async (req, res) => res.json(await institutions.getMajor(req.params.id)));
adminRouter.post('/majors', adminOnly, validateBody(majorInputSchema), async (req, res) =>
  res.status(201).json(await institutions.createMajor(actor(req), req.body)),
);
adminRouter.patch('/majors/:id', adminOnly, validateBody(majorUpdateSchema), async (req, res) =>
  res.json(await institutions.updateMajor(actor(req), req.params.id, req.body)),
);
adminRouter.delete('/majors/:id', adminOnly, async (req, res) => {
  await institutions.deleteMajor(actor(req), req.params.id);
  res.status(204).end();
});
adminRouter.get('/majors/:id/curriculum', async (req, res) => res.json(await getCurriculum(req.params.id)));
adminRouter.get('/majors/:id/candidates', async (req, res) =>
  res.json(await subjects.curriculumCandidates(req.params.id, typeof req.query.q === 'string' ? req.query.q : undefined)),
);
adminRouter.post('/majors/:id/curriculum', adminOnly, validateBody(curriculumAddSchema), async (req, res) =>
  res.status(201).json(await subjects.addToCurriculum(actor(req), req.params.id, req.body)),
);
adminRouter.patch(
  '/majors/:id/curriculum/:subjectId',
  adminOnly,
  validateBody(curriculumEntryUpdateSchema),
  async (req, res) => res.json(await subjects.updateCurriculumEntry(actor(req), req.params.id, req.params.subjectId, req.body)),
);
adminRouter.delete('/majors/:id/curriculum/:subjectId', adminOnly, async (req, res) =>
  res.json(await subjects.removeFromCurriculum(actor(req), req.params.id, req.params.subjectId)),
);

/* academic terms */
adminRouter.get('/universities/:id/terms', async (req, res) => res.json(await institutions.listTerms(req.params.id)));
adminRouter.post('/terms', adminOnly, validateBody(academicTermInputSchema), async (req, res) =>
  res.status(201).json(await institutions.createTerm(actor(req), req.body)),
);
adminRouter.patch('/terms/:id', adminOnly, validateBody(academicTermUpdateSchema), async (req, res) =>
  res.json(await institutions.updateTerm(actor(req), req.params.id, req.body)),
);
adminRouter.delete('/terms/:id', adminOnly, async (req, res) => {
  await institutions.deleteTerm(actor(req), req.params.id);
  res.status(204).end();
});

/* subjects */
adminRouter.get('/subjects', validateQuery(subjectListQuery), async (_req, res) =>
  res.json(await subjects.listSubjects(parsedQuery<z.infer<typeof subjectListQuery>>(res))),
);
adminRouter.get('/subjects/:id', async (req, res) => res.json(await subjects.getSubject(req.params.id)));
adminRouter.post('/subjects', adminOnly, validateBody(subjectInputSchema), async (req, res) =>
  res.status(201).json(await subjects.createSubject(actor(req), req.body)),
);
adminRouter.patch('/subjects/:id', adminOnly, validateBody(subjectUpdateSchema), async (req, res) =>
  res.json(await subjects.updateSubject(actor(req), req.params.id, req.body)),
);
adminRouter.delete('/subjects/:id', adminOnly, async (req, res) => {
  await subjects.deleteSubject(actor(req), req.params.id);
  res.status(204).end();
});

/* folders inside a subject — moderators too, they organise documents */
adminRouter.get('/subjects/:id/folders', async (req, res) => res.json(await folders.listFolders(req.params.id)));
adminRouter.post('/folders', validateBody(folderInputSchema), async (req, res) =>
  res.status(201).json(await folders.createFolder(actor(req), req.body)),
);
adminRouter.patch('/folders/:id', validateBody(folderUpdateSchema), async (req, res) =>
  res.json(await folders.updateFolder(actor(req), req.params.id, req.body)),
);
adminRouter.delete('/folders/:id', async (req, res) => {
  await folders.deleteFolder(actor(req), req.params.id);
  res.status(204).end();
});
adminRouter.post('/documents/move', validateBody(moveDocumentsSchema), async (req, res) =>
  res.json(await folders.moveDocuments(actor(req), req.body)),
);

/* documents — moderators too */
adminRouter.get('/documents', validateQuery(adminDocumentQuerySchema), async (_req, res) =>
  res.json(await docs.listDocuments(parsedQuery<AdminDocumentQuery>(res))),
);
adminRouter.get('/documents/:id', async (req, res) => res.json(await docs.getDocument(req.params.id)));
adminRouter.post(
  '/documents',
  validateBody(createDocumentSchema.extend({ status: z.enum(DOCUMENT_STATUSES).optional() })),
  async (req, res) => res.status(201).json(await docs.createDocument(actor(req), req.body)),
);
adminRouter.post('/documents/bulk', validateBody(documentBulkSchema), async (req, res) =>
  res.json(await docs.bulk(actor(req), req.body)),
);
adminRouter.patch('/documents/:id', validateBody(adminDocumentUpdateSchema), async (req, res) =>
  res.json(await docs.updateDocument(actor(req), req.user!.role, req.params.id, req.body)),
);
adminRouter.delete('/documents/:id', async (req, res) => {
  await docs.deleteDocument(actor(req), req.params.id);
  res.status(204).end();
});

/* people */
adminRouter.get('/users', adminOnly, validateQuery(adminUserQuerySchema), async (_req, res) =>
  res.json(await people.listUsers(parsedQuery<AdminUserQuery>(res))),
);
adminRouter.patch('/users/:id/role', adminOnly, validateBody(userRoleSchema), async (req, res) =>
  res.json(await people.setRole(actor(req), req.params.id, req.body.role)),
);

/* study decks: anyone on staff reads, admins import and change */
adminRouter.get('/decks', validateQuery(deckListQuerySchema), async (_req, res) => res.json(await deckAdmin.listDecksAdmin(parsedQuery<DeckListQuery>(res))));
adminRouter.get('/decks/:id', async (req, res) => res.json(await deckAdmin.getDeckAdmin(req.params.id)));
adminRouter.post('/decks', adminOnly, validateBody(deckInputSchema), async (req, res) => res.status(201).json(await deckAdmin.createDeck(actor(req), req.body)));
adminRouter.patch('/decks/:id', adminOnly, validateBody(deckUpdateSchema), async (req, res) => res.json(await deckAdmin.updateDeck(actor(req), req.params.id, req.body)));
adminRouter.delete('/decks/:id', adminOnly, async (req, res) => {
  await deckAdmin.deleteDeck(actor(req), req.params.id);
  res.status(204).end();
});

/* student grades: admins only, never moderators */
adminRouter.get('/grades', adminOnly, validateQuery(adminGradesQuerySchema), async (_req, res) =>
  res.json(await gradeAdmin.gradesOverview(parsedQuery<AdminGradesQuery>(res))),
);
adminRouter.get('/users/:id/grades', adminOnly, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await gradeAdmin.userGrades(req.params.id));
});

/* activity: who is online, what they use (admins only) */
const sessionPage = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
adminRouter.get('/online', adminOnly, async (_req, res) => res.json(await monitoring.onlineUsers()));
adminRouter.get('/users/:id/activity', adminOnly, async (req, res) => res.json(await monitoring.userDetail(req.params.id)));
adminRouter.get('/users/:id/sessions', adminOnly, validateQuery(sessionPage), async (req, res) => {
  const q = parsedQuery<z.infer<typeof sessionPage>>(res);
  res.json(await monitoring.userSessions(req.params.id, q.page, q.pageSize));
});
adminRouter.get('/sessions/:id/views', adminOnly, async (req, res) => res.json(await monitoring.sessionViews(req.params.id)));
adminRouter.get('/users/:id/views', adminOnly, validateQuery(userViewsQuerySchema), async (req, res) =>
  res.json(await monitoring.userViews(req.params.id, parsedQuery<UserViewsQuery>(res))),
);
adminRouter.get('/users/:id/top-documents', adminOnly, async (req, res) =>
  res.json(await monitoring.userTopDocuments(req.params.id)),
);
adminRouter.get('/users/:id/events', adminOnly, validateQuery(userEventsQuerySchema), async (req, res) =>
  res.json(await monitoring.userEventList(req.params.id, parsedQuery<UserEventsQuery>(res))),
);
adminRouter.post('/users/:id/sign-out', adminOnly, async (req, res) =>
  res.json(await monitoring.signOutEverywhere(actor(req), req.params.id)),
);
