import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, KeyRound, Languages, Link2, Mail, MousePointer2, ShieldCheck } from 'lucide-react';
import { setPointerFxEnabled, usePointerFxEnabled } from '@/lib/pointerFxPref';
import { setTranslateEnabled, useTranslateEnabled } from '@/lib/translatePref';
import {
  OAUTH_PROVIDER_LABELS,
  OAUTH_PROVIDERS,
  type AccountSecurityDto,
  type CurrentUserDto,
  type OAuthProviderId,
  type SetPasswordInput,
} from '@kaned/shared';
import { PageHead, Panel, PanelHead } from '@/components/ui/Panel';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Feedback';
import { http, toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { ProviderMark } from '@/features/auth/ProviderButtons';
import { OAuthProblemAlert } from '@/features/auth/OAuthProblemAlert';
import { useAuthConfig, useLinkProvider, type OAuthProblem } from '@/features/auth/oauth';

const SECURITY_KEY = ['auth', 'security'] as const;

function useSecurity() {
  return useQuery({
    queryKey: SECURITY_KEY,
    queryFn: async () => (await http.get<AccountSecurityDto>('/auth/security')).data,
  });
}

/** Keeps the signed-in user (avatar menu, profile) in step after a change here. */
function useSyncUser() {
  const { setUser } = useAuth();
  return async () => {
    const { data } = await http.get<CurrentUserDto>('/auth/me');
    setUser(data);
  };
}

/* ─────────────────────────────── password ─────────────────────────────── */

function PasswordPanel({ security }: { security: AccountSecurityDto }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const syncUser = useSyncUser();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'current' | 'next' | 'confirm', string>>>({});

  const save = useMutation({
    mutationFn: async (input: SetPasswordInput) => (await http.post<AccountSecurityDto>('/auth/password', input)).data,
    onSuccess: async (data) => {
      queryClient.setQueryData(SECURITY_KEY, data);
      await syncUser();
      toast.success(
        security.hasPassword ? 'Đã đổi mật khẩu' : 'Đã đặt mật khẩu',
        security.hasPassword ? 'Các thiết bị khác đã được đăng xuất.' : 'Giờ bạn đăng nhập được bằng email và mật khẩu.',
      );
      close();
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.fields?.currentPassword) setErrors({ current: err.fields.currentPassword });
      else if (err.fields?.newPassword) setErrors({ next: err.fields.newPassword });
      else toast.error('Chưa lưu được mật khẩu', err.message);
    },
  });

  function close() {
    setOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
  }

  const submit = () => {
    const found: typeof errors = {};
    if (security.hasPassword && !current) found.current = 'Nhập mật khẩu hiện tại.';
    if (next.length < 8) found.next = 'Mật khẩu cần ít nhất 8 ký tự.';
    else if (next === current) found.next = 'Chọn một mật khẩu khác mật khẩu hiện tại.';
    if (!found.next && confirm !== next) found.confirm = 'Hai mật khẩu chưa khớp.';
    setErrors(found);
    if (Object.keys(found).length) return;
    save.mutate({ currentPassword: security.hasPassword ? current : undefined, newPassword: next });
  };

  const others = security.identities.map((i) => OAUTH_PROVIDER_LABELS[i.provider]).join(', ');

  return (
    <Panel>
      <PanelHead
        icon={<KeyRound className="ic" />}
        title="Mật khẩu"
        description={
          security.hasPassword
            ? 'Bạn đăng nhập được bằng email và mật khẩu.'
            : `Bạn đang đăng nhập bằng ${others || 'tài khoản liên kết'}. Đặt mật khẩu để có thêm một cách đăng nhập.`
        }
        actions={
          !open && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
              {security.hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
            </button>
          )
        }
      />
      {open && (
        <form
          className="panel-pad stack-form st-pw"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {security.hasPassword && (
            <Field label="Mật khẩu hiện tại" htmlFor="pw-current" error={errors.current}>
              <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
            </Field>
          )}
          <div className="form-grid">
            <Field label="Mật khẩu mới" htmlFor="pw-new" error={errors.next} hint={errors.next ? undefined : 'Ít nhất 8 ký tự.'}>
              <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} autoFocus={!security.hasPassword} />
            </Field>
            <Field label="Nhập lại mật khẩu mới" htmlFor="pw-confirm" error={errors.confirm}>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </div>
          <div className="st-actions">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Huỷ
            </button>
            <button type="submit" className={cn('btn btn-primary', save.isPending && 'is-loading')}>
              {security.hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}

/* ─────────────────────────── linked accounts ─────────────────────────── */

function LinkedAccountsPanel({ security, problem, onDismiss }: { security: AccountSecurityDto; problem: OAuthProblem | null; onDismiss: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const syncUser = useSyncUser();
  const link = useLinkProvider();
  const [unlinking, setUnlinking] = useState<OAuthProviderId | null>(null);

  const unlink = useMutation({
    mutationFn: async (provider: OAuthProviderId) => (await http.delete<AccountSecurityDto>(`/auth/identities/${provider}`)).data,
    onSuccess: async (data, provider) => {
      queryClient.setQueryData(SECURITY_KEY, data);
      await syncUser();
      toast.success(`Đã bỏ liên kết ${OAUTH_PROVIDER_LABELS[provider]}`);
      setUnlinking(null);
    },
    onError: (e) => {
      toast.error('Chưa bỏ liên kết được', toApiError(e).message);
      setUnlinking(null);
    },
  });

  const available = new Set(security.available.map((p) => p.id));
  const linked = new Map(security.identities.map((i) => [i.provider, i]));
  // Linked providers always show, so one turned off on the server can still be removed.
  const rows = OAUTH_PROVIDERS.filter((p) => available.has(p) || linked.has(p));
  const onlyWay = (p: OAuthProviderId) => !security.hasPassword && security.identities.length === 1 && linked.has(p);

  return (
    <Panel>
      <PanelHead
        icon={<Link2 className="ic" />}
        title="Tài khoản liên kết"
        description="Đăng nhập nhanh bằng tài khoản bạn đã có. Kaned chỉ nhận tên, email và ảnh đại diện, không bao giờ đăng gì thay bạn."
      />
      <div className="panel-pad st-linked">
        {problem && <OAuthProblemAlert problem={problem} onDismiss={onDismiss} />}
        {rows.length === 0 ? (
          <p className="t-small st-empty">
            Máy chủ này chưa bật đăng nhập bằng Google, Microsoft, GitHub hay Facebook. Quản trị viên bật bằng cách thêm client ID và
            secret vào <code>apps/api/.env</code>.
          </p>
        ) : (
          <ul className="st-providers">
            {rows.map((p) => {
              const identity = linked.get(p);
              return (
                <li key={p}>
                  <ProviderMark provider={p} size={36} />
                  <div className="st-pv-info">
                    <b>{OAUTH_PROVIDER_LABELS[p]}</b>
                    {identity ? (
                      <span>
                        {identity.email ?? 'Đã liên kết'} · liên kết {fmtDate(identity.linkedAt)}
                        {identity.lastUsedAt ? ` · dùng gần nhất ${fmtDate(identity.lastUsedAt)}` : ''}
                      </span>
                    ) : (
                      <span>Chưa liên kết</span>
                    )}
                  </div>
                  {identity ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setUnlinking(p)}
                      disabled={onlyWay(p)}
                      title={onlyWay(p) ? 'Đây là cách đăng nhập duy nhất — đặt mật khẩu trước.' : undefined}
                    >
                      Bỏ liên kết
                    </button>
                  ) : available.has(p) ? (
                    <button
                      type="button"
                      className={cn('btn btn-secondary btn-sm', link.isPending && link.variables?.provider === p && 'is-loading')}
                      disabled={link.isPending}
                      onClick={() =>
                        link.mutate(
                          { provider: p, next: '/app/settings' },
                          { onError: (e) => toast.error(`Chưa liên kết được ${OAUTH_PROVIDER_LABELS[p]}`, toApiError(e).message) },
                        )
                      }
                    >
                      Liên kết
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {!security.hasPassword && security.identities.length === 1 && (
          <p className="t-small st-note">
            <ShieldCheck className="ic ic-xs" /> Đây là cách đăng nhập duy nhất của bạn nên chưa bỏ liên kết được. Đặt mật khẩu hoặc liên
            kết thêm một tài khoản khác trước.
          </p>
        )}
      </div>

      <Modal
        open={Boolean(unlinking)}
        onClose={() => !unlink.isPending && setUnlinking(null)}
        size="sm"
        title={`Bỏ liên kết ${unlinking ? OAUTH_PROVIDER_LABELS[unlinking] : ''}?`}
        description={`Bạn sẽ không đăng nhập Kaned bằng ${unlinking ? OAUTH_PROVIDER_LABELS[unlinking] : ''} được nữa, cho tới khi liên kết lại. Tài liệu, điểm và mọi dữ liệu khác giữ nguyên.`}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setUnlinking(null)} disabled={unlink.isPending}>
              Huỷ
            </button>
            <button
              type="button"
              className={cn('btn btn-danger', unlink.isPending && 'is-loading')}
              onClick={() => unlinking && unlink.mutate(unlinking)}
            >
              Bỏ liên kết
            </button>
          </>
        }
      />
    </Panel>
  );
}

/* ──────────────────────────────── page ──────────────────────────────── */

function TranslatePanel() {
  const on = useTranslateEnabled();
  return (
    <Panel>
      <PanelHead
        icon={<Languages className="ic" />}
        title="Dịch khi bôi đen"
        description="Bôi đen một đoạn chữ trên trang là Kaned tự dịch ngay, không cần bấm thêm. Kaned tự nhận ngôn ngữ và dịch sang tiếng Việt (hoặc tiếng Anh nếu đoạn đó là tiếng Việt). Cài đặt lưu trên thiết bị này."
        actions={
          <label className="st-switch">
            <input type="checkbox" role="switch" checked={on} onChange={(e) => setTranslateEnabled(e.target.checked)} />
            <span>{on ? 'Đang bật' : 'Đang tắt'}</span>
          </label>
        }
      />
    </Panel>
  );
}

function PointerFxPanel() {
  const on = usePointerFxEnabled();
  return (
    <Panel>
      <PanelHead
        icon={<MousePointer2 className="ic" />}
        title="Hiệu ứng tương tác"
        description="Trên máy tính, một vòng sáng nhẹ đi theo chuột và ôm lấy nút bạn rê vào. Trên điện thoại, chỗ bạn chạm sẽ gợn lên một vòng, và máy rung nhẹ khi bạn trả lời câu hỏi (máy Android). Tự tắt khi máy bật chế độ giảm chuyển động và trong phòng thi. Cài đặt lưu trên thiết bị này."
        actions={
          <label className="st-switch">
            <input type="checkbox" role="switch" checked={on} onChange={(e) => setPointerFxEnabled(e.target.checked)} />
            <span>{on ? 'Đang bật' : 'Đang tắt'}</span>
          </label>
        }
      />
    </Panel>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: security, isLoading } = useSecurity();
  const { data: config } = useAuthConfig();
  const problem = (location.state as { oauthProblem?: OAuthProblem } | null)?.oauthProblem ?? null;

  if (!user) return null;

  return (
    <>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Cài đặt tài khoản' }]}
        title="Cài đặt tài khoản"
        description="Những cách bạn đăng nhập vào Kaned."
      />
      <div className="container st-page">
        <Panel>
          <PanelHead
            icon={<Mail className="ic" />}
            title="Email đăng nhập"
            description="Email là định danh tài khoản Kaned của bạn và không đổi được."
            actions={<span className="st-email">{user.email}</span>}
          />
        </Panel>
        {isLoading || !security ? (
          <>
            <Skeleton style={{ height: 88, borderRadius: 16 }} />
            <Skeleton style={{ height: 240, borderRadius: 16 }} />
          </>
        ) : (
          <>
            <PasswordPanel security={security} />
            <LinkedAccountsPanel
              security={security}
              problem={problem}
              onDismiss={() => navigate(location.pathname, { replace: true, state: null })}
            />
          </>
        )}
        <TranslatePanel />
        <PointerFxPanel />
        <Panel>
          <PanelHead
            icon={<Activity className="ic" />}
            title="Dữ liệu hoạt động"
            description={`Để hỗ trợ bạn và cải thiện Kaned, hệ thống ghi lại trang, tài liệu và môn học bạn mở cùng thời gian xem, các lượt tìm kiếm, tải, lưu và đăng nhập, kèm trình duyệt, thiết bị và địa chỉ IP. Quản trị viên xem được các thông tin này. Kaned không ghi nội dung bạn gõ hay màn hình của bạn. Dữ liệu được giữ tối đa ${config?.activityRetentionDays ?? 180} ngày.`}
          />
        </Panel>
      </div>
    </>
  );
}
