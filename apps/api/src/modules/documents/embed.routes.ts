import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { documents } from '../../db/schema.js';
import { blockedPage, embedHeaders, readEmbedToken, renderEmbed } from './embed.js';
import { storage } from '../../lib/storage.js';

/** GET /api/embed/:token — the page that holds an internal document's video, design or file. */
export const embedRouter = Router();

embedRouter.get('/:token', async (req, res) => {
  const send = (page: { html: string; nonce: string }, status = 200) => {
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.status(status).set(embedHeaders(page.nonce)).send(page.html);
  };
  // Browsers say how a page is being loaded: only a frame inside Kaned may open it, never a tab.
  const dest = req.get('sec-fetch-dest');
  if (dest && dest !== 'iframe') return send(blockedPage('Chỉ xem được bên trong trang tài liệu trên Kaned.'), 403);
  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin') return send(blockedPage('Chỉ xem được bên trong trang tài liệu trên Kaned.'), 403);

  const token = readEmbedToken(req.params.token);
  if (!token) return send(blockedPage('Phiên xem đã hết hạn. Tải lại trang tài liệu để xem tiếp.'), 403);
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, token.documentId),
    columns: { id: true, format: true, fileUrl: true, filePublicId: true, title: true, thumbnailUrl: true, status: true },
  });
  if (!row || row.status === 'REMOVED') return send(blockedPage('Tài liệu không còn nữa.'), 404);
  send(await renderEmbed(row));
});

/**
 * GET /api/embed/:token/file — the Word file itself, for the document page to draw in its original
 * layout. Same short-lived token as the page; only fetched by Kaned's own page, never opened as a tab.
 * Small files pass through Kaned; large ones are handed to the storage address so the host's response
 * size limit is not hit.
 */
const PASS_MAX = 4_000_000;
embedRouter.get('/:token/file', async (req, res) => {
  const dest = req.get('sec-fetch-dest');
  const site = req.get('sec-fetch-site');
  if ((dest && dest !== 'empty') || (site && site !== 'same-origin')) return res.status(403).end();
  const token = readEmbedToken(req.params.token);
  if (!token) return res.status(403).end();
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, token.documentId),
    columns: { id: true, format: true, fileUrl: true, filePublicId: true, status: true },
  });
  if (!row || row.status === 'REMOVED' || row.format !== 'DOCX') return res.status(404).end();
  const url = storage.deliveryUrl({ fileUrl: row.fileUrl, filePublicId: row.filePublicId, format: row.format });
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
  let up: Response;
  try {
    up = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return res.status(502).end();
  }
  if (!up.ok) return res.status(502).end();
  const len = Number(up.headers.get('content-length') || 0);
  if (len > PASS_MAX) {
    void up.body?.cancel();
    return res.redirect(302, url);
  }
  const buf = Buffer.from(await up.arrayBuffer());
  if (buf.length > PASS_MAX) return res.redirect(302, url);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
  res.send(buf);
});
