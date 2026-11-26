import type { PeFileRole, PeGradingDto, PeItemDto, PePaperDocDto, PeRoomDto, PeUploadTicket } from '@kaned/shared';
import { BASE_URL, http } from '@/lib/api';

export interface LibraryDoc {
  id: string;
  title: string;
  format: string;
  bytes: number;
  pages: number | null;
  subjectCode: string;
  subjectName: string;
  paperOk: boolean;
  materialOk: boolean;
}

export interface PaperBundle {
  examCode: string;
  title: string;
  protect: { noCopy: boolean; watermark: boolean };
  docs: PePaperDocDto[];
}

export interface FileLink {
  url: string;
  kind?: 'download' | 'link';
  name: string;
}

const v = (p: string) => `/vec${p}`;

export const peApi = {
  library: async (q: string) => (await http.get<LibraryDoc[]>(v('/pe/library'), { params: { q } })).data,
  sign: async (role: PeFileRole, name: string, bytes: number, attemptId?: string) => (await http.post<PeUploadTicket>(v('/pe/files/sign'), { role, name, bytes, attemptId })).data,
  finish: async (fileId: string) => (await http.post<PeItemDto>(v(`/pe/files/${fileId}/finish`))).data,
  drop: async (fileId: string) => (await http.delete(v(`/pe/files/${fileId}`))).data,
  room: async (attemptId: string) => (await http.get<PeRoomDto>(v(`/attempts/${attemptId}/pe`))).data,
  paper: async (attemptId: string) => (await http.get<PaperBundle>(v(`/attempts/${attemptId}/pe/paper`))).data,
  hostPaper: async (sessionId: string) => (await http.get<PaperBundle>(v(`/sessions/${sessionId}/pe/paper`))).data,
  material: async (attemptId: string, ref: string) => (await http.get<FileLink>(v(`/attempts/${attemptId}/pe/materials/${ref}`))).data,
  ownSubmission: async (attemptId: string, sid: string) => (await http.get<FileLink>(v(`/attempts/${attemptId}/pe/submissions/${sid}`))).data,
  submit: async (attemptId: string, body: { fileId: string; path: string; fileCount: number; sha256: string; note?: string; skipped: number }) =>
    (await http.post<PeRoomDto>(v(`/attempts/${attemptId}/pe/submit`), body)).data,
  close: async (attemptId: string) => (await http.post<PeRoomDto>(v(`/attempts/${attemptId}/pe/close`), { signed: true })).data,
  grading: async (sessionId: string) => (await http.get<PeGradingDto>(v(`/sessions/${sessionId}/pe/grading`))).data,
  grade: async (attemptId: string, score10: number | null, note: string | null) =>
    (await http.put<{ ok: true; score10: number | null; note: string | null; gradedAt: number | null }>(v(`/attempts/${attemptId}/pe/grade`), { score10, note })).data,
  submissionLink: async (submissionId: string) => (await http.get<FileLink>(v(`/pe/submissions/${submissionId}/link`))).data,
  hostItem: async (sessionId: string, ref: string) => (await http.get<FileLink>(v(`/sessions/${sessionId}/pe/items/${ref}`))).data,
  latest: async (sessionId: string) =>
    (await http.get<Array<{ attemptId: string; studentCode: string; fullName: string; url: string; name: string; bytes: number }>>(v(`/sessions/${sessionId}/pe/latest`))).data,
};

export const peKeys = {
  room: (id: string) => ['vec', 'pe', 'room', id] as const,
  grading: (id: string) => ['vec', 'pe', 'grading', id] as const,
};

/** Relative API addresses (disk mode) need the API's origin in front. */
export const absUrl = (url: string) => (url.startsWith('/') ? `${BASE_URL}${url}` : url);

/** Opens a short-lived download address without leaving the page. */
export function openDownload(link: FileLink) {
  if (link.kind === 'link') {
    window.open(link.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const a = document.createElement('a');
  a.href = absUrl(link.url);
  a.download = link.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Sends one file to where signFile said, reporting progress. Resolves with the file id. */
export async function sendBlob(ticket: PeUploadTicket, body: Blob, name: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', absUrl(ticket.url));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Tải lên thất bại (${xhr.status}).`;
      try {
        const j = JSON.parse(xhr.responseText) as { error?: { message?: string } | string };
        const m = typeof j.error === 'string' ? j.error : j.error?.message;
        if (m) msg = /file size|too large/i.test(m) ? 'Tệp vượt quá dung lượng kho lưu trữ cho phép.' : m;
      } catch {
        /* keep the default */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('Mất kết nối khi tải lên. Kiểm tra mạng rồi thử lại.'));
    xhr.onabort = () => reject(new Error('Đã hủy tải lên.'));
    signal?.addEventListener('abort', () => xhr.abort());
    if (ticket.mode === 'cloudinary') {
      const form = new FormData();
      for (const [k, val] of Object.entries(ticket.fields)) form.append(k, val);
      form.append('file', body, name);
      xhr.send(form);
    } else {
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(body);
    }
  });
}

/** Lecturer: uploads a paper or material file and returns it ready to attach. */
export async function uploadDraft(role: 'PAPER' | 'MATERIAL', file: File, onProgress?: (p: number) => void): Promise<PeItemDto> {
  const t = await peApi.sign(role, file.name, file.size);
  await sendBlob(t, file, file.name, onProgress);
  return peApi.finish(t.fileId);
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
