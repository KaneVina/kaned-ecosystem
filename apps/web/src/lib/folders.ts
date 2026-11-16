import type { FolderDto } from '@kaned/shared';

export interface FolderNode extends FolderDto {
  depth: number;
  children: FolderNode[];
  /** Documents here and in every subfolder. */
  total: number;
}

/** Builds the folder tree, keeping the order the API returned. */
export function buildFolderTree(folders: FolderDto[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(folders.map((f) => [f.id, { ...f, depth: 0, children: [], total: f.documentCount }]));
  const roots: FolderNode[] = [];
  for (const f of folders) {
    const node = nodes.get(f.id)!;
    const parent = f.parentId ? nodes.get(f.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const walk = (list: FolderNode[], depth: number): number =>
    list.reduce((sum, n) => {
      n.depth = depth;
      n.total = n.documentCount + walk(n.children, depth + 1);
      return sum + n.total;
    }, 0);
  walk(roots, 0);
  return roots;
}

/** Depth-first list, for selects and the sidebar tree. */
export function flattenTree(roots: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const visit = (list: FolderNode[]) => list.forEach((n) => (out.push(n), visit(n.children)));
  visit(roots);
  return out;
}

/** "Đề thi / Cuối kỳ" for a folder id. */
export function folderPath(folders: FolderDto[], id: string | null | undefined): FolderDto[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: FolderDto[] = [];
  for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) path.unshift(cur);
  return path;
}
