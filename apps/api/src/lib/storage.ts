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
    // Word, PowerPoint, Excel, HTML and Markdown are stored as raw files; their
    // public id must keep the extension or the delivered file has none and
    // viewers cannot tell what it is.
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    const keepExt = /^(docx?|pptx?|xlsx?|html?|md|markdown|drawio|dio)$/.test(ext) ? `.${ext}` : '';
    const publicId = `${safeName || 'document'}-${crypto.randomBytes(6).toString('hex')}${keepExt}`;
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

  /**
   * The address a browser should use for an uploaded file. Free Cloudinary
   * accounts refuse to deliver PDF and ZIP files from their public URL
   * ("deny or ACL failure"), so those go through a signed download link that
   * expires; everything else keeps its public URL (Office's viewer needs one).
   */
  deliveryUrl(doc: { fileUrl: string; filePublicId?: string | null; format: string }, options: { attachment?: boolean } = {}): string {
    if (!env.cloudinaryEnabled || !doc.filePublicId) return doc.fileUrl;
    const m = /\/(image|raw)\/upload\//.exec(doc.fileUrl);
    if (!m || !/^(PDF|ZIP)$/.test(doc.format)) return doc.fileUrl;
    const raw = m[1] === 'raw';
    return cloudinary.utils.private_download_url(doc.filePublicId, raw ? '' : doc.format.toLowerCase(), {
      resource_type: raw ? 'raw' : 'image',
      type: 'upload',
      attachment: Boolean(options.attachment),
      expires_at: Math.floor(Date.now() / 1000) + 12 * 3600,
    });
  },

  /** Cloudinary can render page 1 of a PDF as a JPEG — used for the card thumbnail. */
  thumbnailFor(publicId: string, format?: string): string | null {
    if (!env.cloudinaryEnabled || !publicId) return null;
    // Cloudinary can draw a page only from a PDF.
    if (format && format !== 'PDF') return null;
    // Word / PowerPoint / Excel files are stored raw; Cloudinary can only draw PDFs and images.
    if (/\.(docx?|pptx?|xlsx?|html?|md|markdown|drawio|dio|zip|rar)$/i.test(publicId)) return null;
    return cloudinary.url(publicId, {
      resource_type: 'image',
      format: 'jpg',
      page: 1,
      transformation: [{ width: 480, height: 640, crop: 'fill', gravity: 'north', quality: 'auto' }],
    });
  },
};
