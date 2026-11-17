import { useMemo, useState } from 'react';
import {
  Archive,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Github,
  Presentation,
  Scale,
  Star,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import { githubCommands, githubPageUrl, githubRepoUrl, type DocumentDetailDto } from '@kaned/shared';
import { GithubError, totalBytes, type GithubEntry } from '@/lib/github';
import { RichText } from '@/components/ui/RichText';
import { Skeleton } from '@/components/ui/Feedback';
import { useToast } from '@/providers/ToastProvider';
import { fmtBytes, fmtDate, fmtInt, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { GithubDocument } from './useGithubDocument';

interface Node {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  files: number;
  children: Node[];
}

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

/** Nests the flat GitHub listing under `base`, folders first, with file counts and sizes. */
function buildTree(entries: GithubEntry[], base: string): Node[] {
  const root: Node = { name: '', path: base, dir: true, size: 0, files: 0, children: [] };
  const dirs = new Map<string, Node>([['', root]]);
  const cut = base ? base.length + 1 : 0;
  const dirFor = (rel: string): Node => {
    const hit = dirs.get(rel);
    if (hit) return hit;
    const slash = rel.lastIndexOf('/');
    const parent = dirFor(slash < 0 ? '' : rel.slice(0, slash));
    const node: Node = { name: rel.slice(slash + 1), path: base ? `${base}/${rel}` : rel, dir: true, size: 0, files: 0, children: [] };
    parent.children.push(node);
    dirs.set(rel, node);
    return node;
  };
  for (const e of entries) {
    if (e.path === base) continue;
    const rel = e.path.slice(cut);
    if (e.type === 'tree') {
      dirFor(rel);
      continue;
    }
    const slash = rel.lastIndexOf('/');
    dirFor(slash < 0 ? '' : rel.slice(0, slash)).children.push({
      name: rel.slice(slash + 1),
      path: e.path,
      dir: false,
      size: e.size,
      files: 1,
      children: [],
    });
  }
  const finish = (n: Node) => {
    if (!n.dir) return;
    n.children.forEach(finish);
    n.files = n.children.reduce((s, c) => s + c.files, 0);
    n.size = n.children.reduce((s, c) => s + c.size, 0);
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || collator.compare(a.name, b.name));
  };
  finish(root);
  return root.children;
}

function fileIconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return FileImage;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'jar'].includes(ext)) return Archive;
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['pptx', 'ppt'].includes(ext)) return Presentation;
  if (['pdf', 'docx', 'doc', 'md', 'txt'].includes(ext)) return FileText;
  if (
    ['java', 'js', 'ts', 'tsx', 'jsx', 'py', 'c', 'cpp', 'h', 'cs', 'html', 'css', 'sql', 'json', 'xml', 'php', 'kt', 'dart', 'go', 'rb', 'sh'].includes(
      ext,
    )
  )
    return FileCode2;
  return File;
}

const SHOW_PER_FOLDER = 120;

function Rows({ nodes, depth, gh, more }: { nodes: Node[]; depth: number; gh: GithubDocument; more: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(depth === 0 && nodes.length === 1 && nodes[0].dir ? [nodes[0].path] : []));
  const shown = nodes.slice(0, SHOW_PER_FOLDER);
  const toggle = (path: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <>
      {shown.map((n) => {
        const busy = gh.job?.path === n.path;
        if (n.dir) {
          const isOpen = open.has(n.path);
          return (
            <li key={n.path} className={cn('ghv-row is-dir', isOpen && 'is-open')} style={{ ['--d' as string]: depth }}>
              <div className="ghv-line">
                <button type="button" className="ghv-name" aria-expanded={isOpen} onClick={() => toggle(n.path)}>
                  <ChevronRight className="ic ghv-chev" />
                  {isOpen ? <FolderOpen className="ic ghv-fi" /> : <Folder className="ic ghv-fi" />}
                  <span className="clamp-1">{n.name}</span>
                </button>
                <span className="ghv-size">
                  {fmtInt(n.files)} tệp · {fmtBytes(n.size)}
                </span>
                <button
                  type="button"
                  className={cn('icon-btn ghv-act', busy && 'is-busy')}
                  data-tip={`Tải thư mục ${n.name} (.zip)`}
                  aria-label={`Tải thư mục ${n.name} dạng ZIP`}
                  disabled={Boolean(gh.job)}
                  onClick={() => gh.zipFolder(n.path)}
                >
                  {busy ? <span className="ghv-pct">{Math.round((gh.job?.share ?? 0) * 100)}%</span> : <Download className="ic ic-sm" />}
                </button>
              </div>
              {isOpen && (
                <ul className="ghv-sub">
                  <Rows nodes={n.children} depth={depth + 1} gh={gh} more={more} />
                </ul>
              )}
            </li>
          );
        }
        const Icon = fileIconFor(n.name);
        return (
          <li key={n.path} className="ghv-row" style={{ ['--d' as string]: depth }}>
            <div className="ghv-line">
              <a className="ghv-name" href={githubPageUrl({ ...gh.target!, kind: 'file', path: n.path }, gh.ref)} target="_blank" rel="noopener noreferrer">
                <span className="ghv-chev-space" />
                <Icon className="ic ghv-fi" />
                <span className="clamp-1">{n.name}</span>
              </a>
              <span className="ghv-size">{fmtBytes(n.size)}</span>
              <button
                type="button"
                className={cn('icon-btn ghv-act', busy && 'is-busy')}
                data-tip={`Tải ${n.name}`}
                aria-label={`Tải ${n.name}`}
                disabled={Boolean(gh.job)}
                onClick={() => gh.downloadFile(n.path)}
              >
                {busy ? <span className="spin" /> : <Download className="ic ic-sm" />}
              </button>
            </div>
          </li>
        );
      })}
      {nodes.length > shown.length && (
        <li className="ghv-row ghv-more" style={{ ['--d' as string]: depth }}>
          <a href={more} target="_blank" rel="noopener noreferrer">
            Còn {fmtInt(nodes.length - shown.length)} mục — xem đủ trên GitHub
            <ExternalLink className="ic ic-xs" />
          </a>
        </li>
      )}
    </>
  );
}

/** The repository, folder, file or release behind a GitHub document, browsable and downloadable. */
export function GithubViewer({ gh }: { gh: GithubDocument }) {
  const { target, repo, ref, tree, release, files } = gh;
  const nodes = useMemo(() => (files && target ? buildTree(files, target.path) : []), [files, target]);
  if (!target) return null;

  const page = githubPageUrl(target, ref);
  const crumbs = target.path ? target.path.split('/') : [];
  const err = [repo.error, tree.error, release.error].find(Boolean);
  const errKind = err instanceof GithubError ? err.kind : err ? 'offline' : null;
  const loading = repo.isLoading || tree.isLoading || release.isLoading;
  const blobs = gh.blobs;

  return (
    <section className="panel gh-viewer" id="gh-viewer" aria-label="Nội dung trên GitHub">
      <header className="ghv-head">
        <span className="ghv-mark">
          <Github className="ic" />
        </span>
        <nav className="ghv-crumbs" aria-label="Vị trí trên GitHub">
          <a href={`https://github.com/${target.owner}`} target="_blank" rel="noopener noreferrer">
            {target.owner}
          </a>
          <span>/</span>
          <a href={githubRepoUrl(target)} target="_blank" rel="noopener noreferrer">
            <b>{target.repo}</b>
          </a>
          {crumbs.map((c, i) => (
            <span key={i} className="ghv-crumb">
              <span>/</span>
              {i === crumbs.length - 1 ? <b>{c}</b> : c}
            </span>
          ))}
        </nav>
        <span className="spacer" />
        <a className="btn btn-secondary btn-sm" href={page} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="ic ic-sm" />
          Mở trên GitHub
        </a>
      </header>

      <div className="ghv-meta">
        {ref && target.kind !== 'release' && (
          <span className="ghv-ref">
            <GitBranch className="ic ic-xs" />
            {ref}
          </span>
        )}
        {repo.data && (
          <>
            <span>
              <Star className="ic ic-xs" />
              {fmtInt(repo.data.stars)}
            </span>
            <span>Cập nhật {timeAgo(repo.data.pushedAt)}</span>
            {repo.data.license && (
              <span>
                <Scale className="ic ic-xs" />
                {repo.data.license}
              </span>
            )}
            {repo.data.archived && <span className="ghv-flag">Đã lưu trữ</span>}
          </>
        )}
        {repo.data?.description && <p className="ghv-desc">{repo.data.description}</p>}
      </div>

      {errKind === 'missing' ? (
        <div className="ghv-state is-bad">
          <CircleAlert className="ic" />
          <div>
            <b>Không mở được trên GitHub</b>
            <p>Repo có thể đã chuyển sang Private, đổi tên hoặc bị xoá. Hãy báo cho người chia sẻ, hoặc dùng nút báo cáo bên phải.</p>
          </div>
        </div>
      ) : errKind ? (
        <div className="ghv-state is-warn">
          <TriangleAlert className="ic" />
          <div>
            <b>Chưa xem được danh sách tệp lúc này</b>
            <p>GitHub giới hạn số lần xem cho mỗi mạng. Nút tải vẫn dùng được, hoặc mở thẳng trên GitHub.</p>
          </div>
        </div>
      ) : loading ? (
        <ul className="ghv-list" aria-busy>
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="ghv-row">
              <div className="ghv-line">
                <Skeleton style={{ height: 14, width: `${40 + ((i * 17) % 35)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : target.kind === 'release' && release.data ? (
        <div className="ghv-release">
          <div className="ghv-rel-head">
            <b>{release.data.name}</b>
            <span>
              {release.data.tag}
              {release.data.publishedAt && ` · ${fmtDate(release.data.publishedAt)}`}
            </span>
          </div>
          <ul className="ghv-list">
            {release.data.assets.map((a) => (
              <li key={a.url} className="ghv-row">
                <div className="ghv-line">
                  <a className="ghv-name" href={a.url}>
                    <Archive className="ic ghv-fi" />
                    <span className="clamp-1">{a.name}</span>
                  </a>
                  <span className="ghv-size">
                    {fmtBytes(a.size)} · {fmtInt(a.downloads)} lượt tải
                  </span>
                  <a className="icon-btn ghv-act" href={a.url} data-tip={`Tải ${a.name}`} aria-label={`Tải ${a.name}`}>
                    <Download className="ic ic-sm" />
                  </a>
                </div>
              </li>
            ))}
            <li className="ghv-row">
              <div className="ghv-line">
                <a className="ghv-name" href={release.data.zipUrl}>
                  <FileCode2 className="ic ghv-fi" />
                  <span>Mã nguồn (.zip)</span>
                </a>
                <span className="ghv-size">GitHub tạo sẵn</span>
                <a className="icon-btn ghv-act" href={release.data.zipUrl} data-tip="Tải mã nguồn" aria-label="Tải mã nguồn dạng ZIP">
                  <Download className="ic ic-sm" />
                </a>
              </div>
            </li>
          </ul>
        </div>
      ) : files && files.length === 0 ? (
        <div className="ghv-state">
          <FolderOpen className="ic" />
          <div>
            <b>Không thấy {target.kind === 'file' ? 'tệp' : 'thư mục'} này trên nhánh {ref}</b>
            <p>Có thể nó đã được đổi tên hoặc chuyển chỗ. Mở repo trên GitHub để tìm.</p>
          </div>
        </div>
      ) : (
        <ul className="ghv-list">
          <Rows nodes={nodes} depth={0} gh={gh} more={page} />
        </ul>
      )}

      {files && files.length > 0 && target.kind !== 'release' && (
        <footer className="ghv-foot">
          <span>
            {target.kind === 'file' ? '1 tệp' : `${fmtInt(blobs.length)} tệp`} · {fmtBytes(totalBytes(blobs))}
          </span>
          {tree.data?.truncated && <span>Repo rất lớn, danh sách có thể chưa đủ.</span>}
        </footer>
      )}
    </section>
  );
}

function CopyBlock({ lines }: { lines: string[] }) {
  const toast = useToast();
  const text = lines.join('\n');
  return (
    <div className="gh-cmd">
      <div className="gh-cmd-head">
        <span>Terminal / Git Bash</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(text);
            toast.success('Đã sao chép lệnh', 'Dán vào Terminal hoặc Git Bash.');
          }}
        >
          <Copy className="ic ic-sm" />
          Sao chép
        </button>
      </div>
      <pre>
        <code>
          {lines.map((l) => (
            <span key={l}>
              <i aria-hidden>$</i>
              {l}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

/** "How to get it": the uploader's own notes, then each way to download. */
export function GithubGetPanel({ doc, gh }: { doc: DocumentDetailDto; gh: GithubDocument }) {
  const { target, ref, primary, blobs } = gh;
  if (!target || !primary) return null;
  const name = target.path.split('/').pop() || target.repo;
  const zipHow =
    target.kind === 'folder'
      ? `Kaned gom ${blobs.length ? `${fmtInt(blobs.length)} tệp` : 'các tệp'} trong thư mục ${name} thành một file ZIP ngay trên trình duyệt. Không cần tài khoản GitHub.`
      : target.kind === 'file'
        ? `Tải đúng tệp ${name}${blobs[0] ? ` (${fmtBytes(blobs[0].size)})` : ''}.`
        : target.kind === 'release'
          ? 'Các tệp đính kèm của bản phát hành được liệt kê ở khung bên trên.'
          : `Một file ZIP chứa toàn bộ repo${ref ? `, nhánh ${ref}` : ''}. Giải nén là dùng được.`;
  const progress = gh.job && gh.job.path === target.path ? Math.round(gh.job.share * 100) : null;

  return (
    <section className="panel panel-pad gh-get">
      <h2 className="t-h3">Cách tải về</h2>
      {doc.guide && (
        <div className="gh-note-from">
          <span className="gh-note-label">Người chia sẻ dặn</span>
          <RichText text={doc.guide} />
        </div>
      )}
      <ul className="gh-ways">
        <li className="gh-way">
          <span className="gh-way-ic">
            <Download className="ic ic-sm" />
          </span>
          <div className="gh-way-main">
            <b>{primary.label}</b>
            <p>{zipHow}</p>
          </div>
          <button type="button" className={cn('btn btn-primary btn-sm', progress !== null && 'is-loading')} onClick={primary.run} disabled={Boolean(gh.job)}>
            {progress !== null ? `${progress}%` : primary.label.replace(/ \(\.zip\)$/, '')}
          </button>
        </li>
        <li className="gh-way">
          <span className="gh-way-ic">
            <Github className="ic ic-sm" />
          </span>
          <div className="gh-way-main">
            <b>Mở trên GitHub</b>
            <p>Xem từng tệp và lịch sử chỉnh sửa. Ở trang repo, bấm nút Code → Download ZIP để tải cả repo.</p>
          </div>
          <a className="btn btn-secondary btn-sm" href={githubPageUrl(target, ref)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="ic ic-sm" />
            Mở
          </a>
        </li>
        {(target.kind === 'repo' || target.kind === 'folder') && (
          <li className="gh-way gh-way-git">
            <span className="gh-way-ic">
              <Terminal className="ic ic-sm" />
            </span>
            <div className="gh-way-main">
              <b>Dùng Git</b>
              <p>
                {target.kind === 'folder'
                  ? `Chỉ lấy thư mục ${name}, và cập nhật được bằng git pull khi người chia sẻ sửa.`
                  : 'Lấy bản mới nhất, và cập nhật được bằng git pull khi người chia sẻ sửa.'}
              </p>
              <CopyBlock lines={githubCommands(target, target.ref)} />
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
