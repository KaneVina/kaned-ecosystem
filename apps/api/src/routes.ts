import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { gradesRouter } from './modules/grades/grades.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/**
 * One place that shows the whole surface of the API. A new module is one
 * line here plus its own folder under modules/.
 */
export const api = Router();

api.use('/auth', authRouter);
api.use('/catalog', catalogRouter);
api.use('/documents', documentsRouter);
api.use('/grades', gradesRouter);
api.use('/uploads', uploadsRouter);
api.use('/users', usersRouter);
