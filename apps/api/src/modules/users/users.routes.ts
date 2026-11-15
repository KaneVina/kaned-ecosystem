import { Router } from 'express';
import { getPublicProfile } from './users.service.js';

export const usersRouter = Router();

usersRouter.get('/:id', async (req, res) => {
  res.json(await getPublicProfile(req.params.id));
});
