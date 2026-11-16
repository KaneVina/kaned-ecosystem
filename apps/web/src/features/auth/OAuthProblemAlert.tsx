import { CircleAlert, X } from 'lucide-react';
import { describeOAuthProblem, type OAuthProblem } from './oauth';

/** The reason a provider sign-in or link did not go through, with what to do next. */
export function OAuthProblemAlert({ problem, onDismiss }: { problem: OAuthProblem; onDismiss?: () => void }) {
  const { title, body } = describeOAuthProblem(problem);
  const soft = problem.code === 'cancelled';
  return (
    <div className={soft ? 'auth-alert is-soft' : 'auth-alert'} role="alert">
      <CircleAlert className="ic ic-sm" aria-hidden />
      <div>
        <b>{title}</b>
        <p>{body}</p>
      </div>
      {onDismiss && (
        <button type="button" className="auth-alert-x" onClick={onDismiss} aria-label="Đóng thông báo">
          <X className="ic ic-sm" />
        </button>
      )}
    </div>
  );
}
