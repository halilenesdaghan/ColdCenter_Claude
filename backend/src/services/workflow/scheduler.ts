/**
 * Scheduler - Cron jobs for automated tasks
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { queueManager } from './queue-manager';
import { dynamoDBService, Tables } from '../database/dynamodb-client';
import { TaskType, TaskStatus } from '../../types';
import { format, subHours, addHours } from 'date-fns';

/**
 * Scheduler class
 */
export class Scheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Start all scheduled jobs
   */
  start(): void {
    // Scan follow-up queue every 5 minutes
    this.scheduleJob(
      'scan-follow-up-queue',
      '*/5 * * * *', // Every 5 minutes
      () => this.scanFollowUpQueue(),
    );

    // Schedule appointment reminders (daily at 9 AM)
    this.scheduleJob(
      'schedule-reminders',
      '0 9 * * *', // 9 AM daily
      () => this.scheduleAppointmentReminders(),
    );

    // Schedule appointment confirmations (daily at 10 AM)
    this.scheduleJob(
      'schedule-confirmations',
      '0 10 * * *', // 10 AM daily
      () => this.scheduleAppointmentConfirmations(),
    );

    // Generate daily summary (daily at 11 PM)
    this.scheduleJob(
      'daily-summary',
      '0 23 * * *', // 11 PM daily
      () => this.generateDailySummary(),
    );

    // Clean old queue jobs (daily at 2 AM)
    this.scheduleJob(
      'clean-queues',
      '0 2 * * *', // 2 AM daily
      () => this.cleanOldQueueJobs(),
    );

    logger.info('Scheduler started', {
      jobs: Array.from(this.jobs.keys()),
    });
  }

  /**
   * Schedule a cron job
   */
  private scheduleJob(name: string, cronExpression: string, handler: () => Promise<void>): void {
    const task = cron.schedule(cronExpression, async () => {
      try {
        logger.debug('Running scheduled job', { job: name });
        await handler();
        logger.info('Scheduled job completed', { job: name });
      } catch (error) {
        logger.error('Scheduled job failed', { job: name, error });
      }
    });

    this.jobs.set(name, task);
    logger.info('Scheduled job registered', { job: name, cron: cronExpression });
  }

  /**
   * Scan follow-up queue and schedule calls
   */
  private async scanFollowUpQueue(): Promise<void> {
    try {
      const now = Date.now();

      // Query pending tasks due now or overdue
      const tasks = await dynamoDBService.query(
        Tables.FOLLOW_UP_QUEUE,
        '#status = :status AND scheduled_at <= :now',
        {
          ':status': TaskStatus.PENDING,
          ':now': now,
        },
        {
          indexName: 'scheduled_at_index',
          expressionAttributeNames: {
            '#status': 'status',
          },
          limit: 100, // Process max 100 tasks per run
        },
      );

      logger.info('Scanned follow-up queue', {
        pendingTasks: tasks.length,
      });

      // Schedule each task
      for (const task of tasks) {
        try {
          // Mark as in progress
          await dynamoDBService.update(
            Tables.FOLLOW_UP_QUEUE,
            { task_id: task.task_id },
            {
              status: TaskStatus.IN_PROGRESS,
              updated_at: Date.now(),
            },
          );

          // Add to appropriate queue
          await queueManager.addJob(task.task_type, {
            ...task.task_data,
            task_id: task.task_id,
            customer_phone: task.customer_phone,
            customer_name: task.customer_name,
          });

          logger.info('Follow-up task scheduled', {
            task_id: task.task_id,
            task_type: task.task_type,
          });
        } catch (error) {
          logger.error('Failed to schedule follow-up task', {
            task_id: task.task_id,
            error,
          });

          // Mark as failed
          await dynamoDBService.update(
            Tables.FOLLOW_UP_QUEUE,
            { task_id: task.task_id },
            {
              status: TaskStatus.FAILED,
              updated_at: Date.now(),
            },
          );
        }
      }
    } catch (error) {
      logger.error('Failed to scan follow-up queue', { error });
    }
  }

  /**
   * Schedule appointment reminders for tomorrow
   */
  private async scheduleAppointmentReminders(): Promise<void> {
    try {
      const tomorrow = format(addHours(new Date(), 24), 'yyyy-MM-dd');

      // Get appointments for tomorrow
      const appointments = await dynamoDBService.query(
        Tables.APPOINTMENTS,
        'appointment_date = :date',
        {
          ':date': tomorrow,
        },
        {
          indexName: 'appointment_date_index',
        },
      );

      logger.info('Scheduling appointment reminders', {
        date: tomorrow,
        count: appointments.length,
      });

      for (const appointment of appointments) {
        // Skip if reminder already sent
        if (appointment.reminder_sent) {
          continue;
        }

        // Schedule reminder for 9 AM
        const reminderTime = new Date(`${appointment.appointment_date}T09:00:00`);

        await queueManager.addScheduledJob(
          TaskType.APPOINTMENT_REMINDER,
          {
            appointment_id: appointment.appointment_id,
            customer_phone: appointment.customer_phone,
            customer_name: appointment.customer_name,
            appointment_date: appointment.appointment_date,
            appointment_time: appointment.appointment_time,
          },
          reminderTime,
        );

        logger.info('Appointment reminder scheduled', {
          appointment_id: appointment.appointment_id,
          scheduled_at: reminderTime.toISOString(),
        });
      }
    } catch (error) {
      logger.error('Failed to schedule appointment reminders', { error });
    }
  }

  /**
   * Schedule appointment confirmations for next 2 days
   */
  private async scheduleAppointmentConfirmations(): Promise<void> {
    try {
      const tomorrow = format(addHours(new Date(), 24), 'yyyy-MM-dd');
      const dayAfter = format(addHours(new Date(), 48), 'yyyy-MM-dd');

      // Get appointments for next 2 days
      const tomorrowAppointments = await dynamoDBService.query(
        Tables.APPOINTMENTS,
        'appointment_date = :date',
        { ':date': tomorrow },
        { indexName: 'appointment_date_index' },
      );

      const dayAfterAppointments = await dynamoDBService.query(
        Tables.APPOINTMENTS,
        'appointment_date = :date',
        { ':date': dayAfter },
        { indexName: 'appointment_date_index' },
      );

      const allAppointments = [...tomorrowAppointments, ...dayAfterAppointments];

      logger.info('Scheduling appointment confirmations', {
        count: allAppointments.length,
      });

      for (const appointment of allAppointments) {
        // Skip if confirmation already completed
        if (appointment.confirmation_call_completed) {
          continue;
        }

        // Schedule confirmation 48 hours before appointment
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
        const confirmationTime = subHours(appointmentDateTime, 48);

        // Only schedule if confirmation time is in the future
        if (confirmationTime > new Date()) {
          await queueManager.addScheduledJob(
            TaskType.APPOINTMENT_CONFIRMATION,
            {
              appointment_id: appointment.appointment_id,
              customer_phone: appointment.customer_phone,
              customer_name: appointment.customer_name,
              appointment_date: appointment.appointment_date,
              appointment_time: appointment.appointment_time,
              vehicle_model: appointment.vehicle_model,
            },
            confirmationTime,
          );

          logger.info('Appointment confirmation scheduled', {
            appointment_id: appointment.appointment_id,
            scheduled_at: confirmationTime.toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to schedule appointment confirmations', { error });
    }
  }

  /**
   * Generate daily summary
   */
  private async generateDailySummary(): Promise<void> {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      await queueManager.addJob(TaskType.DAILY_SUMMARY, {
        date: today,
        recipient_emails: [], // TODO: Get from config
      });

      logger.info('Daily summary job scheduled', { date: today });
    } catch (error) {
      logger.error('Failed to schedule daily summary', { error });
    }
  }

  /**
   * Clean old queue jobs
   */
  private async cleanOldQueueJobs(): Promise<void> {
    try {
      const gracePeriod = 7 * 24 * 60 * 60 * 1000; // 7 days

      await queueManager.cleanQueue(TaskType.APPOINTMENT_CONFIRMATION, gracePeriod);
      await queueManager.cleanQueue(TaskType.APPOINTMENT_REMINDER, gracePeriod);
      await queueManager.cleanQueue(TaskType.CALLBACK, gracePeriod);
      await queueManager.cleanQueue(TaskType.DAILY_SUMMARY, gracePeriod);

      logger.info('Old queue jobs cleaned', { gracePeriod });
    } catch (error) {
      logger.error('Failed to clean old queue jobs', { error });
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const [name, task] of this.jobs) {
      task.stop();
      logger.info('Scheduled job stopped', { job: name });
    }

    this.jobs.clear();
    logger.info('Scheduler stopped');
  }

  /**
   * Get running jobs
   */
  getRunningJobs(): string[] {
    return Array.from(this.jobs.keys());
  }
}

// Export singleton instance
export const scheduler = new Scheduler();
