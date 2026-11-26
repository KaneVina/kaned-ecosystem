import { Router } from 'express';
import { assistantRouter } from './modules/assistant/assistant.routes.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { embedRouter } from './modules/documents/embed.routes.js';
import { decksRouter } from './modules/decks/decks.routes.js';
import { gradesRouter } from './modules/grades/grades.routes.js';
import { linksRouter } from './modules/links/links.routes.js';
import { announcementRouter } from './modules/site/announcement.routes.js';
import { lecturersRouter } from './modules/lecturers/lecturers.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { translateRouter } from './modules/translate/translate.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { vecRouter } from './modules/vec/vec.routes.js';

/**
 * One place that shows the whole surface of the API. A new module is one
 * line here plus its own folder under modules/.
 */
export const api = Router();

api.use('/activity', activityRouter);
api.use('/assistant', assistantRouter);
api.use('/admin', adminRouter);
api.use('/auth', authRouter);
api.use('/catalog', catalogRouter);
api.use('/documents', documentsRouter);
api.use('/embed', embedRouter);
api.use('/decks', decksRouter);
api.use('/grades', gradesRouter);
api.use('/links', linksRouter);
api.use('/announcement', announcementRouter);
api.use('/lecturers', lecturersRouter);
api.use('/uploads', uploadsRouter);
api.use('/translate', translateRouter);
api.use('/users', usersRouter);
api.use('/vec', vecRouter);
