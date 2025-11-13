/**
 * ColdCenter V1.0 - Main Entry Point
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { config, validateConfig, isDevelopment } from './config';
import { logger } from './utils/logger';
import { CallManager } from './core/call-manager';
import { opelAPIAdapter } from './adapters/opel-api-adapter';
import { CallDirection, CallStatus, ApiResponse, AppError, ErrorCode } from './types';

// Validate configuration
try {
  validateConfig();
  logger.info('Configuration validated successfully');
} catch (error: any) {
  logger.error('Configuration validation failed:', error.message);
  process.exit(1);
}

// Create Express app
const app = express();
const httpServer = createServer(app);

// Create Socket.IO server for real-time communication
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: isDevelopment() ? '*' : config.opel_api.url,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS
app.use(compression()); // Response compression
app.use(express.json()); // JSON body parser
app.use(express.urlencoded({ extended: true })); // URL-encoded body parser

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rate_limiting.window_ms,
  max: config.rate_limiting.max_requests,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// ============================================
// API Routes
// ============================================

/**
 * Health check
 */
app.get('/health', async (req: Request, res: Response) => {
  const opelApiHealth = await opelAPIAdapter.healthCheck();

  res.json({
    status: 'ok',
    service: 'coldcenter-backend',
    version: '1.0.0',
    timestamp: Date.now(),
    dependencies: {
      opel_api: opelApiHealth ? 'ok' : 'down',
    },
  });
});

/**
 * Start new call
 * POST /api/calls/start
 */
app.post('/api/calls/start', async (req: Request, res: Response) => {
  try {
    const { customer_phone, direction = 'inbound' } = req.body;

    if (!customer_phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELD',
          message: 'customer_phone is required',
        },
      });
    }

    const callManager = new CallManager(customer_phone, direction as CallDirection);
    await callManager.start();

    const session = callManager.getSession();

    res.status(201).json({
      success: true,
      data: {
        call_id: session.call_id,
        status: session.status,
        state: session.state,
        created_at: session.created_at,
      },
    });
  } catch (error: any) {
    logger.error('Failed to start call', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * Get call details
 * GET /api/calls/:call_id
 */
app.get('/api/calls/:call_id', async (req: Request, res: Response) => {
  try {
    const { call_id } = req.params;

    // Fetch from database
    const { dynamoDBService, Tables } = await import('./services/database/dynamodb-client');
    const session = await dynamoDBService.get(Tables.CALL_SESSIONS, { call_id });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CALL_NOT_FOUND',
          message: 'Call session not found',
        },
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    logger.error('Failed to get call', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * Get vehicle pricing
 * GET /api/vehicles/:model/pricing
 */
app.get('/api/vehicles/:model/pricing', async (req: Request, res: Response) => {
  try {
    const { model } = req.params;
    const { trim } = req.query;

    const pricing = await opelAPIAdapter.getVehiclePricing(model, trim as string);

    res.json({
      success: true,
      data: pricing,
    });
  } catch (error: any) {
    logger.error('Failed to get vehicle pricing', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * Check stock availability
 * GET /api/inventory/availability
 */
app.get('/api/inventory/availability', async (req: Request, res: Response) => {
  try {
    const { model, color, dealer } = req.query;

    if (!model || !color) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELD',
          message: 'model and color are required',
        },
      });
    }

    const availability = await opelAPIAdapter.checkStockAvailability(
      model as string,
      color as string,
      dealer as string,
    );

    res.json({
      success: true,
      data: availability,
    });
  } catch (error: any) {
    logger.error('Failed to check stock', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * Get daily analytics
 * GET /api/analytics/daily/:date
 */
app.get('/api/analytics/daily/:date', async (req: Request, res: Response) => {
  try {
    const { date } = req.params;

    const { dynamoDBService, Tables } = await import('./services/database/dynamodb-client');
    const metrics = await dynamoDBService.query(
      Tables.ANALYTICS_DAILY,
      'date = :date',
      { ':date': date },
    );

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    logger.error('Failed to get analytics', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      },
    });
  }
});

// ============================================
// WebSocket / Socket.IO for real-time communication
// ============================================

// Store active call managers
const activeCallManagers = new Map<string, CallManager>();

io.on('connection', (socket) => {
  logger.info('Client connected', { socket_id: socket.id });

  /**
   * Start a new call
   */
  socket.on('call:start', async (data: { customer_phone: string; direction?: string }) => {
    try {
      const callManager = new CallManager(
        data.customer_phone,
        (data.direction as CallDirection) || CallDirection.INBOUND,
      );

      // Listen to call events
      callManager.on('state.changed', (oldState, newState) => {
        socket.emit('call:state_changed', { oldState, newState });
      });

      callManager.on('intent.detected', (intent) => {
        socket.emit('call:intent_detected', intent);
      });

      callManager.on('escalation.triggered', (reason) => {
        socket.emit('call:escalation', { reason });
      });

      callManager.on('call.ended', (session) => {
        socket.emit('call:ended', session);
        activeCallManagers.delete(session.call_id);
      });

      await callManager.start();
      const session = callManager.getSession();

      activeCallManagers.set(session.call_id, callManager);

      socket.emit('call:started', { call_id: session.call_id, status: session.status });
    } catch (error: any) {
      logger.error('Failed to start call via socket', error);
      socket.emit('call:error', { message: error.message });
    }
  });

  /**
   * Process user input (STT result)
   */
  socket.on('call:user_input', async (data: { call_id: string; text: string; audio?: any }) => {
    try {
      const callManager = activeCallManagers.get(data.call_id);

      if (!callManager) {
        socket.emit('call:error', { message: 'Call session not found' });
        return;
      }

      await callManager.processUserInput(data.text, data.audio);

      socket.emit('call:input_processed', { success: true });
    } catch (error: any) {
      logger.error('Failed to process user input', error);
      socket.emit('call:error', { message: error.message });
    }
  });

  /**
   * End call
   */
  socket.on('call:end', async (data: { call_id: string; reason?: string }) => {
    try {
      const callManager = activeCallManagers.get(data.call_id);

      if (!callManager) {
        socket.emit('call:error', { message: 'Call session not found' });
        return;
      }

      await callManager.end(data.reason);
    } catch (error: any) {
      logger.error('Failed to end call', error);
      socket.emit('call:error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socket_id: socket.id });
  });
});

// ============================================
// Error handling
// ============================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', err);

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.message || 'An unexpected error occurred',
    },
  });
});

// ============================================
// Start server
// ============================================

const PORT = config.port;

httpServer.listen(PORT, () => {
  logger.info(`🚀 ColdCenter backend started on port ${PORT}`);
  logger.info(`📊 Environment: ${config.env}`);
  logger.info(`🔧 Mock Opel API: ${config.opel_api.use_mock ? 'Enabled' : 'Disabled'}`);
  logger.info(`📞 WebSocket server ready for real-time communication`);

  if (isDevelopment()) {
    logger.info(`🧪 Development mode - API available at http://localhost:${PORT}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

export default app;
