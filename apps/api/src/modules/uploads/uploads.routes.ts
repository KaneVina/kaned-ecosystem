import { Router } from 'express';
import multer from 'multer';
import { MAX_UPLOAD_BYTES, uploadSignatureSchema } from '@kaned/shared';
import { idempotentWrites } from '../../middleware/idempotency.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { storage } from '../../lib/storage.js';
import { ApiError } from '../../lib/errors.js';
import { env } from '../../env.js';

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

uploadsRouter.use(requireAuth, idempotentWrites());

/**
 * Preferred path: the browser asks for a signature and sends the file straight
 * to Cloudinary, so a 50 MB upload never passes through the API.
 */
uploadsRouter.post('/signature', validateBody(uploadSignatureSchema), (req, res) => {
  if (req.body.bytes > MAX_UPLOAD_BYTES) {
    throw ApiError.tooLarge('That file is larger than the 50 MB limit.');
  }
  res.json(storage.signUpload(req.user!.id, req.body.filename));
});

/** Fallback for environments without Cloudinary keys, and for small files. */
uploadsRouter.post('/direct', upload.single('file'), async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file was attached to the request.');
  if (!storage.enabled) {
    throw ApiError.badRequest(
      'File storage is not configured. Add CLOUDINARY_* keys to apps/api/.env and restart the API.',
    );
  }

  const result = await storage.uploadBuffer(req.file.buffer, {
    folder: `${env.CLOUDINARY_FOLDER}/${req.user!.id}`,
    publicId: `${Date.now()}`,
    filename: req.file.originalname,
  });

  res.status(201).json({
    url: result.url,
    publicId: result.publicId,
    bytes: result.bytes,
    pages: result.pages ?? null,
    thumbnailUrl: storage.thumbnailFor(result.publicId),
  });
});
