/**
 * Global Error Handler Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError, ErrorCode } from '../types';
import { StatusCodes } from 'http-status-codes';

/**
 * Error response format
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string;
  };
  metadata: {
    timestamp: number;
    request_id?: string;
    path: string;
  };
}

/**
 * Global error handler middleware
 */
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    request_id: (req as any).id,
  });

  // Handle known AppError
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      },
      metadata: {
        timestamp: Date.now(),
        request_id: (req as any).id,
        path: req.path,
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.INVALID_INPUT,
        message: 'Validation failed',
        details: err.message,
      },
      metadata: {
        timestamp: Date.now(),
        request_id: (req as any).id,
        path: req.path,
      },
    };

    res.status(StatusCodes.BAD_REQUEST).json(response);
    return;
  }

  // Handle syntax errors (invalid JSON)
  if (err instanceof SyntaxError && 'body' in err) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid JSON in request body',
      },
      metadata: {
        timestamp: Date.now(),
        request_id: (req as any).id,
        path: req.path,
      },
    };

    res.status(StatusCodes.BAD_REQUEST).json(response);
    return;
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    metadata: {
      timestamp: Date.now(),
      request_id: (req as any).id,
      path: req.path,
    },
  };

  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(response);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    metadata: {
      timestamp: Date.now(),
      request_id: (req as any).id,
      path: req.path,
    },
  };

  res.status(StatusCodes.NOT_FOUND).json(response);
};

/**
 * Request timeout handler
 */
export const timeoutHandler = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout
    const timeout = setTimeout(() => {
      const response: ErrorResponse = {
        success: false,
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Request timeout',
        },
        metadata: {
          timestamp: Date.now(),
          request_id: (req as any).id,
          path: req.path,
        },
      };

      res.status(StatusCodes.REQUEST_TIMEOUT).json(response);
    }, timeoutMs);

    // Clear timeout on response
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

/**
 * Validation error formatter
 */
export const formatValidationError = (errors: any[]): string => {
  return errors
    .map((err) => {
      if (err.path) {
        return `${err.path}: ${err.message}`;
      }
      return err.message;
    })
    .join(', ');
};
