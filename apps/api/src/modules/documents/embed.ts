import { deflateRawSync } from 'node:zlib';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { marked } from 'marked';
import mammoth from 'mammoth';
import { detectLinkProvider, parseYoutube, type ProtectedEmbedDto } from '@kaned/shared';
import { env } from '../../env.js';
import { storage } from '../../lib/storage.js';

/**
 * Internal documents ("Lưu hành nội bộ") are shown through a Kaned page that
 * holds the video, design or file, so the original address never reaches the
 * document page or the API data:
 *
 * - The page opens only with a short-lived signed token, only inside a frame
 *   on Kaned (browsers say so in Sec-Fetch-Dest), and is never cached.
 * - YouTube plays in Kaned's own player: YouTube's controls are off and a
 *   layer over the video takes every click, so its title, logo, "Watch on
 *   YouTube", share and right-click menu cannot be reached.
 * - Canva, Google and Office viewers run in a sandbox without pop-ups or
 *   top navigation: their "open in new tab" links do nothing.
 * - PDFs hide the browser's toolbar (no download or print buttons).
 *
 * Someone determined can still read the address in the browser's developer
 * tools; this keeps it out of sight and out of reach of ordinary use.
 */

const TTL_MS = 2 * 3600_000;

type Row = { id: string; format: string; fileUrl: string; filePublicId?: string | null; title: string; thumbnailUrl?: string | null };

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const sign = (payload: string) => createHmac('sha256', `embed:${env.JWT_ACCESS_SECRET}`).update(payload).digest('base64url');

export function embedToken(documentId: string, userId: string) {
  const payload = b64(JSON.stringify({ d: documentId, u: userId, e: Date.now() + TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

export function readEmbedToken(token: string): { documentId: string; userId: string } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { d: string; u: string; e: number };
    if (typeof p.e !== 'number' || p.e < Date.now()) return null;
    return { documentId: p.d, userId: p.u };
  } catch {
    return null;
  }
}

const OFFICE = new Set(['DOCX', 'DOC', 'PPTX', 'PPT', 'XLSX', 'XLS']);
const FILE_LABEL: Record<string, string> = { PDF: 'Tệp PDF', DOCX: 'Tài liệu Word', DOC: 'Tài liệu Word', DRAWIO: 'Sơ đồ draw.io', PPTX: 'Bài trình chiếu', PPT: 'Bài trình chiếu', XLSX: 'Bảng tính', XLS: 'Bảng tính', HTML: 'Trang HTML', MD: 'Ghi chú Markdown' };

/** The viewer description for a protected document, or null when it cannot be shown inside Kaned. */
export function protectedEmbed(row: Row, userId: string): ProtectedEmbedDto | null {
  const token = embedToken(row.id, userId);
  const src = `/api/embed/${token}`;
  if (row.format === 'LINK') {
    const p = detectLinkProvider(row.fileUrl);
    if (!p.embedUrl) return null;
    const label = p.id === 'youtube' ? (p.kind === 'playlist' ? 'Danh sách phát YouTube' : p.kind === 'short' ? 'YouTube Shorts' : 'Video YouTube') : p.id === 'canva' ? 'Thiết kế Canva' : p.label;
    return { src, ratio: p.ratio, provider: p.id, label, tall: p.kind === 'short' };
  }
  if (row.format === 'GITHUB') return null;
  if (row.format === 'PDF' || OFFICE.has(row.format) || row.format === 'HTML' || row.format === 'MD' || row.format === 'DRAWIO') {
    return {
      src,
      ratio: 1 / 1.3,
      provider: 'file',
      label: FILE_LABEL[row.format] ?? row.format,
      tall: false,
      ...(row.format === 'DOCX' ? { docx: `/api/embed/${token}/file` } : {}),
    };
  }
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface EmbedPage {
  html: string;
  nonce: string;
}

const BASE_CSS = `html,body{margin:0;height:100%;background:#0f0f10;overflow:hidden;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff}iframe.full{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}`;

function page(nonce: string, body: string, css = '', script = '') {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Kaned</title><style>${BASE_CSS}${css}</style></head><body>${body}${
    script ? `<script nonce="${nonce}">${script}</script>` : ''
  }</body></html>`;
}

/** Shown when the page is opened outside Kaned, or the token has run out. */
export function blockedPage(message: string): EmbedPage {
  const nonce = randomBytes(12).toString('base64');
  return {
    nonce,
    html: page(
      nonce,
      `<div class="m"><b>Tài liệu lưu hành nội bộ</b><p>${esc(message)}</p></div>`,
      `.m{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:24px;color:#ddd}.m b{font-size:16px;color:#fff}.m p{margin:6px 0 0;color:#aaa}`,
    ),
  };
}

/**
 * Office's online viewer posts a form into its own inner frame to load the file, so its sandbox
 * needs allow-forms; without it the frame stays blank. Still no pop-ups and no top navigation.
 */
const officeFrame = (src: string) =>
  `<iframe class="full" src="${esc(src)}" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" allow="fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

/* Word files are turned into a reading page on Kaned's server, so they show without Microsoft's
   viewer and the file's address never reaches the browser. */
const DOCX_MAX_BYTES = 30 * 1024 * 1024;
const DOCX_MAX_HTML = 3_500_000; // keep the response well under the host's size limit
const docxCache = new Map<string, { at: number; html: string }>();

async function docxToHtml(key: string, url: string): Promise<string> {
  const hit = docxCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.html;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(String(r.status));
  if (Number(r.headers.get('content-length') || 0) > DOCX_MAX_BYTES) throw new Error('too large');
  const buffer = Buffer.from(await r.arrayBuffer());
  const styleMap = ["p[style-name='Title'] => h1.title:fresh", "p[style-name='Subtitle'] => p.subtitle:fresh"];
  let { value } = await mammoth.convertToHtml({ buffer }, { styleMap });
  if (value.length > DOCX_MAX_HTML) {
    // Pictures make the page too heavy to send: keep the text, mark where pictures were.
    ({ value } = await mammoth.convertToHtml(
      { buffer },
      { styleMap, convertImage: mammoth.images.imgElement(async () => ({ src: '', alt: 'Hình ảnh (quá lớn để hiển thị ở đây)' })) },
    ));
  }
  // Links stay readable but do not navigate: the frame is a reading surface only.
  const html = value.replace(/<a\b[^>]*>/g, '<span class="a">').replace(/<\/a>/g, '</span>');
  docxCache.set(key, { at: Date.now(), html });
  if (docxCache.size > 40) docxCache.delete(docxCache.keys().next().value!);
  return html;
}

const DOC_CSS = `html{background:#EEF1F6}body{margin:0;padding:28px 16px 48px;font:16px/1.7 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif;color:#121826;-webkit-user-select:none;user-select:none}
.page{max-width:820px;margin:0 auto;background:#fff;border-radius:6px;box-shadow:0 1px 2px rgba(18,24,38,.06),0 8px 30px -12px rgba(18,24,38,.18);padding:56px 64px;box-sizing:border-box}
h1,h2,h3,h4{line-height:1.3;margin:1.4em 0 .5em;color:#0E1424}h1{font-size:1.75em}h2{font-size:1.4em}h3{font-size:1.18em}h4{font-size:1.05em}
h1:first-child,h2:first-child,p:first-child{margin-top:0}h1.title{text-align:center;font-size:2em}p.subtitle{text-align:center;color:#687184;margin-top:-.4em}
p{margin:0 0 .85em}ul,ol{margin:0 0 .9em;padding-left:1.5em}li{margin:.2em 0}
img{max-width:100%;height:auto;display:block;margin:12px auto;border-radius:4px}img[src=""]{display:inline-block;padding:10px 14px;background:#EFF2F7;color:#687184;font-size:13px;border-radius:6px}
table{border-collapse:collapse;width:100%;margin:12px 0 18px;font-size:.94em}td,th{border:1px solid #D2D8E3;padding:7px 10px;vertical-align:top}td p,th p{margin:0 0 .3em}td p:last-child,th p:last-child{margin:0}th{background:#F5F7FB;text-align:left}
.a{color:#1C3BBF;text-decoration:underline;text-decoration-color:#C3D0FC}blockquote{margin:0 0 1em;padding:4px 14px;border-left:3px solid #C3D0FC;color:#3D4657}
@media (max-width:640px){body{padding:12px 8px 32px;font-size:15px}.page{padding:26px 20px}}`;

/** A frame that cannot open pop-ups, navigate Kaned, download or copy to the clipboard. */
const sandboxed = (src: string) =>
  `<iframe class="full" src="${esc(src)}" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; autoplay; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

async function fetchText(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

export async function renderEmbed(row: Row): Promise<EmbedPage> {
  const nonce = randomBytes(12).toString('base64');
  const block = (body: string, css = '') => ({ nonce, html: page(nonce, body, css, NO_MENU) });

  if (row.format === 'LINK') {
    const p = detectLinkProvider(row.fileUrl);
    if (p.id === 'youtube') {
      const y = parseYoutube(row.fileUrl);
      if (y) return { nonce, html: youtubePage(nonce, row, y) };
    }
    if (!p.embedUrl) return blockedPage('Không hiển thị được liên kết này bên trong Kaned.');
    return block(sandboxed(p.embedUrl));
  }

  const url = storage.deliveryUrl({ fileUrl: row.fileUrl, filePublicId: row.filePublicId, format: row.format });
  if (row.format === 'PDF') {
    // The browser's PDF viewer cannot run in a sandbox; its toolbar (download, print) is hidden instead.
    return block(`<iframe class="full" src="${esc(url)}#toolbar=0&navpanes=0&view=FitH"></iframe>`);
  }
  if (row.format === 'DOCX') {
    try {
      const body = await docxToHtml(`${row.id}:${row.fileUrl}`, url);
      const inner = `<!doctype html><meta charset="utf-8"><style>${DOC_CSS}</style><div class="page">${body || '<p>Tài liệu trống.</p>'}</div>`;
      return block(`<iframe class="full" sandbox="" srcdoc="${esc(inner)}"></iframe>`);
    } catch {
      // Could not read it ourselves (damaged or unusual file): fall back to Office's viewer.
      return block(officeFrame(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`));
    }
  }
  if (OFFICE.has(row.format)) {
    return block(officeFrame(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`));
  }
  if (row.format === 'DRAWIO') {
    try {
      const xml = await fetchText(url);
      const packed = deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64');
      return block(sandboxed(`https://viewer.diagrams.net/?lightbox=1&nav=1&layers=1&border=10&toolbar=zoom%20layers#R${encodeURIComponent(packed)}`));
    } catch {
      return blockedPage('Không mở được sơ đồ này.');
    }
  }
  if (row.format === 'HTML' || row.format === 'MD') {
    try {
      const text = await fetchText(url);
      const inner =
        row.format === 'MD'
          ? `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.65 system-ui,sans-serif;color:#1c1a2b;max-width:820px;margin:0 auto;padding:28px 22px}img{max-width:100%}pre{background:#f4f3f8;padding:12px;border-radius:8px;overflow:auto}</style>${await marked.parse(text)}`
          : text;
      // No scripts, no pop-ups: an uploaded page can only be read.
      return block(`<iframe class="full" sandbox="" srcdoc="${esc(inner)}"></iframe>`);
    } catch {
      return blockedPage('Không mở được tệp này.');
    }
  }
  return blockedPage('Định dạng này chưa xem được trong Kaned.');
}

/** Right-click and drag do nothing on Kaned's own layer. */
const NO_MENU = `document.addEventListener('contextmenu',function(e){e.preventDefault()});document.addEventListener('dragstart',function(e){e.preventDefault()});`;

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  replay: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4zm15.6 3 2.2-2.2-1.4-1.4-2.2 2.2-2.2-2.2-1.4 1.4 2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4z"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 3v-3h2v5h-5v-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
};

/** Kaned's own player over the YouTube IFrame API: nothing of YouTube's page can be clicked. */
function youtubePage(nonce: string, row: Row, y: { id: string | null; list: string | null; start: number; short: boolean }) {
  const cfg = JSON.stringify({ id: y.id, list: y.list, start: y.start });
  const cover = row.thumbnailUrl ? `/api/documents/${row.id}/cover` : '';
  const css = `
#wrap{position:absolute;inset:0;background:#000;user-select:none;-webkit-user-select:none}
#player,#player iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
#shield{position:absolute;inset:0;z-index:2;cursor:pointer}
#top{position:absolute;left:0;right:0;top:0;z-index:3;height:58px;padding:0 16px;display:flex;align-items:center;gap:8px;background:#000;font-weight:600;transition:opacity .25s}
#top span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#top i{flex:none;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.02em;padding:3px 7px;border-radius:999px;background:#E7A033;color:#1c1300}
.playing #top{opacity:0;pointer-events:none}
#cover{position:absolute;inset:0;z-index:4;display:grid;place-items:center;background:#000 center/contain no-repeat}
#cover.hide{display:none}
.big{width:74px;height:74px;border-radius:50%;background:rgba(255,255,255,.94);border:0;display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,.4)}
.big svg{width:32px;height:32px;fill:#111}
#bar{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;align-items:center;gap:8px;padding:18px 10px 8px;background:linear-gradient(transparent,rgba(0,0,0,.8));transition:opacity .25s}
.playing.idle #bar{opacity:0}.playing.idle{cursor:none}
#bar button{flex:none;width:34px;height:34px;border:0;border-radius:7px;background:none;display:grid;place-items:center;cursor:pointer;padding:0}
#bar button:hover,#bar button:focus-visible{background:rgba(255,255,255,.16);outline:none}
#bar svg{width:20px;height:20px;fill:#fff}
#seek{flex:1;min-width:60px;accent-color:#fff;cursor:pointer}
#vol{width:76px;accent-color:#fff;cursor:pointer}
#time{flex:none;font-size:12.5px;font-variant-numeric:tabular-nums;color:#eee}
#speed{flex:none;background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:6px;font:inherit;font-size:12.5px;padding:5px 4px;cursor:pointer}
#speed option{color:#000}
.hide-list #bar .pl{display:none}
#msg{position:absolute;inset:0;z-index:6;display:none;place-content:center;text-align:center;padding:24px;background:#111;color:#ddd}
#msg b{color:#fff;font-size:15px}
@media (max-width:520px){#vol,#speed,#time{display:none}}`;
  const body = `<div id="wrap" class="${y.list ? '' : 'hide-list'}">
<div id="player"></div>
<div id="shield" aria-hidden="true"></div>
<div id="top"><i>NỘI BỘ</i><span>${esc(row.title)}</span></div>
<div id="cover"${cover ? ` style="background-image:url('${cover}')"` : ''}><button class="big" id="big" aria-label="Phát">${ICON.play}</button></div>
<div id="bar">
<button id="pp" aria-label="Phát">${ICON.play}</button>
<button class="pl" id="prev" aria-label="Video trước">${ICON.prev}</button>
<button class="pl" id="next" aria-label="Video tiếp">${ICON.next}</button>
<span id="time">0:00 / 0:00</span>
<input id="seek" type="range" min="0" max="1000" value="0" aria-label="Tua video">
<button id="mute" aria-label="Tắt tiếng">${ICON.vol}</button>
<input id="vol" type="range" min="0" max="100" value="100" aria-label="Âm lượng">
<select id="speed" aria-label="Tốc độ phát"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
<button id="fs" aria-label="Toàn màn hình">${ICON.full}</button>
</div>
<div id="msg"></div>
</div>`;
  const script = `${NO_MENU}
var C=${cfg},I=${JSON.stringify(ICON)};
var $=function(i){return document.getElementById(i)},wrap=$('wrap'),P=null,ready=false,state=-1,idle=0,seeking=false;
function fmt(s){s=Math.max(0,Math.floor(s||0));var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return(h?h+':'+(m<10?'0':''):'')+m+':'+(x<10?'0':'')+x}
function play(){if(!ready)return;$('cover').classList.add('hide');P.playVideo()}
function toggle(){if(!ready)return;state===1?P.pauseVideo():play()}
function seekBy(d){if(!ready)return;P.seekTo(Math.max(0,P.getCurrentTime()+d),true)}
function setMute(){if(!ready)return;var m=P.isMuted();m?P.unMute():P.mute();$('mute').innerHTML=m?I.vol:I.mute}
function full(){var d=document;if(d.fullscreenElement){d.exitFullscreen()}else if(wrap.requestFullscreen){wrap.requestFullscreen()}else if(wrap.webkitRequestFullscreen){wrap.webkitRequestFullscreen()}}
function wake(){wrap.classList.remove('idle');clearTimeout(idle);idle=setTimeout(function(){if(state===1)wrap.classList.add('idle')},2500)}
function tick(){if(!ready||seeking)return;var d=P.getDuration()||0,t=P.getCurrentTime()||0;$('time').textContent=fmt(t)+' / '+fmt(d);$('seek').value=d?Math.round(t/d*1000):0}
function fail(code){var m=$('msg');m.style.display='grid';m.innerHTML='<b>Video không phát được trong Kaned</b><p>'+((code===100)?'Video đã bị xoá hoặc để riêng tư.':(code===101||code===150||code===153)?'Chủ video đã tắt cho phép phát ở trang khác.':'Thử tải lại trang.')+'</p>'}
window.onYouTubeIframeAPIReady=function(){
var vars={controls:0,disablekb:1,fs:0,rel:0,iv_load_policy:3,modestbranding:1,playsinline:1,cc_load_policy:0,origin:location.origin,start:C.start||0};
if(C.list){vars.list=C.list;vars.listType='playlist'}
P=new YT.Player('player',{host:'https://www.youtube-nocookie.com',videoId:C.id||undefined,playerVars:vars,events:{
onReady:function(){ready=true;$('vol').value=P.getVolume();setInterval(tick,250);tick()},
onStateChange:function(e){state=e.data;wrap.classList.toggle('playing',state===1);$('pp').innerHTML=state===1?I.pause:I.play;$('pp').setAttribute('aria-label',state===1?'Tạm dừng':'Phát');
if(state===1){$('cover').classList.add('hide');wake()}
if(state===0){var c=$('cover');c.classList.remove('hide');$('big').innerHTML=I.replay;$('big').setAttribute('aria-label','Xem lại')}},
onError:function(e){fail(e.data)}}})};
$('shield').addEventListener('click',toggle);$('shield').addEventListener('dblclick',full);
$('big').addEventListener('click',function(){if(state===0&&ready){P.seekTo(0,true)}play()});
$('pp').addEventListener('click',toggle);$('fs').addEventListener('click',full);$('mute').addEventListener('click',setMute);
$('prev').addEventListener('click',function(){ready&&P.previousVideo()});$('next').addEventListener('click',function(){ready&&P.nextVideo()});
$('seek').addEventListener('input',function(){seeking=true;if(!ready)return;var d=P.getDuration()||0;$('time').textContent=fmt(d*this.value/1000)+' / '+fmt(d)});
$('seek').addEventListener('change',function(){if(ready){P.seekTo((P.getDuration()||0)*this.value/1000,true)}seeking=false});
$('vol').addEventListener('input',function(){if(!ready)return;P.setVolume(+this.value);if(+this.value>0&&P.isMuted()){P.unMute()}$('mute').innerHTML=+this.value?I.vol:I.mute});
$('speed').addEventListener('change',function(){ready&&P.setPlaybackRate(+this.value)});
document.addEventListener('mousemove',wake);document.addEventListener('touchstart',wake,{passive:true});
document.addEventListener('keydown',function(e){if(e.target&&e.target.tagName==='SELECT')return;var k=e.key;
if(k===' '||k==='k'){e.preventDefault();toggle()}else if(k==='ArrowLeft'){seekBy(-5)}else if(k==='ArrowRight'){seekBy(5)}else if(k==='j'){seekBy(-10)}else if(k==='l'){seekBy(10)}else if(k==='m'){setMute()}else if(k==='f'){full()}wake()});
var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.nonce='${nonce}';s.onerror=function(){fail(0)};document.head.appendChild(s);`;
  return page(nonce, body, css, script);
}

/** Headers for the embed page: framed by Kaned only, never cached, only our script and YouTube's. */
export function embedHeaders(nonce: string): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' https://www.youtube.com https://s.ytimg.com`,
      "style-src 'unsafe-inline'",
      "img-src 'self' data: https:",
      "frame-src 'self' https:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  };
}
