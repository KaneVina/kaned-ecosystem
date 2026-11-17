import { useEffect, useMemo, useRef } from 'react';
import { CircleAlert, CircleCheck, Download, ExternalLink, FolderGit2, Github, GitBranch, Star, Terminal, TriangleAlert } from 'lucide-react';
import { GITHUB_KIND_LABELS, githubSlug, githubTargetName, parseGithubUrl, type GithubTarget } from '@kaned/shared';
import { filesUnder, GithubError, totalBytes, useGithubRelease, useGithubRepo, useGithubTree } from '@/lib/github';
import { fmtBytes, fmtInt, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * empty / invalid: nothing usable yet. missing: GitHub says the repository or
 * path is not there (private or mistyped). unverified: GitHub could not be
 * asked right now; the address may still be fine.
 */
export type GithubStatus = 'empty' | 'invalid' | 'checking' | 'ok' | 'missing' | 'unverified';

export const githubStatusUsable = (s: GithubStatus) => s === 'ok' || s === 'unverified' || s === 'checking';

export function githubStatusMessage(s: GithubStatus): string {
  if (s === 'empty') return 'Dán liên kết GitHub của tài liệu.';
  if (s === 'invalid') return 'Đây không phải liên kết GitHub. Dạng đúng: https://github.com/ten-ban/ten-repo';
  if (s === 'missing') return 'GitHub không mở được liên kết này — xem hướng dẫn bên trên.';
  return '';
}

const humanize = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A title and description to start from, taken from the address and the repository. */
export function githubSuggestion(target: GithubTarget, repoDescription?: string | null) {
  const name = humanize(githubTargetName(target));
  const title = target.path ? `${name} – ${humanize(target.repo)}` : name;
  return {
    title: title.slice(0, 150),
    description: repoDescription?.trim() ?? '',
  };
}

/** What a reader of the document will be able to do, for the "they will get" line. */
function offers(target: GithubTarget) {
  if (target.kind === 'file') return ['Tải tệp', 'Mở trên GitHub'];
  if (target.kind === 'release') return ['Tải tệp đính kèm', 'Tải mã nguồn (.zip)', 'Mở trên GitHub'];
  return [target.kind === 'folder' ? 'Tải thư mục (.zip)' : 'Tải repo (.zip)', 'Duyệt từng tệp', 'Lệnh git', 'Mở trên GitHub'];
}

export function GithubSource({
  id,
  value,
  onChange,
  guide,
  onGuide,
  onStatus,
  onSuggest,
  error,
}: {
  id: string;
  value: string;
  onChange: (url: string) => void;
  guide: string;
  onGuide: (text: string) => void;
  onStatus?: (status: GithubStatus) => void;
  /** Called once per new address with a title and description to pre-fill empty fields. */
  onSuggest?: (s: { title: string; description: string }) => void;
  /** Shown under the address field, e.g. after a submit with no usable address. */
  error?: string;
}) {
  const target = useMemo(() => parseGithubUrl(value), [value]);
  const repo = useGithubRepo(target);
  const ref = target?.ref ?? repo.data?.defaultBranch ?? null;
  const tree = useGithubTree(target, ref);
  const release = useGithubRelease(target);

  const files = tree.data && target ? filesUnder(tree.data, target.path) : null;
  const blobs = files?.filter((f) => f.type === 'blob') ?? [];
  const pathMissing = Boolean(target?.path && tree.data && !tree.data.truncated && files && files.length === 0);
  const repoError = repo.error instanceof GithubError ? repo.error.kind : repo.error ? 'offline' : null;
  const treeError = tree.error instanceof GithubError ? tree.error.kind : null;
  const releaseError = release.error instanceof GithubError ? release.error.kind : null;

  const status: GithubStatus = !value.trim()
    ? 'empty'
    : !target
      ? 'invalid'
      : repoError === 'missing' || treeError === 'missing' || releaseError === 'missing' || pathMissing
        ? 'missing'
        : repoError || treeError || releaseError
          ? 'unverified'
          : repo.isLoading || tree.isLoading || release.isLoading
            ? 'checking'
            : 'ok';

  useEffect(() => onStatus?.(status), [status, onStatus]);

  // Suggest once per address, after the repository answered (or could not).
  const suggested = useRef('');
  useEffect(() => {
    if (!target || !onSuggest || repo.isLoading || (repo.error instanceof GithubError && repo.error.kind === 'missing')) return;
    const key = value.trim();
    if (suggested.current === key) return;
    suggested.current = key;
    onSuggest(githubSuggestion(target, repo.data?.description));
  }, [target, value, repo.isLoading, repo.data, onSuggest]);

  const where = target?.path || (target?.kind === 'release' ? (target.ref ?? 'Bản mới nhất') : '');

  return (
    <div className="gh-src">
      <div className={cn('field gh-url', error && 'invalid')}>
        <div className="input-group">
          <Github className="ic ic-sm" />
          <input
            id={id}
            className="input"
            type="url"
            inputMode="url"
            spellCheck={false}
            placeholder="https://github.com/ten-ban/ten-repo/tree/main/Lab1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Liên kết GitHub"
            aria-describedby={`${id}-hint`}
          />
        </div>
        <p className="hint gh-hint" id={`${id}-hint`}>
          Dán liên kết repo, một thư mục (…/tree/main/Lab1) hoặc một tệp (…/blob/main/de-thi.pdf). Repo cần để Public.
        </p>
        <span className="error-text">
          <CircleAlert className="ic ic-xs" />
          <span>{error}</span>
        </span>
      </div>

      {status === 'invalid' && value.trim().length > 8 && (
        <div className="gh-note is-bad" role="alert">
          <CircleAlert className="ic ic-sm" />
          <span>
            Đây không phải liên kết GitHub. Với Google Drive, Canva hay trang khác, chọn <b>Dán liên kết</b>.
          </span>
        </div>
      )}

      {target && (
        <div className={cn('gh-check', status === 'missing' && 'is-bad', status === 'checking' && 'is-checking')} aria-live="polite">
          <span className="gh-avatar">
            {repo.data ? <img src={repo.data.ownerAvatar} alt="" loading="lazy" /> : <FolderGit2 className="ic ic-sm" />}
          </span>
          <div className="gh-check-main">
            <div className="gh-check-top">
              <b className="clamp-1">{githubSlug(target)}</b>
              {status === 'ok' && (
                <span className="gh-pill ok">
                  <CircleCheck className="ic ic-xs" />
                  Công khai
                </span>
              )}
              {status === 'checking' && <span className="gh-pill">Đang kiểm tra…</span>}
            </div>
            <div className="gh-check-where">
              <span className="gh-kind">{GITHUB_KIND_LABELS[target.kind]}</span>
              {where && <span className="clamp-1 gh-path">{where}</span>}
              {ref && target.kind !== 'release' && (
                <span className="gh-ref">
                  <GitBranch className="ic ic-xs" />
                  {ref}
                </span>
              )}
            </div>
            {status === 'ok' && (
              <div className="gh-check-stats">
                {target.kind === 'release' && release.data ? (
                  <span>
                    {release.data.name} · {release.data.assets.length} tệp đính kèm
                  </span>
                ) : (
                  files && (
                    <span>
                      {target.kind === 'file' ? fmtBytes(totalBytes(blobs)) : `${fmtInt(blobs.length)} tệp · ${fmtBytes(totalBytes(blobs))}`}
                    </span>
                  )
                )}
                {repo.data && (
                  <>
                    <span>
                      <Star className="ic ic-xs" />
                      {fmtInt(repo.data.stars)}
                    </span>
                    <span>Cập nhật {timeAgo(repo.data.pushedAt)}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {status === 'missing' && target && (
        <div className="gh-note is-bad" role="alert">
          <CircleAlert className="ic ic-sm" />
          <span>
            {pathMissing ? (
              <>
                Không thấy {target.kind === 'file' ? 'tệp' : 'thư mục'} <b>{target.path}</b> trên nhánh <b>{ref}</b>. Mở lại thư mục trên GitHub rồi
                sao chép liên kết trên thanh địa chỉ.
              </>
            ) : (
              <>
                GitHub không mở được <b>{githubSlug(target)}</b>: repo đang để <b>Private</b> hoặc liên kết bị sai. Trên GitHub, vào Settings → Danger
                Zone → Change visibility → Public, rồi dán lại.
              </>
            )}
          </span>
        </div>
      )}
      {status === 'unverified' && (
        <div className="gh-note is-warn">
          <TriangleAlert className="ic ic-sm" />
          <span>Chưa kiểm tra được với GitHub lúc này. Bạn vẫn đăng được — chỉ cần chắc repo đang để Public.</span>
        </div>
      )}

      {target && status !== 'missing' && (
        <div className="gh-offers">
          <span>Người xem sẽ có:</span>
          {offers(target).map((o, i) => (
            <span key={o} className="gh-offer">
              {i === 0 ? (
                <Download className="ic ic-xs" />
              ) : o === 'Lệnh git' ? (
                <Terminal className="ic ic-xs" />
              ) : o === 'Mở trên GitHub' ? (
                <ExternalLink className="ic ic-xs" />
              ) : null}
              {o}
            </span>
          ))}
        </div>
      )}

      <div className="field gh-guide">
        <label className="label" htmlFor={`${id}-guide`}>
          Cách tải & sử dụng <span className="opt">(không bắt buộc)</span>
        </label>
        <textarea
          id={`${id}-guide`}
          className="textarea"
          maxLength={1500}
          rows={4}
          placeholder={'Ví dụ:\nGiải nén, mở Lab1.sln bằng Visual Studio 2022.\nChạy database.sql trong SQL Server trước khi chạy code.'}
          value={guide}
          onChange={(e) => onGuide(e.target.value)}
        />
        <div className="field-row">
          <span className="hint">Kaned đã tự tạo nút tải và lệnh git. Ghi thêm phần mềm cần dùng, thứ tự chạy, mật khẩu giải nén…</span>
          <span className="counter">{guide.length}/1500</span>
        </div>
      </div>
    </div>
  );
}
