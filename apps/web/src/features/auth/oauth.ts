import { useMutation, useQuery } from '@tanstack/react-query';
import {
  OAUTH_PROVIDER_LABELS,
  safeNextPath,
  type AuthConfigDto,
  type OAuthErrorCode,
  type OAuthProviderId,
} from '@kaned/shared';
import { http } from '@/lib/api';
import { queryKeys } from '@/lib/queryClient';

export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.authConfig,
    queryFn: async () => (await http.get<AuthConfigDto>('/auth/config')).data,
    staleTime: 5 * 60_000,
  });
}

/** Full-page navigation to the API, which sends the browser on to the provider. */
export function oauthStartHref(startUrl: string, next?: string) {
  const url = new URL(startUrl, window.location.origin);
  url.searchParams.set('next', safeNextPath(next));
  return url.toString();
}

/** Linking needs the signed-in account, so the API hands out a short-lived start URL first. */
export function useLinkProvider() {
  return useMutation({
    mutationFn: async ({ provider, next }: { provider: OAuthProviderId; next?: string }) =>
      (await http.post<{ url: string }>(`/auth/oauth/${provider}/link`, { next })).data,
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

/** Errors the web app adds on top of the API's (see OAUTH_ERROR_CODES). */
export type OAuthProblemCode = OAuthErrorCode | 'session_lost';

export interface OAuthProblem {
  code: OAuthProblemCode;
  provider?: OAuthProviderId | null;
  hint?: string | null;
}

export function providerLabel(provider?: string | null) {
  return (provider && OAUTH_PROVIDER_LABELS[provider as OAuthProviderId]) || 'nhà cung cấp';
}

/** Says what went wrong and what to do next, in the person's words. */
export function describeOAuthProblem({ code, provider, hint }: OAuthProblem): { title: string; body: string } {
  const p = providerLabel(provider);
  switch (code) {
    case 'cancelled':
      return { title: `Bạn đã huỷ đăng nhập bằng ${p}`, body: 'Chưa có gì thay đổi. Chọn lại khi bạn sẵn sàng.' };
    case 'expired':
      return {
        title: 'Phiên đăng nhập đã hết hạn',
        body: `Lượt chuyển qua ${p} mất quá lâu hoặc được mở ở tab khác. Bấm nút ${p} để thử lại.`,
      };
    case 'not_configured':
      return { title: `${p} chưa được bật`, body: 'Máy chủ chưa có thông tin ứng dụng cho nhà cung cấp này. Dùng email và mật khẩu.' };
    case 'provider_error':
      return { title: `${p} không xác nhận được tài khoản`, body: 'Có thể do mạng hoặc phía nhà cung cấp. Thử lại sau ít phút.' };
    case 'email_missing':
      return {
        title: `Tài khoản ${p} chưa có email đã xác minh`,
        body: `Kaned cần email để tạo tài khoản. Thêm và xác minh email trong ${p}, hoặc đăng ký bằng email.`,
      };
    case 'link_required':
      return {
        title: `Email ${hint ?? 'này'} đã có tài khoản Kaned`,
        body: `${p} không xác nhận email này thuộc về bạn, nên Kaned chưa tự liên kết. Đăng nhập bằng mật khẩu, rồi liên kết ${p} trong Cài đặt tài khoản.`,
      };
    case 'identity_in_use':
      return {
        title: `Tài khoản ${p} này đã gắn với một tài khoản Kaned khác`,
        body: `Đăng nhập bằng ${p} để vào tài khoản đó, hoặc chọn một tài khoản ${p} khác để liên kết.`,
      };
    case 'provider_already_linked':
      return {
        title: `Tài khoản Kaned này đã liên kết một tài khoản ${p} khác`,
        body: `Bỏ liên kết tài khoản ${p} cũ trong Cài đặt tài khoản rồi thử lại.`,
      };
    case 'session_required':
      return { title: 'Cần đăng nhập trước khi liên kết', body: 'Phiên của bạn đã hết hạn. Đăng nhập lại rồi bấm Liên kết.' };
    case 'session_lost':
      return {
        title: 'Trình duyệt không giữ được phiên đăng nhập',
        body: 'Có thể cookie đang bị chặn cho trang này. Cho phép cookie rồi thử lại, hoặc đăng nhập bằng mật khẩu.',
      };
  }
}
