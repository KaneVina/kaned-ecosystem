import { Link } from 'react-router-dom';
import { BadgeCheck, BookOpen, Building2, Check, Copy, ExternalLink, Facebook, FileText, FlaskConical, Github, Globe, GraduationCap, Linkedin, Mail, Phone, UserRound, Youtube, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { LECTURER_GENDER_LABELS, LECTURER_KIND_LABELS, LECTURER_LINK_LABELS, type LecturerDetailDto, type LecturerDto, type LecturerLinkKind } from '@kaned/shared';
import { DocCard } from '@/components/library/DocCard';
import { useToast } from '@/providers/ToastProvider';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';

/** "Nguyễn Thị Hoàng" → "NH": family name and given name. */
export function initials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0][0] : w[0][0] + w[w.length - 1][0]).toUpperCase();
}

export function LecturerAvatar({ l, size = 48 }: { l: Pick<LecturerDto, 'fullName' | 'university'>; size?: number }) {
  return (
    <span
      className="lec-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ['--uni' as string]: l.university.color }}
      aria-hidden
    >
      {initials(l.fullName)}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn lec-copy"
      aria-label={`Sao chép ${label}`}
      data-tip={done ? 'Đã sao chép' : `Sao chép ${label}`}
      onClick={async () => {
        await navigator.clipboard?.writeText(text);
        setDone(true);
        toast.success(`Đã sao chép ${label}`, text);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="ic ic-sm" /> : <Copy className="ic ic-sm" />}
    </button>
  );
}

/** Phone, email: tap to call or write, or copy. */
export function LecturerContacts({ l }: { l: LecturerDto }) {
  if (!l.phone && !l.email) return <p className="lec-none">Chưa có thông tin liên hệ.</p>;
  return (
    <ul className="lec-contacts">
      {l.phone && (
        <li>
          <span className="lec-c-ic">
            <Phone className="ic ic-sm" />
          </span>
          <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`}>{l.phone}</a>
          <CopyButton text={l.phone} label="số điện thoại" />
        </li>
      )}
      {l.email && (
        <li>
          <span className="lec-c-ic">
            <Mail className="ic ic-sm" />
          </span>
          <a href={`mailto:${l.email}`}>{l.email}</a>
          <CopyButton text={l.email} label="email" />
        </li>
      )}
    </ul>
  );
}

const LINK_ICONS: Record<LecturerLinkKind, LucideIcon> = {
  github: Github,
  linkedin: Linkedin,
  scholar: GraduationCap,
  researchgate: FlaskConical,
  orcid: BadgeCheck,
  facebook: Facebook,
  youtube: Youtube,
  website: Globe,
};

/** "fe.edu.vn/~hoangnt" from a full address, for the second line of a link. */
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

/** Portfolio, GitHub, LinkedIn… each opens in a new tab. */
export function LecturerLinks({ l, compact }: { l: LecturerDto; compact?: boolean }) {
  if (!l.links.length) return null;
  return (
    <ul className={cn('lec-links', compact && 'is-compact')}>
      {l.links.map((link) => {
        const Icon = LINK_ICONS[link.kind];
        return (
          <li key={link.url}>
            <a href={link.url} target="_blank" rel="noopener noreferrer" className={cn('lec-link', `is-${link.kind}`)}>
              <span className="lec-link-ic">
                <Icon className="ic ic-sm" />
              </span>
              <span className="lec-link-text">
                <b>{link.label ?? LECTURER_LINK_LABELS[link.kind]}</b>
                <small className="clamp-1">{shortUrl(link.url)}</small>
              </span>
              <ExternalLink className="ic ic-xs lec-link-go" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Who the lecturer is: name, code, school, department, gender. */
export function LecturerHeader({ l, as: Tag = 'h1' }: { l: LecturerDto; as?: 'h1' | 'h2' }) {
  return (
    <div className="lec-head">
      <LecturerAvatar l={l} size={Tag === 'h1' ? 76 : 60} />
      <div className="lec-head-text">
        <Tag className={Tag === 'h1' ? 't-h1' : 't-h2'}>{l.fullName}</Tag>
        <div className="lec-meta">
          <span className={cn('lec-kind', `is-${l.kind.toLowerCase()}`)}>{LECTURER_KIND_LABELS[l.kind]}</span>
          <span className="lec-code">{l.code}</span>
          {l.gender && (
            <span>
              <UserRound className="ic ic-xs" />
              {LECTURER_GENDER_LABELS[l.gender]}
            </span>
          )}
          <span>
            <Building2 className="ic ic-xs" />
            {l.university.code}
          </span>
          {l.department && (
            <span>
              <BookOpen className="ic ic-xs" />
              {l.department}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The facts as a definition list, for the dialog and the side of the page. */
export function LecturerFacts({ l }: { l: LecturerDto }) {
  return (
    <dl className="lec-facts">
      <div>
        <dt>Họ và tên</dt>
        <dd>{l.fullName}</dd>
      </div>
      <div>
        <dt>Vai trò</dt>
        <dd>{LECTURER_KIND_LABELS[l.kind]}</dd>
      </div>
      <div>
        <dt>Mã {LECTURER_KIND_LABELS[l.kind].toLowerCase()}</dt>
        <dd>{l.code}</dd>
      </div>
      <div>
        <dt>Trường</dt>
        <dd>{l.university.nameVi}</dd>
      </div>
      <div>
        <dt>Bộ môn</dt>
        <dd>{l.department ?? <span className="lec-none">Chưa cập nhật</span>}</dd>
      </div>
      <div>
        <dt>Giới tính</dt>
        <dd>{l.gender ? LECTURER_GENDER_LABELS[l.gender] : <span className="lec-none">Chưa cập nhật</span>}</dd>
      </div>
    </dl>
  );
}

/** Subjects taught, as links to the subject pages. */
export function LecturerSubjects({ l }: { l: LecturerDetailDto }) {
  if (!l.subjects.length) return null;
  return (
    <div className="lec-subjects">
      {l.subjects.map((s) => (
        <Link key={s.id} to={`/app/subjects/${encodeURIComponent(s.code)}`} className="lec-subject" title={s.nameVi}>
          <b>{s.code}</b>
          <span className="clamp-1">{s.nameVi}</span>
          <i>{s.count}</i>
        </Link>
      ))}
    </div>
  );
}

/** One lecturer in the directory grid. */
export function LecturerCard({ l }: { l: LecturerDto }) {
  return (
    <Link to={`/app/lecturers/${l.id}`} className="lec-card">
      <LecturerAvatar l={l} size={52} />
      <div className="lec-card-main">
        <b className="clamp-1">{l.fullName}</b>
        <span className="lec-card-sub">
          <span className="lec-code">{l.code}</span>
          <span className="lec-card-dept">{l.department ?? (l.kind === 'STAFF' ? 'Chưa rõ đơn vị' : 'Chưa rõ bộ môn')}</span>
        </span>
        <span className="lec-card-foot">
          <span className={cn('lec-kind', `is-${l.kind.toLowerCase()}`)}>{LECTURER_KIND_LABELS[l.kind]}</span>
          <span>{l.university.code}</span>
          {l.gender && <span>{LECTURER_GENDER_LABELS[l.gender]}</span>}
          <span className={cn(!l.documentCount && 'is-zero')}>
            <FileText className="ic ic-xs" />
            {fmtInt(l.documentCount)} tài liệu
          </span>
        </span>
      </div>
      <span className="lec-card-contact" aria-hidden>
        {l.phone && <Phone className="ic ic-sm" />}
        {l.email && <Mail className="ic ic-sm" />}
      </span>
    </Link>
  );
}

/** Documents linked to the lecturer. */
export function LecturerDocuments({ l }: { l: LecturerDetailDto }) {
  if (!l.documents.length) return <p className="lec-none">Chưa có tài liệu nào được gắn với giảng viên này.</p>;
  return (
    <div className="grid-docs grid-3">
      {l.documents.map((d) => (
        <DocCard key={d.id} doc={d} />
      ))}
    </div>
  );
}
