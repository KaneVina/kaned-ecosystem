import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { documents } from '../../db/schema.js';
import { blockedPage, embedHeaders, readEmbedToken, renderEmbed } from './embed.js';

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
