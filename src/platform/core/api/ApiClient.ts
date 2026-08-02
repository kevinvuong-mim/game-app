import { ApiError as ApiErrorClass } from './types';
import type { IApiClient, ApiResponse, RequestConfig, AuthRecoveryHandler } from './types';

const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRY_DELAY = 1_000;
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

class ApiClient implements IApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private authRecoveryHandler: AuthRecoveryHandler | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? '';
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  setAuthRecoveryHandler(handler: AuthRecoveryHandler | null): void {
    this.authRecoveryHandler = handler;
  }

  async get<T>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'POST', body });
  }

  async patch<T>(path: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'PATCH', body });
  }

  async delete<T>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(path, { ...config, method: 'DELETE' });
  }

  private async request<T>(path: string, config: RequestConfig): Promise<T> {
    const finalConfig = { ...config };
    const retries = finalConfig.retries ?? DEFAULT_RETRIES;
    let lastError: Error | null = null;
    let attemptConfig = finalConfig;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.executeRequest<T>(path, attemptConfig);
        return response.data;
      } catch (error) {
        lastError = error as Error;

        if (
          error instanceof ApiErrorClass &&
          error.status === 401 &&
          attemptConfig.auth !== false &&
          !attemptConfig._retried401 &&
          this.authRecoveryHandler
        ) {
          attemptConfig = { ...attemptConfig, _retried401: true };
          const recovered = await this.authRecoveryHandler();
          if (recovered) {
            // Identity changed — do not replay the original body.
            // Callers (game-sync, devices) re-issue with the new guest.
            throw error;
          }
        }

        if (error instanceof ApiErrorClass && !this.shouldRetry(error, attemptConfig)) break;
        if (attempt < retries) {
          await this.delay(this.getRetryDelay(error, attemptConfig, attempt));
        }
      }
    }

    throw lastError;
  }

  private async executeRequest<T>(path: string, config: RequestConfig): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (config.auth !== false && this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const controller = new AbortController();
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: config.method ?? 'GET',
        headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      });

      let data: T;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as T;
      }

      if (!response.ok) {
        throw new ApiErrorClass(
          `Request failed: ${response.status} ${response.statusText}`,
          response.status,
          data,
          response.headers
        );
      }

      return { data, status: response.status, headers: response.headers };
    } catch (error) {
      if (error instanceof ApiErrorClass) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new ApiErrorClass('Request timeout', 408);
      }
      throw new ApiErrorClass((error as Error).message, 0);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(error: ApiErrorClass, config: RequestConfig): boolean {
    const retryableStatuses = config.retryOnStatuses ?? DEFAULT_RETRYABLE_STATUSES;
    return retryableStatuses.includes(error.status);
  }

  private getRetryDelay(error: unknown, config: RequestConfig, attempt: number): number {
    if (error instanceof ApiErrorClass && error.status === 429) {
      const retryAfter = this.parseRetryAfter(error.headers?.get('Retry-After'));
      if (retryAfter !== null) {
        return retryAfter;
      }
    }

    return config.retryDelay ?? DEFAULT_RETRY_DELAY * (attempt + 1);
  }

  private parseRetryAfter(value: string | null | undefined): number | null {
    if (!value) return null;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const date = Date.parse(value);
    if (Number.isNaN(date)) {
      return null;
    }

    return Math.max(0, date - Date.now());
  }
}

export const apiClient = new ApiClient();
