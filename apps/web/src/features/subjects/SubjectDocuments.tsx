import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Download, FileText, Folder, FolderOpen } from 'lucide-react';
import type { DocumentSummaryDto } from '@kaned/shared';
import { FileIcon } from '@/components/ui/FileBadge';
import { Skeleton } from '@/components/ui/Feedback';
import { useFolders } from '@/features/catalog/queries';
import { useDocuments } from '@/features/library/queries';
import { buildFolderTree, type FolderNode } from '@/lib/folders';
import { fmtCompact } from '@/lib/format';
import { cn } from '@/lib/cn';

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

function DocLine({ d }: { d: DocumentSummaryDto }) {
  return (
    <li>
      <Link to={`/app/library/${d.id}`}>
        <FileIcon format={d.format} size="xs" />
        <span className="sd-doc-t">{d.title}</span>
        {d.format !== 'LINK' && (
          <span className="stat-inline">
            <Download className="ic" />
            {fmtCompact(d.downloads)}
          </span>
        )}
      </Link>
    </li>
  );
}

function FolderBranch({ node, docsBy, depth }: { node: FolderNode; docsBy: Map<string, DocumentSummaryDto[]>; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const docs = docsBy.get(node.id) ?? [];
  if (!node.total) return null;
  return (
    <li className={cn('sd-folder', open && 'is-open')}>
      <button type="button" className="sd-folder-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronRight className="ic sd-chev" />
        {open ? <FolderOpen className="ic sd-fi" /> : <Folder className="ic sd-fi" />}
        <span>{node.name}</span>
        <small>{node.total}</small>
      </button>
      {open && (
        <ul className="sd-folder-body">
          {node.children.map((c) => (
            <FolderBranch key={c.id} node={c} docsBy={docsBy} depth={depth + 1} />
          ))}
          {docs.map((d) => (
            <DocLine key={d.id} d={d} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A subject's documents, grouped the way admins filed them: "Đề thi" →
 * "Đề thi 1, 2, 3…". Documents in no folder are listed after the folders.
 */
export function SubjectDocuments({ subjectId }: { subjectId: string }) {
  const { data: folders = [], isLoading: loadingFolders } = useFolders(subjectId);
  const { data, isLoading } = useDocuments({ subjectId: [subjectId], pageSize: 48, sort: 'recent' });
  const docs = data?.items ?? [];

  const { tree, docsBy, loose } = useMemo(() => {
    const by = new Map<string, DocumentSummaryDto[]>();
    const rest: DocumentSummaryDto[] = [];
    for (const d of [...docs].sort((a, b) => collator.compare(a.title, b.title))) {
      if (d.folder) by.set(d.folder.id, [...(by.get(d.folder.id) ?? []), d]);
      else rest.push(d);
    }
    return { tree: buildFolderTree(folders), docsBy: by, loose: rest };
  }, [docs, folders]);

  if (isLoading || loadingFolders) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <Skeleton style={{ height: 34 }} />
        <Skeleton style={{ height: 34 }} />
      </div>
    );
  }
  if (!docs.length) return <p className="sd-empty">Chưa có ai chia sẻ tài liệu cho môn này.</p>;

  const visibleFolders = tree.filter((f) => f.total > 0);
  return (
    <ul className="sd-docs">
      {visibleFolders.map((f) => (
        <FolderBranch key={f.id} node={f} docsBy={docsBy} depth={0} />
      ))}
      {visibleFolders.length > 0 && loose.length > 0 && (
        <li className="sd-loose">
          <FileText className="ic" />
          Tài liệu khác
        </li>
      )}
      {loose.slice(0, visibleFolders.length ? 8 : 6).map((d) => (
        <DocLine key={d.id} d={d} />
      ))}
    </ul>
  );
}
