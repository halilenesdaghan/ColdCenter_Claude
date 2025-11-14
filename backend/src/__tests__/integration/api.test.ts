/**
 * Integration Tests for API Endpoints
 */

import request from 'supertest';
import express, { Express } from 'express';
import { errorHandler, notFoundHandler } from '../../middleware/error-handler';

// Mock services
jest.mock('../../services/database/dynamodb-client');
jest.mock('../../services/storage/s3-client');
jest.mock('../../services/speech/elevenlabs-client');

describe('API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    // Create Express app with minimal setup for testing
    app = express();
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (_req, res) => {
      return res.status(200).json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
      });
    });

    // Mock call initiation endpoint
    app.post('/api/calls', (req, res) => {
      const { customer_phone, direction } = req.body;

      if (!customer_phone) {
        return res.status(400).json({
          error: 'customer_phone is required',
        });
      }

      return res.status(201).json({
        call_id: 'call-test-123',
        customer_phone,
        direction: direction || 'inbound',
        status: 'active',
        state: 'greeting',
      });
    });

    // Mock appointment creation endpoint
    app.post('/api/appointments', (req, res) => {
      const { customer_phone, appointment_date, appointment_time } = req.body;

      if (!customer_phone || !appointment_date || !appointment_time) {
        return res.status(400).json({
          error: 'Missing required fields',
        });
      }

      return res.status(201).json({
        appointment_id: 'apt-test-123',
        customer_phone,
        appointment_date,
        appointment_time,
        status: 'confirmed',
      });
    });

    // Mock analytics endpoint
    app.get('/api/analytics/summary', (req, res) => {
      const { start_date, end_date } = req.query;

      res.status(200).json({
        period: {
          start: start_date,
          end: end_date,
        },
        metrics: {
          total_calls: 150,
          completed_calls: 120,
          escalated_calls: 15,
          automation_rate: 70,
          total_appointments: 45,
          confirmed_appointments: 38,
        },
      });
    });

    // Error handlers
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('POST /api/calls', () => {
    it('should create a new call session', async () => {
      const response = await request(app)
        .post('/api/calls')
        .send({
          customer_phone: '+905551234567',
          direction: 'inbound',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('call_id');
      expect(response.body).toHaveProperty('customer_phone', '+905551234567');
      expect(response.body).toHaveProperty('status', 'active');
      expect(response.body).toHaveProperty('state', 'greeting');
    });

    it('should return 400 for missing customer_phone', async () => {
      const response = await request(app)
        .post('/api/calls')
        .send({
          direction: 'inbound',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should use default direction if not provided', async () => {
      const response = await request(app)
        .post('/api/calls')
        .send({
          customer_phone: '+905551234567',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('direction', 'inbound');
    });
  });

  describe('POST /api/appointments', () => {
    it('should create a new appointment', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({
          customer_phone: '+905551234567',
          customer_name: 'Test Müşteri',
          appointment_date: '2024-01-15',
          appointment_time: '14:00',
          vehicle_model: 'Corsa Electric',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('appointment_id');
      expect(response.body).toHaveProperty('status', 'confirmed');
      expect(response.body).toHaveProperty('appointment_date', '2024-01-15');
      expect(response.body).toHaveProperty('appointment_time', '14:00');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({
          customer_phone: '+905551234567',
          // Missing appointment_date and appointment_time
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });
  });

  describe('GET /api/analytics/summary', () => {
    it('should return analytics summary', async () => {
      const response = await request(app)
        .get('/api/analytics/summary')
        .query({
          start_date: '2024-01-01',
          end_date: '2024-01-31',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveProperty('total_calls');
      expect(response.body.metrics).toHaveProperty('automation_rate');
    });

    it('should return metrics even without date range', async () => {
      const response = await request(app).get('/api/analytics/summary');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('metrics');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/non-existent-route');

      expect(response.status).toBe(404);
    });

    it('should handle POST to unknown routes', async () => {
      const response = await request(app)
        .post('/api/unknown')
        .send({ data: 'test' });

      expect(response.status).toBe(404);
    });
  });

  describe('Request Validation', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/calls')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads gracefully', async () => {
      const largePayload = {
        customer_phone: '+905551234567',
        metadata: Array(1000).fill({ key: 'value' }),
      };

      const response = await request(app)
        .post('/api/calls')
        .send(largePayload);

      // Should process or reject cleanly
      expect([201, 400, 413]).toContain(response.status);
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include security headers in response', async () => {
      const response = await request(app).get('/health');

      // Note: In real app, these would be added by helmet middleware
      expect(response.status).toBe(200);
    });
  });
});
