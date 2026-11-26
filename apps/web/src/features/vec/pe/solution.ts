import { zip, type AsyncZippable } from 'fflate';
import { PE_SKIP_DIRS, extOf, fileAllowed, isBlockedExt, type PeSubmissionConfig } from '@kaned/shared';

/** One file of what the candidate picked, with its path inside the solution. */
export interface PickedFile {
  file: File;
  path: string;
}

export interface Solution {
  kind: 'folder' | 'files';
  /** Folder name, or the file names. */
  label: string;
  files: PickedFile[];
  skipped: Array<{ path: string; why: 'build' | 'blocked' | 'type' }>;
  bytes: number;
}

const SKIP = new Set<string>(PE_SKIP_DIRS.map((d) => d.toLowerCase()));
const STORED = new Set(['zip', 'rar', '7z', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mp3', 'jar', 'pdf', 'docx', 'xlsx', 'pptx', 'gz']);

/** Turns what was picked or dropped into a solution, leaving out what the rules exclude. */
export function buildSolution(kind: 'folder' | 'files', picked: PickedFile[], cfg: PeSubmissionConfig): Solution {
  const files: PickedFile[] = [];
  const skipped: Solution['skipped'] = [];
  for (const p of picked) {
    const parts = p.path.split('/').filter(Boolean);
    const dirs = parts.slice(kind === 'folder' ? 1 : 0, -1);
    if (kind === 'folder' && cfg.skipBuildDirs && dirs.some((d) => SKIP.has(d.toLowerCase()))) {
      skipped.push({ path: p.path, why: 'build' });
      continue;
    }
    if (isBlockedExt(p.file.name)) {
      skipped.push({ path: p.path, why: 'blocked' });
      continue;
    }
    if (kind === 'files' && !fileAllowed(p.file.name, cfg)) {
      skipped.push({ path: p.path, why: 'type' });
      continue;
    }
    files.push(p);
  }
  const root = kind === 'folder' ? picked[0]?.path.split('/')[0] ?? 'solution' : '';
  const label = kind === 'folder' ? root : files.map((f) => f.file.name).join(', ');
  return { kind, label, files, skipped, bytes: files.reduce((n, f) => n + f.file.size, 0) };
}

/** Folders are walked from a drop (Chrome, Edge, Firefox, Safari all expose entries). */
export async function filesFromDrop(dt: DataTransfer, skipDirs: boolean): Promise<{ kind: 'folder' | 'files'; files: PickedFile[] } | null> {
  const entries = [...dt.items].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) {
    const fl = [...dt.files];
    return fl.length ? { kind: 'files', files: fl.map((f) => ({ file: f, path: f.name })) } : null;
  }
  if (entries.length === 1 && entries[0]!.isDirectory) {
    const out: PickedFile[] = [];
    await walk(entries[0] as FileSystemDirectoryEntry, entries[0]!.name, out, skipDirs);
    return { kind: 'folder', files: out };
  }
  const out: PickedFile[] = [];
  for (const e of entries) {
    if (e.isFile) out.push({ file: await fileOf(e as FileSystemFileEntry), path: e.name });
    else await walk(e as FileSystemDirectoryEntry, e.name, out, skipDirs);
  }
  return { kind: 'files', files: out };
}

const fileOf = (e: FileSystemFileEntry) => new Promise<File>((res, rej) => e.file(res, rej));
async function walk(dir: FileSystemDirectoryEntry, prefix: string, out: PickedFile[], skipDirs: boolean) {
  const reader = dir.createReader();
  // readEntries returns at most 100 at a time.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    for (const e of batch) {
      const path = `${prefix}/${e.name}`;
      if (e.isFile) out.push({ file: await fileOf(e as FileSystemFileEntry), path });
      // Build folders are not even read when they will be left out: node_modules can hold 100 000 files.
      else if (skipDirs && SKIP.has(e.name.toLowerCase())) out.push({ file: new File([], '(bỏ qua)'), path: `${path}/(bỏ qua)` });
      else await walk(e as FileSystemDirectoryEntry, path, out, skipDirs);
    }
  }
}

/**
 * What is sent: one file as it is, or a .zip of the folder (or of several files) that keeps the
 * folder layout. Files that are already compressed are stored, the rest deflated.
 */
export async function packSolution(sol: Solution, zipName: string, onProgress?: (p: number) => void): Promise<{ blob: Blob; name: string }> {
  if (sol.kind === 'files' && sol.files.length === 1) {
    const f = sol.files[0]!.file;
    return { blob: f, name: f.name };
  }
  const tree: AsyncZippable = {};
  let done = 0;
  for (const p of sol.files) {
    const data = new Uint8Array(await p.file.arrayBuffer());
    tree[p.path] = [data, { level: STORED.has(extOf(p.file.name)) ? 0 : 6, mtime: p.file.lastModified || Date.now() }];
    done += p.file.size;
    onProgress?.(sol.bytes ? (done / sol.bytes) * 0.6 : 0.3);
  }
  const out = await new Promise<Uint8Array>((res, rej) => zip(tree, { level: 6 }, (err, data) => (err ? rej(err) : res(data))));
  onProgress?.(1);
  return { blob: new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), name: zipName };
}
