import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, AuthResponse } from '@kaned/shared';

const BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

/**
 * The access token lives in memory only. The refresh token is an httpOnly
 * cookie the browser sends on its own, so a page reload restores the session
 * without ever exposing a long-lived token to JavaScript.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function onUnauthenticated(handler: () => void) {
  onSessionLost = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api`,
  withCredentials: true,
  timeout: 20_000,
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/** A single refresh is shared by every request that got a 401 at the same time. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  refreshing ??= axios
    .post<AuthResponse>(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
    .then((res) => {
      accessToken = res.data.accessToken;
      return accessToken;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;
    const path = original?.url ?? '';

    const isAuthCall = path.includes('/auth/refresh') || path.includes('/auth/login');

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      }
      onSessionLost?.();
    }

    return Promise.reject(toApiError(error));
  },
);

export interface NormalisedApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
}

/** Everything that fails ends up as the same shape, so UI can trust it. */
export function toApiError(error: unknown): NormalisedApiError {
  const err = new Error() as NormalisedApiError;

  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    err.status = error.response?.status ?? 0;
    err.code = body?.error?.code ?? (error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK');
    err.fields = body?.error?.fields;
    err.message =
      body?.error?.message ??
      (err.status === 0
        ? 'Không kết nối được tới máy chủ. Kiểm tra xem API đã chạy chưa.'
        : 'Đã có lỗi xảy ra. Vui lòng thử lại.');
    return err;
  }

  err.status = 0;
  err.code = 'UNKNOWN';
  err.message = error instanceof Error ? error.message : 'Đã có lỗi xảy ra.';
  return err;
}

let bootstrapPromise: Promise<AuthResponse | null> | null = null;

/**
 * Exchanges the refresh cookie for a session on page load. Refresh tokens
 * rotate, so two parallel calls would invalidate each other — React's
 * StrictMode double-mount alone is enough to cause that. Every caller
 * therefore shares one in-flight request.
 */
export function bootstrapSession(): Promise<AuthResponse | null> {
  bootstrapPromise ??= axios
    .post<AuthResponse>(`${BASE_URL}/api/auth/refresh`, {}, { withCredentials: true })
    .then((res) => {
      accessToken = res.data.accessToken;
      return res.data;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      // Let a later sign-out / sign-in cycle bootstrap again.
      bootstrapPromise = null;
    });
  return bootstrapPromise;
}
