import { Router } from 'express';
import { activityRouter } from './modules/activity/activity.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { embedRouter } from './modules/documents/embed.routes.js';
import { decksRouter } from './modules/decks/decks.routes.js';
import { gradesRouter } from './modules/grades/grades.routes.js';
import { linksRouter } from './modules/links/links.routes.js';
import { lecturersRouter } from './modules/lecturers/lecturers.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/**
 * One place that shows the whole surface of the API. A new module is one
 * line here plus its own folder under modules/.
 */
export const api = Router();

api.use('/activity', activityRouter);
api.use('/admin', adminRouter);
api.use('/auth', authRouter);
api.use('/catalog', catalogRouter);
api.use('/documents', documentsRouter);
api.use('/embed', embedRouter);
api.use('/decks', decksRouter);
api.use('/grades', gradesRouter);
api.use('/links', linksRouter);
api.use('/lecturers', lecturersRouter);
api.use('/uploads', uploadsRouter);
api.use('/users', usersRouter);
