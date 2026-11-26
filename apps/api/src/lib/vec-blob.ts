import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { extOf } from '@kaned/shared';
import { env } from '../env.js';
import { ApiError } from './errors.js';

/**
 * Private storage for PE rooms. On Cloudinary every file is a raw, authenticated
 * resource: it has no public address, and is only reached through a signed
 * download link that expires in minutes. The browser uploads straight to
 * Cloudinary, so a 50 MB solution never passes through the API (or the host's
 * request size limit).
 *
 * Without Cloudinary keys (development), files are kept on the API's disk and
 * moved through the API with short signed tickets.
 */

export type BlobStorage = 'CLOUDINARY' | 'DISK';
export const blobMode: BlobStorage = env.cloudinaryEnabled ? 'CLOUDINARY' : 'DISK';
const DISK_ROOT = path.resolve(process.cwd(), '.data', 'vec');
const LINK_TTL_S = 30 * 60;

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';

/** A storage key for a new file: unguessable, grouped by room (or "draft" before the room exists). */
export function newBlobKey(scope: string, filename: string): string {
  const ext = extOf(filename);
  const leaf = `${safeName(filename)}-${randomBytes(8).toString('hex')}${ext ? `.${ext}` : ''}`;
  return blobMode === 'CLOUDINARY' ? `${env.CLOUDINARY_FOLDER}/vec/${scope}/${leaf}` : `${scope}/${leaf}`;
}

/* ── signed tickets for the disk mode (and the paper window) ── */

const sign = (payload: string) => createHmac('sha256', `vecblob:${env.JWT_ACCESS_SECRET}`).update(payload).digest('base64url');
export function blobTicket(fileId: string, mode: 'up' | 'down' | 'view', ttlMs = LINK_TTL_S * 1000) {
  const payload = Buffer.from(JSON.stringify({ f: fileId, m: mode, e: Date.now() + ttlMs })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readBlobTicket(ticket: string, fileId: string, mode: 'up' | 'down' | 'view'): boolean {
  const [payload, sig] = String(ticket).split('.');
  if (!payload || !sig) return false;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { f: string; m: string; e: number };
    // A download ticket also opens the file for viewing; never the other way round.
    return p.f === fileId && (p.m === mode || (mode === 'view' && p.m === 'down')) && p.e > Date.now();
  } catch {
    return false;
  }
}

export const vecBlob = {
  mode: blobMode,

  /** What the browser needs to send one file. */
  uploadTarget(fileId: string, key: string): { mode: 'cloudinary' | 'local'; url: string; fields: Record<string, string> } {
    if (blobMode === 'DISK') {
      if (env.isProd) throw ApiError.badRequest('Chưa cấu hình kho lưu tệp (Cloudinary) cho máy chủ.');
      return { mode: 'local', url: `/api/vec/blob/${fileId}?t=${encodeURIComponent(blobTicket(fileId, 'up', 2 * 3600_000))}`, fields: {} };
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { public_id: key, timestamp, type: 'authenticated' };
    const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);
    return {
      mode: 'cloudinary',
      url: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
      fields: { api_key: env.CLOUDINARY_API_KEY, timestamp: String(timestamp), signature, public_id: key, type: 'authenticated' },
    };
  },

  /** The stored size, or null when the file is not there. */
  async sizeOf(key: string): Promise<number | null> {
    if (blobMode === 'DISK') {
      try {
        return (await stat(path.join(DISK_ROOT, key))).size;
      } catch {
        return null;
      }
    }
    try {
      const r = (await cloudinary.api.resource(key, { resource_type: 'raw', type: 'authenticated' })) as { bytes?: number };
      return typeof r.bytes === 'number' ? r.bytes : null;
    } catch (e) {
      const code = (e as { error?: { http_code?: number } })?.error?.http_code;
      if (code === 404) return null;
      // The admin API is rate limited; when it cannot answer, trust the upload.
      console.warn('[vec-blob] size check failed', key, (e as Error)?.message ?? e);
      return -1;
    }
  },

  /** A short-lived address the browser can open (download, or show inline). */
  link(fileId: string, key: string, opts: { attachment: boolean; absolute?: boolean }): string {
    if (blobMode === 'DISK') {
      const t = encodeURIComponent(blobTicket(fileId, opts.attachment ? 'down' : 'view'));
      const rel = `/api/vec/blob/${fileId}?t=${t}${opts.attachment ? '&dl=1' : ''}`;
      return opts.absolute ? `${env.apiPublicUrl}${rel}` : rel;
    }
    return cloudinary.utils.private_download_url(key, '', {
      resource_type: 'raw',
      type: 'authenticated',
      attachment: opts.attachment,
      expires_at: Math.floor(Date.now() / 1000) + LINK_TTL_S,
    });
  },

  async destroyMany(keys: string[]): Promise<void> {
    const list = keys.filter(Boolean);
    if (!list.length) return;
    if (blobMode === 'DISK') {
      await Promise.all(list.map((k) => rm(path.join(DISK_ROOT, k), { force: true }).catch(() => undefined)));
      return;
    }
    for (let i = 0; i < list.length; i += 100) {
      try {
        await cloudinary.api.delete_resources(list.slice(i, i + 100), { resource_type: 'raw', type: 'authenticated' });
      } catch (e) {
        console.error('[vec-blob] delete failed', (e as Error)?.message ?? e);
      }
    }
  },

  /* ── disk mode: the API itself receives and sends the bytes ── */

  async receive(req: Request, key: string, maxBytes: number): Promise<number> {
    const file = path.join(DISK_ROOT, key);
    if (!file.startsWith(DISK_ROOT)) throw ApiError.badRequest('Đường dẫn tệp không hợp lệ.');
    await mkdir(path.dirname(file), { recursive: true });
    return new Promise<number>((resolve, reject) => {
      let n = 0;
      const out = createWriteStream(file);
      req.on('data', (chunk: Buffer) => {
        n += chunk.length;
        if (n > maxBytes) {
          req.unpipe(out);
          out.destroy();
          void rm(file, { force: true });
          reject(ApiError.tooLarge('Tệp vượt quá dung lượng cho phép.'));
          req.resume();
        }
      });
      req.pipe(out);
      out.on('finish', () => resolve(n));
      out.on('error', reject);
      req.on('error', reject);
    });
  },

  async send(res: Response, key: string, name: string, attachment: boolean) {
    const file = path.join(DISK_ROOT, key);
    if (!file.startsWith(DISK_ROOT)) return res.status(404).end();
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return res.status(404).end();
    }
    const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    res.set({
      'Content-Length': String(size),
      'Content-Type': mimeOf(name),
      'Content-Disposition': `${attachment ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  },
};

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  html: 'text/plain; charset=utf-8',
};
export const mimeOf = (name: string) => MIME[extOf(name)] ?? 'application/octet-stream';
