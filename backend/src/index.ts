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
import { CallDirection } from './types';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/error-handler';
import { queueManager } from './services/workflow/queue-manager';
import { scheduler } from './services/workflow/scheduler';
import { registerProcessors } from './services/workflow/job-processors';
import { circuitBreakerRegistry } from './utils/circuit-breaker';
import { elevenLabsClient } from './services/speech/elevenlabs-client';

// Validate configuration
try {
  validateConfig();
  logger.info('Configuration validated successfully');
} catch (error: any) {
  logger.error('Configuration validation failed:', error.message);
  process.exit(1);
}

// Initialize workflow engine
try {
  // Register job processors
  registerProcessors();
  logger.info('Job processors registered');

  // Start scheduler
  scheduler.start();
  logger.info('Scheduler started');
} catch (error: any) {
  logger.error('Failed to initialize workflow engine:', error.message);
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
app.use((req: Request, _res: Response, next: NextFunction) => {
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
app.get('/health', asyncHandler(async (_req: Request, res: Response) => {
  const [opelApiHealth, elevenLabsHealth] = await Promise.all([
    opelAPIAdapter.healthCheck(),
    elevenLabsClient.healthCheck(),
  ]);

  // Get queue stats
  const queueStats = await queueManager.getAllQueuesStats();

  // Get circuit breaker states
  const circuitBreakers = circuitBreakerRegistry.getAll();
  const cbStates: Record<string, any> = {};
  circuitBreakers.forEach((name) => {
    const cb = circuitBreakerRegistry.get(name);
    if (cb) {
      cbStates[name] = {
        state: cb.getState(),
        stats: cb.getStats(),
      };
    }
  });

  return res.json({
    status: 'ok',
    service: 'coldcenter-backend',
    version: '1.0.0',
    timestamp: Date.now(),
    uptime: process.uptime(),
    dependencies: {
      opel_api: opelApiHealth ? 'ok' : 'down',
      elevenlabs: elevenLabsHealth ? 'ok' : 'down',
    },
    queues: queueStats,
    circuit_breakers: cbStates,
    scheduler: {
      running_jobs: scheduler.getRunningJobs(),
    },
  });
}));

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

    return res.status(201).json({
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
    return res.status(500).json({
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

    return res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    logger.error('Failed to get call', error);
    return res.status(500).json({
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

    return res.json({
      success: true,
      data: pricing,
    });
  } catch (error: any) {
    logger.error('Failed to get vehicle pricing', error);
    return res.status(error.statusCode || 500).json({
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

    return res.json({
      success: true,
      data: availability,
    });
  } catch (error: any) {
    logger.error('Failed to check stock', error);
    return res.status(error.statusCode || 500).json({
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
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

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
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);

  try {
    // Stop accepting new connections
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    // Stop scheduler
    scheduler.stop();
    logger.info('Scheduler stopped');

    // Close all queues
    await queueManager.closeAll();
    logger.info('All queues closed');

    // Reset circuit breakers
    circuitBreakerRegistry.resetAll();
    logger.info('Circuit breakers reset');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during graceful shutdown', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
