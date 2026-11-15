import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel', className)} {...rest} />;
}

export function PanelHead({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="panel-head">
      <div className="ph-title">
        {icon && <span className="ph-ic">{icon}</span>}
        <div>
          <h2 className="t-h4">{title}</h2>
          {description && <p className="t-small">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

export interface Crumb {
  label: ReactNode;
  to?: string;
}

/** The band at the top of a page: breadcrumb, title, description, actions, on grid paper. */
export function PageHead({
  crumbs,
  title,
  description,
  actions,
  children,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="container">
        {crumbs && crumbs.length > 0 && (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <ChevronRight className="ic" aria-hidden />}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <div className="ph-row">
          <div>
            <h1 className="t-h1">{title}</h1>
            {description && <p className="ph-desc">{description}</p>}
          </div>
          {actions && <div className="ph-actions">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionHead({ title, description, link }: { title: ReactNode; description?: ReactNode; link?: ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="t-h2">{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {link}
    </div>
  );
}
