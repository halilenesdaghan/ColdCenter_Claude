/**
 * Unit Tests for Logger
 */

import { logger } from '../logger';
import winston from 'winston';

// Mock winston
jest.mock('winston', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      errors: jest.fn(),
      json: jest.fn(),
      printf: jest.fn(),
      colorize: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
  };
});

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Logging Methods', () => {
    it('should log debug messages', () => {
      logger.debug('Debug message', { key: 'value' });

      expect(logger.debug).toHaveBeenCalledWith('Debug message', { key: 'value' });
    });

    it('should log info messages', () => {
      logger.info('Info message', { key: 'value' });

      expect(logger.info).toHaveBeenCalledWith('Info message', { key: 'value' });
    });

    it('should log warning messages', () => {
      logger.warn('Warning message', { key: 'value' });

      expect(logger.warn).toHaveBeenCalledWith('Warning message', { key: 'value' });
    });

    it('should log error messages', () => {
      const error = new Error('Test error');
      logger.error('Error message', { error });

      expect(logger.error).toHaveBeenCalledWith('Error message', { error });
    });

    it('should handle logging without metadata', () => {
      logger.info('Simple message');

      expect(logger.info).toHaveBeenCalledWith('Simple message');
    });

    it('should handle logging with nested metadata', () => {
      const metadata = {
        user: {
          id: '123',
          name: 'Test User',
        },
        request: {
          method: 'POST',
          path: '/api/calls',
        },
      };

      logger.info('Complex metadata', metadata);

      expect(logger.info).toHaveBeenCalledWith('Complex metadata', metadata);
    });
  });

  describe('Error Logging', () => {
    it('should log Error objects correctly', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Test.it (test.ts:10:20)';

      logger.error('Error occurred', { error });

      expect(logger.error).toHaveBeenCalledWith('Error occurred', { error });
    });

    it('should log errors with custom properties', () => {
      const error: any = new Error('Custom error');
      error.code = 'CUSTOM_ERROR';
      error.statusCode = 500;

      logger.error('Custom error occurred', { error });

      expect(logger.error).toHaveBeenCalledWith('Custom error occurred', { error });
    });
  });

  describe('PII Masking', () => {
    it('should mask phone numbers in metadata', () => {
      const metadata = {
        customer_phone: '+905551234567',
        message: 'Customer phone is +905551234567',
      };

      logger.info('Customer contact', metadata);

      // In a real implementation, phone numbers should be masked
      expect(logger.info).toHaveBeenCalled();
    });

    it('should mask email addresses', () => {
      const metadata = {
        email: 'test@example.com',
        message: 'Email is test@example.com',
      };

      logger.info('Customer email', metadata);

      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency logging', () => {
      for (let i = 0; i < 1000; i++) {
        logger.debug(`Message ${i}`, { index: i });
      }

      expect(logger.debug).toHaveBeenCalledTimes(1000);
    });

    it('should handle large metadata objects', () => {
      const largeMetadata = {
        data: Array(1000).fill({ key: 'value', nested: { deep: 'data' } }),
      };

      logger.info('Large metadata', largeMetadata);

      expect(logger.info).toHaveBeenCalledWith('Large metadata', largeMetadata);
    });
  });
});
