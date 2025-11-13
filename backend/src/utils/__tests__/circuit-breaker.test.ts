/**
 * Unit Tests for Circuit Breaker
 */

import { CircuitBreaker, CircuitState, circuitBreakerRegistry } from '../circuit-breaker';
import { sleep } from '../helpers';

// Mock sleep for faster tests
jest.mock('../helpers', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 5000,
      monitoringPeriod: 60000,
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have zero initial stats', () => {
      const stats = circuitBreaker.getStats();

      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.rejections).toBe(0);
    });
  });

  describe('execute - CLOSED state', () => {
    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should record successes', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      await circuitBreaker.execute(fn);
      await circuitBreaker.execute(fn);

      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(0);
    });

    it('should record failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(circuitBreaker.execute(fn)).rejects.toThrow('Fail');

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.successes).toBe(0);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Trigger 3 failures (threshold)
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('execute - OPEN state', () => {
    beforeEach(async () => {
      // Force circuit to OPEN state
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject immediately when OPEN', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(fn)).rejects.toThrow(
        'Circuit breaker is OPEN for test-service'
      );

      // Function should not be called
      expect(fn).not.toHaveBeenCalled();
    });

    it('should use fallback when OPEN', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockResolvedValue('fallback-result');

      const result = await circuitBreaker.execute(fn, fallback);

      expect(result).toBe('fallback-result');
      expect(fn).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    it('should record rejections', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      try {
        await circuitBreaker.execute(fn);
      } catch (error) {
        // Expected
      }

      const stats = circuitBreaker.getStats();
      expect(stats.rejections).toBeGreaterThan(0);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Mock Date.now() to simulate timeout passing
      const originalNow = Date.now;
      const startTime = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => startTime + 6000); // 6 seconds later

      const fn = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(fn);

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(result).toBe('success');

      Date.now = originalNow;
    });
  });

  describe('execute - HALF_OPEN state', () => {
    beforeEach(async () => {
      // Force circuit to HALF_OPEN state
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Trip the circuit (OPEN)
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      // Simulate timeout to move to HALF_OPEN
      const originalNow = Date.now;
      jest.spyOn(Date, 'now').mockImplementation(() => Date.now() + 6000);

      await circuitBreaker.execute(jest.fn().mockResolvedValue('test'));

      Date.now = originalNow;
    });

    it('should transition to CLOSED after success threshold', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      // Execute 2 successful calls (success threshold = 2)
      await circuitBreaker.execute(fn);
      await circuitBreaker.execute(fn);

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition back to OPEN on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      try {
        await circuitBreaker.execute(fn);
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset stats', async () => {
      const fn = jest.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Fail'));

      await circuitBreaker.execute(fn);
      try {
        await circuitBreaker.execute(fn);
      } catch (error) {
        // Expected
      }

      circuitBreaker.reset();

      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(0);
      expect(stats.failures).toBe(0);
      expect(stats.rejections).toBe(0);
    });
  });

  describe('Event Emitter', () => {
    it('should emit state.changed event', async () => {
      const listener = jest.fn();
      circuitBreaker.on('state.changed', listener);

      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(listener).toHaveBeenCalledWith(CircuitState.CLOSED, CircuitState.OPEN);
    });

    it('should emit success event', async () => {
      const listener = jest.fn();
      circuitBreaker.on('success', listener);

      const fn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(fn);

      expect(listener).toHaveBeenCalled();
    });

    it('should emit failure event', async () => {
      const listener = jest.fn();
      circuitBreaker.on('failure', listener);

      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      try {
        await circuitBreaker.execute(fn);
      } catch (error) {
        // Expected
      }

      expect(listener).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should emit reject event when circuit is OPEN', async () => {
      const listener = jest.fn();
      circuitBreaker.on('reject', listener);

      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      // Try to execute while OPEN
      try {
        await circuitBreaker.execute(jest.fn());
      } catch (error) {
        // Expected
      }

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('CircuitBreakerRegistry', () => {
    it('should create and retrieve circuit breakers', () => {
      const cb1 = circuitBreakerRegistry.getOrCreate('service-1');
      const cb2 = circuitBreakerRegistry.getOrCreate('service-1');

      expect(cb1).toBe(cb2); // Same instance
    });

    it('should create different instances for different names', () => {
      const cb1 = circuitBreakerRegistry.getOrCreate('service-1');
      const cb2 = circuitBreakerRegistry.getOrCreate('service-2');

      expect(cb1).not.toBe(cb2);
    });

    it('should get circuit breaker by name', () => {
      circuitBreakerRegistry.getOrCreate('service-1');
      const cb = circuitBreakerRegistry.get('service-1');

      expect(cb).toBeDefined();
      expect(cb?.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return undefined for non-existent circuit breaker', () => {
      const cb = circuitBreakerRegistry.get('non-existent');
      expect(cb).toBeUndefined();
    });

    it('should list all circuit breakers', () => {
      circuitBreakerRegistry.getOrCreate('service-1');
      circuitBreakerRegistry.getOrCreate('service-2');

      const all = circuitBreakerRegistry.getAll();

      expect(all).toContain('service-1');
      expect(all).toContain('service-2');
    });

    it('should reset all circuit breakers', async () => {
      const cb1 = circuitBreakerRegistry.getOrCreate('service-1');
      const cb2 = circuitBreakerRegistry.getOrCreate('service-2');

      // Trip both circuits
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      for (let i = 0; i < 3; i++) {
        try {
          await cb1.execute(fn);
          await cb2.execute(fn);
        } catch (error) {
          // Expected
        }
      }

      expect(cb1.getState()).toBe(CircuitState.OPEN);
      expect(cb2.getState()).toBe(CircuitState.OPEN);

      // Reset all
      circuitBreakerRegistry.resetAll();

      expect(cb1.getState()).toBe(CircuitState.CLOSED);
      expect(cb2.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive calls', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const promises = Array(100).fill(null).map(() => circuitBreaker.execute(fn));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      expect(results.every((r) => r === 'success')).toBe(true);
    });

    it('should handle mixed success and failure', async () => {
      const fn = jest.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');

      const result1 = await circuitBreaker.execute(fn);
      expect(result1).toBe('success');

      try {
        await circuitBreaker.execute(fn);
      } catch (error) {
        // Expected
      }

      const result3 = await circuitBreaker.execute(fn);
      expect(result3).toBe('success');

      // Should still be CLOSED (only 1 failure, threshold is 3)
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should handle function that throws synchronously', async () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });

      await expect(circuitBreaker.execute(fn)).rejects.toThrow('Sync error');

      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
    });
  });
});
