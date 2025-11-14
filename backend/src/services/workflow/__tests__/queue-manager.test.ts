/**
 * Unit Tests for Queue Manager
 */

import { QueueManager } from '../queue-manager';
import { TaskType } from '../../../types';
import Bull from 'bull';

// Mock Bull
jest.mock('bull');

// Mock config
jest.mock('../../../config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
    },
  },
}));

describe('QueueManager', () => {
  let queueManager: QueueManager;
  let mockQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock queue
    mockQueue = {
      process: jest.fn(),
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      clean: jest.fn().mockResolvedValue(undefined),
      obliterate: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
      getWaitingCount: jest.fn().mockResolvedValue(5),
      getActiveCount: jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(100),
      getFailedCount: jest.fn().mockResolvedValue(10),
      getDelayedCount: jest.fn().mockResolvedValue(3),
    };

    (Bull as jest.MockedFunction<typeof Bull>).mockReturnValue(mockQueue as any);

    queueManager = new QueueManager();
  });

  describe('Initialization', () => {
    it('should create all queues on initialization', () => {
      expect(Bull).toHaveBeenCalledTimes(4); // 4 queue types
    });

    it('should setup event listeners for each queue', () => {
      // Each queue should have event listeners
      expect(mockQueue.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('waiting', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('active', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
    });
  });

  describe('getQueue', () => {
    it('should return queue by name', () => {
      const queue = queueManager.getQueue(TaskType.APPOINTMENT_CONFIRMATION);

      expect(queue).toBeDefined();
    });

    it('should return undefined for non-existent queue', () => {
      const queue = queueManager.getQueue('non-existent' as any);

      expect(queue).toBeUndefined();
    });
  });

  describe('addJob', () => {
    it('should add job to queue', async () => {
      const jobData = {
        appointment_id: 'apt-123',
        customer_phone: '+905551234567',
        customer_name: 'Test Müşteri',
        appointment_date: '2024-01-15',
        appointment_time: '14:00',
      };

      const job = await queueManager.addJob(
        TaskType.APPOINTMENT_CONFIRMATION,
        jobData
      );

      expect(job).toBeDefined();
      expect(job.id).toBe('mock-job-id');
      expect(mockQueue.add).toHaveBeenCalledWith(jobData, undefined);
    });

    it('should add job with custom options', async () => {
      const jobData = { test: 'data' };
      const options = { priority: 1, attempts: 5 };

      await queueManager.addJob(TaskType.CALLBACK, jobData, options);

      expect(mockQueue.add).toHaveBeenCalledWith(jobData, options);
    });

    it('should throw error for non-existent queue', async () => {
      await expect(
        queueManager.addJob('invalid-queue' as any, {})
      ).rejects.toThrow('Queue not found: invalid-queue');
    });
  });

  describe('addDelayedJob', () => {
    it('should add job with delay', async () => {
      const jobData = { test: 'data' };
      const delay = 5000; // 5 seconds

      await queueManager.addDelayedJob(TaskType.CALLBACK, jobData, delay);

      expect(mockQueue.add).toHaveBeenCalledWith(jobData, { delay });
    });

    it('should merge delay with custom options', async () => {
      const jobData = { test: 'data' };
      const delay = 10000;
      const options = { priority: 1 };

      await queueManager.addDelayedJob(TaskType.CALLBACK, jobData, delay, options);

      expect(mockQueue.add).toHaveBeenCalledWith(jobData, {
        ...options,
        delay,
      });
    });
  });

  describe('addScheduledJob', () => {
    it('should schedule job for future time', async () => {
      const jobData = { test: 'data' };
      const scheduledAt = new Date(Date.now() + 3600000); // 1 hour from now

      await queueManager.addScheduledJob(TaskType.CALLBACK, jobData, scheduledAt);

      expect(mockQueue.add).toHaveBeenCalledWith(
        jobData,
        expect.objectContaining({
          delay: expect.any(Number),
        })
      );
    });

    it('should throw error for past scheduled time', async () => {
      const jobData = { test: 'data' };
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago

      await expect(
        queueManager.addScheduledJob(TaskType.CALLBACK, jobData, pastTime)
      ).rejects.toThrow('Scheduled time must be in the future');
    });
  });

  describe('getJob', () => {
    it('should retrieve job by ID', async () => {
      const mockJobData = { id: 'job-123', data: {} };
      mockQueue.getJob.mockResolvedValueOnce(mockJobData);

      const job = await queueManager.getJob(TaskType.CALLBACK, 'job-123');

      expect(job).toBe(mockJobData);
      expect(mockQueue.getJob).toHaveBeenCalledWith('job-123');
    });

    it('should return null for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      const job = await queueManager.getJob(TaskType.CALLBACK, 'non-existent');

      expect(job).toBeNull();
    });

    it('should throw error for non-existent queue', async () => {
      await expect(
        queueManager.getJob('invalid-queue' as any, 'job-123')
      ).rejects.toThrow('Queue not found: invalid-queue');
    });
  });

  describe('cancelJob', () => {
    it('should cancel job by ID', async () => {
      const mockJob = {
        id: 'job-123',
        remove: jest.fn().mockResolvedValue(undefined),
      };

      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      await queueManager.cancelJob(TaskType.CALLBACK, 'job-123');

      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should throw error if job not found', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      await expect(
        queueManager.cancelJob(TaskType.CALLBACK, 'non-existent')
      ).rejects.toThrow('Job not found: non-existent');
    });
  });

  describe('retryJob', () => {
    it('should retry failed job', async () => {
      const mockJob = {
        id: 'job-123',
        retry: jest.fn().mockResolvedValue(undefined),
      };

      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      await queueManager.retryJob(TaskType.CALLBACK, 'job-123');

      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('should throw error if job not found', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      await expect(
        queueManager.retryJob(TaskType.CALLBACK, 'non-existent')
      ).rejects.toThrow('Job not found: non-existent');
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await queueManager.getQueueStats(TaskType.CALLBACK);

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 10,
        delayed: 3,
      });

      expect(mockQueue.getWaitingCount).toHaveBeenCalled();
      expect(mockQueue.getActiveCount).toHaveBeenCalled();
      expect(mockQueue.getCompletedCount).toHaveBeenCalled();
      expect(mockQueue.getFailedCount).toHaveBeenCalled();
      expect(mockQueue.getDelayedCount).toHaveBeenCalled();
    });

    it('should throw error for non-existent queue', async () => {
      await expect(
        queueManager.getQueueStats('invalid-queue' as any)
      ).rejects.toThrow('Queue not found: invalid-queue');
    });
  });

  describe('getAllQueuesStats', () => {
    it('should return stats for all queues', async () => {
      const allStats = await queueManager.getAllQueuesStats();

      expect(allStats).toHaveProperty(TaskType.APPOINTMENT_CONFIRMATION);
      expect(allStats).toHaveProperty(TaskType.APPOINTMENT_REMINDER);
      expect(allStats).toHaveProperty(TaskType.CALLBACK);
      expect(allStats).toHaveProperty(TaskType.DAILY_SUMMARY);

      Object.values(allStats).forEach((stats: any) => {
        expect(stats).toEqual({
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 10,
          delayed: 3,
        });
      });
    });
  });

  describe('pauseQueue', () => {
    it('should pause queue', async () => {
      await queueManager.pauseQueue(TaskType.CALLBACK);

      expect(mockQueue.pause).toHaveBeenCalled();
    });

    it('should throw error for non-existent queue', async () => {
      await expect(
        queueManager.pauseQueue('invalid-queue' as any)
      ).rejects.toThrow('Queue not found: invalid-queue');
    });
  });

  describe('resumeQueue', () => {
    it('should resume paused queue', async () => {
      await queueManager.resumeQueue(TaskType.CALLBACK);

      expect(mockQueue.resume).toHaveBeenCalled();
    });

    it('should throw error for non-existent queue', async () => {
      await expect(
        queueManager.resumeQueue('invalid-queue' as any)
      ).rejects.toThrow('Queue not found: invalid-queue');
    });
  });

  describe('cleanQueue', () => {
    it('should clean old jobs with default grace period', async () => {
      await queueManager.cleanQueue(TaskType.CALLBACK);

      expect(mockQueue.clean).toHaveBeenCalledTimes(2);
      expect(mockQueue.clean).toHaveBeenCalledWith(86400000, 'completed');
      expect(mockQueue.clean).toHaveBeenCalledWith(86400000, 'failed');
    });

    it('should clean old jobs with custom grace period', async () => {
      const grace = 3600000; // 1 hour

      await queueManager.cleanQueue(TaskType.CALLBACK, grace);

      expect(mockQueue.clean).toHaveBeenCalledWith(grace, 'completed');
      expect(mockQueue.clean).toHaveBeenCalledWith(grace, 'failed');
    });

    it('should throw error for non-existent queue', async () => {
      await expect(
        queueManager.cleanQueue('invalid-queue' as any)
      ).rejects.toThrow('Queue not found: invalid-queue');
    });
  });

  describe('obliterateQueue', () => {
    it('should obliterate queue (remove all jobs)', async () => {
      await queueManager.obliterateQueue(TaskType.CALLBACK);

      expect(mockQueue.obliterate).toHaveBeenCalledWith({ force: true });
    });

    it('should throw error for non-existent queue', async () => {
      await expect(
        queueManager.obliterateQueue('invalid-queue' as any)
      ).rejects.toThrow('Queue not found: invalid-queue');
    });
  });

  describe('closeAll', () => {
    it('should close all queues', async () => {
      await queueManager.closeAll();

      // Close should be called on each queue (4 queues total)
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });
});
