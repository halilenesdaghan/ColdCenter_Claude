/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by stopping requests to failing services
 */

import { logger } from './logger';
import { EventEmitter } from 'events';

export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, reject all requests
  HALF_OPEN = 'half_open', // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time to wait before trying half-open (ms)
  monitoringPeriod: number;      // Time window for failure count (ms)
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  rejections: number;
  totalRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

/**
 * Circuit Breaker class
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private rejectionCount: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttempt?: number;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      monitoringPeriod: 120000, // 2 minutes
    },
  ) {
    super();
    this.startMonitoring();
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (this.nextAttempt && Date.now() < this.nextAttempt) {
        logger.warn('Circuit breaker is OPEN', {
          name: this.name,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        });

        this.rejectionCount++;
        this.emit('reject');

        if (fallback) {
          logger.info('Using fallback function', { name: this.name });
          return await fallback();
        }

        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      } else {
        // Try half-open
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.emit('half_open', this.name);
        logger.info('Circuit breaker transitioning to HALF_OPEN', { name: this.name });
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);

      if (fallback) {
        logger.info('Execution failed, using fallback', { name: this.name, error });
        return await fallback();
      }

      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        this.close();
      }
    } else {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }

    this.emit('success', this.name);
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn('Circuit breaker recorded failure', {
      name: this.name,
      failureCount: this.failureCount,
      threshold: this.options.failureThreshold,
      error: error.message,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed in half-open state, reopen circuit
      this.open();
    } else if (this.failureCount >= this.options.failureThreshold) {
      // Threshold exceeded, open circuit
      this.open();
    }

    this.emit('failure', this.name, error);
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.options.timeout;

    logger.error('Circuit breaker OPENED', {
      name: this.name,
      failureCount: this.failureCount,
      nextAttempt: new Date(this.nextAttempt).toISOString(),
    });

    this.emit('open', this.name);
  }

  /**
   * Close the circuit
   */
  private close(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;

    logger.info('Circuit breaker CLOSED', { name: this.name });

    this.emit('close', this.name);
  }

  /**
   * Get current stats
   */
  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      rejections: this.rejectionCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.rejectionCount = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttempt = undefined;

    logger.info('Circuit breaker reset', { name: this.name });
    this.emit('reset', this.name);
  }

  /**
   * Start monitoring for auto-reset
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      // Reset failure count if monitoring period has passed without failures
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.options.monitoringPeriod) {
        if (this.state === CircuitState.CLOSED) {
          this.failureCount = 0;
          logger.debug('Circuit breaker failure count reset', { name: this.name });
        }
      }
    }, this.options.monitoringPeriod);
  }

  /**
   * Stop monitoring
   */
  destroy(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    this.removeAllListeners();
  }
}

/**
 * Circuit Breaker Registry
 * Manages multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create circuit breaker
   */
  getOrCreate(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all breaker names
   */
  getAll(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * Get all breakers stats
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};

    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Destroy all circuit breakers
   */
  destroyAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.destroy();
    }
    this.breakers.clear();
  }
}

// Export singleton registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
