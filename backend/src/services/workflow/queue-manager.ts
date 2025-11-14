/**
 * Queue Manager - Bull Queue setup and management
 */

import Bull, { Queue, Job, JobOptions } from 'bull';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { TaskType } from '../../types';

/**
 * Queue configuration
 */
const queueConfig = {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500,     // Keep last 500 failed jobs
  },
};

/**
 * Job data types
 */
export interface AppointmentConfirmationJob {
  appointment_id: string;
  customer_phone: string;
  customer_name: string;
  appointment_date: string;
  appointment_time: string;
  vehicle_model?: string;
}

export interface AppointmentReminderJob {
  appointment_id: string;
  customer_phone: string;
  customer_name: string;
  appointment_date: string;
  appointment_time: string;
}

export interface CallbackJob {
  call_id: string;
  customer_phone: string;
  customer_name: string;
  reason: string;
  priority: number;
}

export interface DailySummaryJob {
  date: string;
  recipient_emails: string[];
}

/**
 * Queue Manager class
 */
export class QueueManager {
  private queues: Map<string, Queue> = new Map();

  constructor() {
    this.initializeQueues();
  }

  /**
   * Initialize all queues
   */
  private initializeQueues(): void {
    // Appointment confirmation queue
    this.createQueue(TaskType.APPOINTMENT_CONFIRMATION, {
      ...queueConfig.defaultJobOptions,
      attempts: 5, // More attempts for confirmations
    });

    // Appointment reminder queue
    this.createQueue(TaskType.APPOINTMENT_REMINDER, {
      ...queueConfig.defaultJobOptions,
      attempts: 3,
    });

    // Callback queue
    this.createQueue(TaskType.CALLBACK, {
      ...queueConfig.defaultJobOptions,
      attempts: 3,
      priority: 1,
    });

    // Daily summary queue
    this.createQueue(TaskType.DAILY_SUMMARY, {
      ...queueConfig.defaultJobOptions,
      attempts: 2,
    });

    logger.info('Queue Manager initialized', {
      queues: Array.from(this.queues.keys()),
    });
  }

  /**
   * Create a queue
   */
  private createQueue(name: string, defaultJobOptions: JobOptions): Queue {
    const queue = new Bull(name, {
      redis: queueConfig.redis,
      defaultJobOptions,
    });

    // Queue event handlers
    queue.on('error', (error) => {
      logger.error('Queue error', { queue: name, error });
    });

    queue.on('waiting', (jobId) => {
      logger.debug('Job waiting', { queue: name, jobId });
    });

    queue.on('active', (job) => {
      logger.debug('Job active', { queue: name, jobId: job.id });
    });

    queue.on('completed', (job) => {
      logger.info('Job completed', {
        queue: name,
        jobId: job.id,
        duration: job.finishedOn! - job.processedOn!,
      });
    });

    queue.on('failed', (job, error) => {
      logger.error('Job failed', {
        queue: name,
        jobId: job.id,
        attempts: job.attemptsMade,
        error: error.message,
      });
    });

    queue.on('stalled', (job) => {
      logger.warn('Job stalled', { queue: name, jobId: job.id });
    });

    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Get queue by name
   */
  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Add job to queue
   */
  async addJob<T = any>(
    queueName: string,
    data: T,
    options?: JobOptions,
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const job = await queue.add(data, options);

    logger.info('Job added to queue', {
      queue: queueName,
      jobId: job.id,
      data,
    });

    return job;
  }

  /**
   * Add job with delay
   */
  async addDelayedJob<T = any>(
    queueName: string,
    data: T,
    delay: number,
    options?: JobOptions,
  ): Promise<Job<T>> {
    return this.addJob(queueName, data, {
      ...options,
      delay,
    });
  }

  /**
   * Add job scheduled for specific time
   */
  async addScheduledJob<T = any>(
    queueName: string,
    data: T,
    scheduledAt: Date,
    options?: JobOptions,
  ): Promise<Job<T>> {
    const delay = scheduledAt.getTime() - Date.now();

    if (delay < 0) {
      throw new Error('Scheduled time must be in the future');
    }

    return this.addDelayedJob(queueName, data, delay, options);
  }

  /**
   * Get job by ID
   */
  async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    return queue.getJob(jobId);
  }

  /**
   * Cancel job
   */
  async cancelJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    await job.remove();

    logger.info('Job cancelled', { queue: queueName, jobId });
  }

  /**
   * Retry failed job
   */
  async retryJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    await job.retry();

    logger.info('Job retried', { queue: queueName, jobId });
  }

  /**
   * Get queue stats
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get all queues stats
   */
  async getAllQueuesStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

    for (const [name] of this.queues) {
      stats[name] = await this.getQueueStats(name);
    }

    return stats;
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.pause();

    logger.info('Queue paused', { queue: queueName });
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.resume();

    logger.info('Queue resumed', { queue: queueName });
  }

  /**
   * Clean old jobs
   */
  async cleanQueue(queueName: string, grace: number = 86400000): Promise<void> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    // Clean completed jobs older than grace period
    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');

    logger.info('Queue cleaned', { queue: queueName, grace });
  }

  /**
   * Obliterate queue (remove all jobs)
   */
  async obliterateQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.obliterate({ force: true });

    logger.warn('Queue obliterated', { queue: queueName });
  }

  /**
   * Close all queues
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map((queue) => queue.close());

    await Promise.all(closePromises);

    logger.info('All queues closed');
  }
}

// Export singleton instance
export const queueManager = new QueueManager();
