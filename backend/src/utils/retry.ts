/**
 * Retry Utilities with Exponential Backoff
 */

import { logger } from './logger';
import { sleep } from './helpers';

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryIf?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...defaultRetryOptions, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if we should retry this error
      if (opts.retryIf && !opts.retryIf(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === opts.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelay,
      );

      logger.warn('Retrying after error', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delay,
        error: error.message,
      });

      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(error, attempt);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Retry only on specific error types
 */
export function shouldRetryNetworkError(error: any): boolean {
  if (!error) return false;

  const retryableCodes = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
  ];

  const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

  // Check error code
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }

  // Check HTTP status code
  if (error.response?.status && retryableStatusCodes.includes(error.response.status)) {
    return true;
  }

  // Check for timeout
  if (error.name === 'TimeoutError') {
    return true;
  }

  return false;
}

/**
 * Retry decorator for class methods
 */
export function Retry(options: Partial<RetryOptions> = {}) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return retryWithBackoff(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Retry with jitter (randomized delay)
 * Prevents thundering herd problem
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...defaultRetryOptions, ...options };
  let lastError: any;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (opts.retryIf && !opts.retryIf(error)) {
        throw error;
      }

      if (attempt === opts.maxAttempts) {
        break;
      }

      // Calculate base delay
      const baseDelay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1);

      // Add jitter (random variation ±25%)
      const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.min(baseDelay + jitter, opts.maxDelay);

      logger.warn('Retrying with jitter after error', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delay: Math.round(delay),
        error: error.message,
      });

      if (opts.onRetry) {
        opts.onRetry(error, attempt);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Batch retry - retry multiple operations
 */
export async function batchRetry<T>(
  operations: Array<() => Promise<T>>,
  options: Partial<RetryOptions> = {},
): Promise<Array<T | Error>> {
  const results = await Promise.allSettled(
    operations.map((op) => retryWithBackoff(op, options)),
  );

  return results.map((result) =>
    result.status === 'fulfilled' ? result.value : result.reason,
  );
}

/**
 * Retry until condition is met
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...defaultRetryOptions, ...options };

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const result = await fn();

    if (condition(result)) {
      return result;
    }

    if (attempt === opts.maxAttempts) {
      throw new Error('Retry condition not met within max attempts');
    }

    const delay = Math.min(
      opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1),
      opts.maxDelay,
    );

    logger.debug('Condition not met, retrying', { attempt, delay });

    await sleep(delay);
  }

  throw new Error('Retry failed');
}
