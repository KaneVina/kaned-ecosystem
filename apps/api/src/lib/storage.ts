import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadSignatureDto } from '@kaned/shared';
import { env } from '../env.js';
import { ApiError } from './errors.js';

if (env.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const storage = {
  enabled: env.cloudinaryEnabled,

  /**
   * Parameters the browser needs to upload straight to Cloudinary. Keeping the
   * bytes out of the API is what lets the server stay on a small Render plan.
   */
  signUpload(userId: string, filename: string): UploadSignatureDto {
    if (!env.cloudinaryEnabled) {
      return {
        cloudName: '',
        apiKey: '',
        timestamp: Math.floor(Date.now() / 1000),
        signature: '',
        folder: env.CLOUDINARY_FOLDER,
        publicId: `${userId}-${Date.now()}`,
        mode: 'local',
        uploadUrl: '/api/uploads/direct',
      };
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const safeName = filename.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 50);
    const publicId = `${safeName || 'document'}-${crypto.randomBytes(6).toString('hex')}`;
    const folder = `${env.CLOUDINARY_FOLDER}/${userId}`;

    const signature = cloudinary.utils.api_sign_request(
      { folder, public_id: publicId, timestamp },
      env.CLOUDINARY_API_SECRET,
    );

    return {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      publicId,
      mode: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    };
  },

  /** Server-side upload, used by the local fallback and by small files. */
  async uploadBuffer(
    buffer: Buffer,
    options: { folder: string; publicId: string; filename: string },
  ): Promise<{ url: string; publicId: string; bytes: number; pages?: number }> {
    if (!env.cloudinaryEnabled) {
      throw ApiError.badRequest(
        'File storage is not configured. Add your Cloudinary keys to apps/api/.env.',
      );
    }
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          public_id: options.publicId,
          resource_type: 'auto',
          use_filename: false,
          overwrite: false,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            bytes: result.bytes,
            pages: (result as { pages?: number }).pages,
          });
        },
      );
      stream.end(buffer);
    });
  },

  async destroy(publicId: string): Promise<void> {
    if (!env.cloudinaryEnabled || !publicId) return;
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
      // A missing remote file must not stop the row from being deleted.
    }
  },

  /** Cloudinary can render page 1 of a PDF as a JPEG — used for the card thumbnail. */
  thumbnailFor(publicId: string): string | null {
    if (!env.cloudinaryEnabled || !publicId) return null;
    return cloudinary.url(publicId, {
      resource_type: 'image',
      format: 'jpg',
      page: 1,
      transformation: [{ width: 480, height: 640, crop: 'fill', gravity: 'north', quality: 'auto' }],
    });
  },
};
