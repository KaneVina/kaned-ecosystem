// Vercel serverless entry: the whole Express API behind /api/*, same origin
// as the web app, so cookies and CORS need nothing special.
import 'express-async-errors';
import { createApp } from '../apps/api/dist/app.js';

export default createApp();
