/**
 * Unit Tests for Retry Utilities
 */

import {
  retryWithBackoff,
  retryWithJitter,
  shouldRetryNetworkError,
  batchRetry,
  retryUntil,
} from '../retry';
import { sleep } from '../helpers';

// Mock sleep to speed up tests
jest.mock('../helpers', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

describe('Retry Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const error = new Error('Persistent failure');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        retryWithBackoff(fn, { maxAttempts: 3 })
      ).rejects.toThrow('Persistent failure');

      expect(fn).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('should respect retryIf condition', async () => {
      const retryableError = new Error('Retryable');
      (retryableError as any).code = 'ECONNRESET';

      const nonRetryableError = new Error('Non-retryable');
      (nonRetryableError as any).code = 'VALIDATION_ERROR';

      const fn = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 3,
          retryIf: shouldRetryNetworkError,
        })
      ).rejects.toThrow('Non-retryable');

      // Should not retry for non-retryable errors
      expect(fn).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('should calculate exponential backoff correctly', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 4,
          initialDelay: 1000,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow('Fail');

      expect(sleep).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenNthCalledWith(1, 1000);  // 1000 * 2^0
      expect(sleep).toHaveBeenNthCalledWith(2, 2000);  // 1000 * 2^1
      expect(sleep).toHaveBeenNthCalledWith(3, 4000);  // 1000 * 2^2
    });

    it('should respect max delay', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 5,
          initialDelay: 1000,
          backoffMultiplier: 10,
          maxDelay: 5000,
        })
      ).rejects.toThrow('Fail');

      // All delays should be capped at maxDelay
      const calls = (sleep as jest.Mock).mock.calls;
      calls.forEach((call) => {
        expect(call[0]).toBeLessThanOrEqual(5000);
      });
    });

    it('should call onRetry callback', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await retryWithBackoff(fn, {
        maxAttempts: 2,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });
  });

  describe('retryWithJitter', () => {
    it('should add jitter to delay', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(
        retryWithJitter(fn, {
          maxAttempts: 3,
          initialDelay: 1000,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow('Fail');

      expect(sleep).toHaveBeenCalledTimes(2);

      // Verify jitter is applied (delays should not be exact exponential values)
      const call1Delay = (sleep as jest.Mock).mock.calls[0][0];
      const call2Delay = (sleep as jest.Mock).mock.calls[1][0];

      // With ±25% jitter, delays should be in range
      expect(call1Delay).toBeGreaterThanOrEqual(750);   // 1000 * 0.75
      expect(call1Delay).toBeLessThanOrEqual(1250);     // 1000 * 1.25

      expect(call2Delay).toBeGreaterThanOrEqual(1500);  // 2000 * 0.75
      expect(call2Delay).toBeLessThanOrEqual(2500);     // 2000 * 1.25
    });

    it('should succeed eventually with jitter', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');

      const result = await retryWithJitter(fn, { maxAttempts: 2 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('shouldRetryNetworkError', () => {
    it('should return true for retryable network errors', () => {
      const errors = [
        { code: 'ECONNRESET' },
        { code: 'ECONNREFUSED' },
        { code: 'ETIMEDOUT' },
        { code: 'ENOTFOUND' },
        { code: 'ENETUNREACH' },
      ];

      errors.forEach((error) => {
        expect(shouldRetryNetworkError(error)).toBe(true);
      });
    });

    it('should return true for retryable HTTP status codes', () => {
      const statusCodes = [408, 429, 500, 502, 503, 504];

      statusCodes.forEach((status) => {
        const error = {
          response: { status },
        };
        expect(shouldRetryNetworkError(error)).toBe(true);
      });
    });

    it('should return true for timeout errors', () => {
      const error = {
        name: 'TimeoutError',
      };

      expect(shouldRetryNetworkError(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const errors = [
        { code: 'VALIDATION_ERROR' },
        { response: { status: 400 } },
        { response: { status: 401 } },
        { response: { status: 403 } },
        { response: { status: 404 } },
        {},
        null,
        undefined,
      ];

      errors.forEach((error) => {
        expect(shouldRetryNetworkError(error)).toBe(false);
      });
    });
  });

  describe('batchRetry', () => {
    it('should retry all operations', async () => {
      const op1 = jest.fn().mockResolvedValue('result1');
      const op2 = jest.fn().mockResolvedValue('result2');
      const op3 = jest.fn().mockResolvedValue('result3');

      const results = await batchRetry([op1, op2, op3], { maxAttempts: 2 });

      expect(results).toEqual(['result1', 'result2', 'result3']);
      expect(op1).toHaveBeenCalled();
      expect(op2).toHaveBeenCalled();
      expect(op3).toHaveBeenCalled();
    });

    it('should return errors for failed operations', async () => {
      const error = new Error('Operation failed');
      const op1 = jest.fn().mockResolvedValue('success');
      const op2 = jest.fn().mockRejectedValue(error);
      const op3 = jest.fn().mockResolvedValue('success2');

      const results = await batchRetry([op1, op2, op3], { maxAttempts: 2 });

      expect(results[0]).toBe('success');
      expect(results[1]).toBeInstanceOf(Error);
      expect(results[2]).toBe('success2');
    });

    it('should handle empty array', async () => {
      const results = await batchRetry([], { maxAttempts: 2 });
      expect(results).toEqual([]);
    });
  });

  describe('retryUntil', () => {
    // Use real timers for retryUntil tests
    beforeEach(() => {
      (sleep as jest.Mock).mockImplementation((ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms))
      );
    });

    it('should retry until condition is met', async () => {
      let counter = 0;
      const fn = jest.fn().mockImplementation(async () => {
        counter++;
        return counter;
      });

      const result = await retryUntil(
        fn,
        (value) => value === 3,
        {
          maxAttempts: 5,
          initialDelay: 10,
        }
      );

      expect(result).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw if condition not met within max attempts', async () => {
      const fn = jest.fn().mockResolvedValue(1);

      await expect(
        retryUntil(
          fn,
          (value) => value === 100,
          {
            maxAttempts: 3,
            initialDelay: 10,
          }
        )
      ).rejects.toThrow('Retry condition not met within max attempts');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should succeed on first attempt if condition is met', async () => {
      const fn = jest.fn().mockResolvedValue(42);

      const result = await retryUntil(
        fn,
        (value) => value === 42,
        { maxAttempts: 3 }
      );

      expect(result).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
