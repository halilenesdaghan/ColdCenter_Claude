/**
 * Job Processors - Handle Bull Queue jobs
 */

import { Job } from 'bull';
import { logger } from '../../utils/logger';
import { queueManager, AppointmentConfirmationJob, AppointmentReminderJob, CallbackJob, DailySummaryJob } from './queue-manager';
import { TaskType } from '../../types';
import { dynamoDBService, Tables } from '../database/dynamodb-client';
import { CallManager } from '../../core/call-manager';
import { CallDirection } from '../../types';

/**
 * Process appointment confirmation job
 */
export async function processAppointmentConfirmation(job: Job<AppointmentConfirmationJob>): Promise<void> {
  const { appointment_id, customer_phone, customer_name, appointment_date, appointment_time } = job.data;

  logger.info('Processing appointment confirmation', {
    jobId: job.id,
    appointment_id,
    customer_phone,
  });

  try {
    // Create outbound call
    const callManager = new CallManager(customer_phone, CallDirection.OUTBOUND);

    // Start call with confirmation intent
    await callManager.start();

    // Send confirmation message
    await callManager.processUserInput(
      `Randevu teyit: ${customer_name}, ${appointment_date} ${appointment_time}`,
    );

    // Update appointment status
    await dynamoDBService.update(
      Tables.APPOINTMENTS,
      { appointment_id },
      {
        confirmation_call_completed: true,
        confirmation_call_at: Date.now(),
      },
    );

    logger.info('Appointment confirmation completed', {
      jobId: job.id,
      appointment_id,
    });
  } catch (error) {
    logger.error('Appointment confirmation failed', {
      jobId: job.id,
      appointment_id,
      error,
    });
    throw error;
  }
}

/**
 * Process appointment reminder job
 */
export async function processAppointmentReminder(job: Job<AppointmentReminderJob>): Promise<void> {
  const { appointment_id, customer_phone, appointment_date, appointment_time } = job.data;

  logger.info('Processing appointment reminder', {
    jobId: job.id,
    appointment_id,
    customer_phone,
  });

  try {
    // In real implementation, this would:
    // 1. Send SMS reminder
    // 2. Or make automated reminder call
    // 3. Update reminder_sent flag

    // For now, just log
    logger.info('Sending reminder (placeholder)', {
      customer_phone,
      appointment_date,
      appointment_time,
    });

    // Update appointment status
    await dynamoDBService.update(
      Tables.APPOINTMENTS,
      { appointment_id },
      {
        reminder_sent: true,
        reminder_sent_at: Date.now(),
      },
    );

    logger.info('Appointment reminder sent', {
      jobId: job.id,
      appointment_id,
    });
  } catch (error) {
    logger.error('Appointment reminder failed', {
      jobId: job.id,
      appointment_id,
      error,
    });
    throw error;
  }
}

/**
 * Process callback job
 */
export async function processCallback(job: Job<CallbackJob>): Promise<void> {
  const { call_id, customer_phone, reason, priority } = job.data;

  logger.info('Processing callback', {
    jobId: job.id,
    call_id,
    customer_phone,
    priority,
  });

  try {
    // Create outbound call
    const callManager = new CallManager(customer_phone, CallDirection.OUTBOUND);

    // Start call
    await callManager.start();

    // Process based on reason
    await callManager.processUserInput(`Geri arama nedeni: ${reason}`);

    logger.info('Callback completed', {
      jobId: job.id,
      call_id,
    });
  } catch (error) {
    logger.error('Callback failed', {
      jobId: job.id,
      call_id,
      error,
    });
    throw error;
  }
}

/**
 * Process daily summary job
 */
export async function processDailySummary(job: Job<DailySummaryJob>): Promise<void> {
  const { date } = job.data;

  logger.info('Processing daily summary', {
    jobId: job.id,
    date,
  });

  try {
    // Fetch daily stats
    const calls = await dynamoDBService.scan(Tables.CALL_SESSIONS, {
      filterExpression: 'created_at >= :start AND created_at < :end',
      expressionAttributeValues: {
        ':start': new Date(date).setHours(0, 0, 0, 0),
        ':end': new Date(date).setHours(23, 59, 59, 999),
      },
    });

    const appointments = await dynamoDBService.scan(Tables.APPOINTMENTS, {
      filterExpression: 'appointment_date = :date',
      expressionAttributeValues: {
        ':date': date,
      },
    });

    // Calculate metrics
    const totalCalls = calls.length;
    const completedCalls = calls.filter((c: any) => c.status === 'completed').length;
    const escalatedCalls = calls.filter((c: any) => c.escalated === true).length;
    const totalAppointments = appointments.length;
    const confirmedAppointments = appointments.filter((a: any) => a.status === 'confirmed').length;

    const summary = {
      date,
      total_calls: totalCalls,
      completed_calls: completedCalls,
      escalated_calls: escalatedCalls,
      automation_rate: totalCalls > 0 ? ((completedCalls - escalatedCalls) / totalCalls) * 100 : 0,
      total_appointments: totalAppointments,
      confirmed_appointments: confirmedAppointments,
      appointment_conversion_rate: totalCalls > 0 ? (totalAppointments / totalCalls) * 100 : 0,
    };

    // Save summary
    await dynamoDBService.put(Tables.ANALYTICS_DAILY, {
      date,
      metric_name: 'daily_summary',
      metric_value: JSON.stringify(summary),
      created_at: Date.now(),
    });

    // In real implementation, send email with summary
    logger.info('Daily summary generated', {
      jobId: job.id,
      date,
      summary,
    });

    logger.info('Daily summary completed', {
      jobId: job.id,
      date,
    });
  } catch (error) {
    logger.error('Daily summary failed', {
      jobId: job.id,
      date,
      error,
    });
    throw error;
  }
}

/**
 * Register all job processors
 */
export function registerProcessors(): void {
  // Appointment confirmation processor
  const confirmationQueue = queueManager.getQueue(TaskType.APPOINTMENT_CONFIRMATION);
  if (confirmationQueue) {
    confirmationQueue.process(async (job) => {
      await processAppointmentConfirmation(job as Job<AppointmentConfirmationJob>);
    });
  }

  // Appointment reminder processor
  const reminderQueue = queueManager.getQueue(TaskType.APPOINTMENT_REMINDER);
  if (reminderQueue) {
    reminderQueue.process(async (job) => {
      await processAppointmentReminder(job as Job<AppointmentReminderJob>);
    });
  }

  // Callback processor
  const callbackQueue = queueManager.getQueue(TaskType.CALLBACK);
  if (callbackQueue) {
    callbackQueue.process(async (job) => {
      await processCallback(job as Job<CallbackJob>);
    });
  }

  // Daily summary processor
  const summaryQueue = queueManager.getQueue(TaskType.DAILY_SUMMARY);
  if (summaryQueue) {
    summaryQueue.process(async (job) => {
      await processDailySummary(job as Job<DailySummaryJob>);
    });
  }

  logger.info('All job processors registered');
}
