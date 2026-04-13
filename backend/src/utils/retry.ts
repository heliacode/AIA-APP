export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return true if error is retryable. Default: retry on network / 429 / 5xx. */
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function defaultShouldRetry(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; statusCode?: number; code?: string; message?: string };
  const status = anyErr.status ?? anyErr.statusCode;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  const msg = anyErr.message ?? '';
  if (/HTTP (429|5\d\d)/i.test(msg)) return true;
  if (anyErr.code === 'ECONNRESET' || anyErr.code === 'ETIMEDOUT' || anyErr.code === 'EAI_AGAIN') return true;
  if (/fetch failed|network|socket hang up|timeout/i.test(msg)) return true;
  return false;
}

/**
 * Retry an async operation with exponential backoff + jitter. Defaults: 2 retries (3 attempts total).
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 4000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) throw err;
      opts.onRetry?.(err, attempt + 1);
      const exp = Math.min(max, base * 2 ** attempt);
      const jitter = Math.random() * exp * 0.3;
      await sleep(exp + jitter);
      attempt++;
    }
  }
  throw lastErr;
}
