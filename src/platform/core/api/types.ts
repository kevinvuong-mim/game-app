type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestConfig {
  auth?: boolean;
  body?: unknown;
  retries?: number;
  timeout?: number;
  method?: HttpMethod;
  retryDelay?: number;
  _retried401?: boolean;
  retryOnStatuses?: number[];
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export type AuthRecoveryHandler = () => Promise<boolean>;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
    public readonly headers?: Headers
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface IApiClient {
  setAuthToken(token: string | null): void;
  get<T>(path: string, config?: RequestConfig): Promise<T>;
  delete<T>(path: string, config?: RequestConfig): Promise<T>;
  post<T>(path: string, body?: unknown, config?: RequestConfig): Promise<T>;
  patch<T>(path: string, body?: unknown, config?: RequestConfig): Promise<T>;
}
