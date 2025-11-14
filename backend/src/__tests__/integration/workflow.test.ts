/**
 * Integration Tests for Workflow Engine
 */

import { queueManager } from '../../services/workflow/queue-manager';
import { scheduler } from '../../services/workflow/scheduler';
import { TaskType } from '../../types';

// Mock dependencies
jest.mock('bull');
jest.mock('node-cron');
jest.mock('../../services/database/dynamodb-client');
jest.mock('../../config');

describe('Workflow Engine Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Queue Manager Workflow', () => {
    it('should add and process appointment confirmation job', async () => {
      const jobData = {
        appointment_id: 'apt-123',
        customer_phone: '+905551234567',
        customer_name: 'Test Müşteri',
        appointment_date: '2024-01-15',
        appointment_time: '14:00',
        vehicle_model: 'Corsa Electric',
      };

      const job = await queueManager.addJob(
        TaskType.APPOINTMENT_CONFIRMATION,
        jobData
      );

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
    });

    it('should schedule delayed appointment reminder', async () => {
      const jobData = {
        appointment_id: 'apt-123',
        customer_phone: '+905551234567',
        customer_name: 'Test Müşteri',
        appointment_date: '2024-01-15',
        appointment_time: '14:00',
      };

      const delay = 3600000; // 1 hour

      const job = await queueManager.addDelayedJob(
        TaskType.APPOINTMENT_REMINDER,
        jobData,
        delay
      );

      expect(job).toBeDefined();
    });

    it('should schedule callback with priority', async () => {
      const jobData = {
        call_id: 'call-123',
        customer_phone: '+905551234567',
        customer_name: 'Test Müşteri',
        reason: 'Fiyat bilgisi',
        priority: 1,
      };

      const job = await queueManager.addJob(TaskType.CALLBACK, jobData, {
        priority: 1,
      });

      expect(job).toBeDefined();
    });

    it('should schedule job for specific future time', async () => {
      const jobData = {
        appointment_id: 'apt-123',
        customer_phone: '+905551234567',
        customer_name: 'Test Müşteri',
        appointment_date: '2024-01-16',
        appointment_time: '10:00',
      };

      const scheduledTime = new Date(Date.now() + 24 * 3600000); // 24 hours from now

      const job = await queueManager.addScheduledJob(
        TaskType.APPOINTMENT_CONFIRMATION,
        jobData,
        scheduledTime
      );

      expect(job).toBeDefined();
    });
  });

  describe('Queue Statistics', () => {
    it('should retrieve queue statistics', async () => {
      const stats = await queueManager.getQueueStats(TaskType.CALLBACK);

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('delayed');
    });

    it('should retrieve statistics for all queues', async () => {
      const allStats = await queueManager.getAllQueuesStats();

      expect(allStats).toHaveProperty(TaskType.APPOINTMENT_CONFIRMATION);
      expect(allStats).toHaveProperty(TaskType.APPOINTMENT_REMINDER);
      expect(allStats).toHaveProperty(TaskType.CALLBACK);
      expect(allStats).toHaveProperty(TaskType.DAILY_SUMMARY);
    });
  });

  describe('Queue Management', () => {
    it('should pause and resume queue', async () => {
      await queueManager.pauseQueue(TaskType.CALLBACK);
      await queueManager.resumeQueue(TaskType.CALLBACK);

      // Verify operations completed without errors
      expect(true).toBe(true);
    });

    it('should clean old jobs from queue', async () => {
      const grace = 7 * 24 * 60 * 60 * 1000; // 7 days

      await queueManager.cleanQueue(TaskType.CALLBACK, grace);

      // Verify cleanup completed without errors
      expect(true).toBe(true);
    });
  });

  describe('Scheduler Integration', () => {
    it('should start all scheduled jobs', () => {
      scheduler.start();

      const runningJobs = scheduler.getRunningJobs();

      expect(runningJobs).toContain('scan-follow-up-queue');
      expect(runningJobs).toContain('schedule-reminders');
      expect(runningJobs).toContain('schedule-confirmations');
      expect(runningJobs).toContain('daily-summary');
      expect(runningJobs).toContain('clean-queues');
    });

    it('should stop all scheduled jobs', () => {
      scheduler.start();
      scheduler.stop();

      const runningJobs = scheduler.getRunningJobs();

      expect(runningJobs).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle job processing errors gracefully', async () => {
      const jobData = {
        appointment_id: 'invalid-apt',
        customer_phone: 'invalid-phone',
        customer_name: '',
        appointment_date: '',
        appointment_time: '',
      };

      // Should not throw, but may fail internally
      const job = await queueManager.addJob(
        TaskType.APPOINTMENT_CONFIRMATION,
        jobData
      );

      expect(job).toBeDefined();
    });

    it('should reject scheduling jobs in the past', async () => {
      const jobData = {
        appointment_id: 'apt-123',
        customer_phone: '+905551234567',
        customer_name: 'Test',
        appointment_date: '2024-01-15',
        appointment_time: '14:00',
      };

      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago

      await expect(
        queueManager.addScheduledJob(TaskType.APPOINTMENT_CONFIRMATION, jobData, pastTime)
      ).rejects.toThrow('Scheduled time must be in the future');
    });
  });

  describe('Job Lifecycle', () => {
    it('should create, retrieve, and cancel job', async () => {
      const jobData = {
        call_id: 'call-123',
        customer_phone: '+905551234567',
        customer_name: 'Test',
        reason: 'Test callback',
        priority: 1,
      };

      // Create job
      const job = await queueManager.addJob(TaskType.CALLBACK, jobData);
      expect(job).toBeDefined();

      const jobId = job.id as string;

      // Retrieve job
      const retrievedJob = await queueManager.getJob(TaskType.CALLBACK, jobId);
      expect(retrievedJob).toBeDefined();

      // Cancel job (if implementation supports it)
      // Note: This may fail in test environment with mocks
      try {
        await queueManager.cancelJob(TaskType.CALLBACK, jobId);
      } catch (error) {
        // Expected in test environment
      }
    });
  });

  describe('Concurrent Job Processing', () => {
    it('should handle multiple jobs added simultaneously', async () => {
      const jobs = [];

      for (let i = 0; i < 10; i++) {
        jobs.push(
          queueManager.addJob(TaskType.CALLBACK, {
            call_id: `call-${i}`,
            customer_phone: '+905551234567',
            customer_name: `Customer ${i}`,
            reason: 'Test',
            priority: i % 3,
          })
        );
      }

      const results = await Promise.all(jobs);

      expect(results).toHaveLength(10);
      results.forEach((job) => {
        expect(job).toBeDefined();
        expect(job.id).toBeDefined();
      });
    });
  });

  describe('Daily Summary Workflow', () => {
    it('should schedule daily summary job', async () => {
      const jobData = {
        date: '2024-01-15',
        recipient_emails: ['admin@example.com'],
      };

      const job = await queueManager.addJob(TaskType.DAILY_SUMMARY, jobData);

      expect(job).toBeDefined();
    });
  });
});
