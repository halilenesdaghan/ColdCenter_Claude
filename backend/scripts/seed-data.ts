/**
 * Seed Database with Test Data
 * Run with: npm run db:seed
 */

import { dynamoDBService, Tables } from '../src/services/database/dynamodb-client';
import { CallStatus, CallState, CallDirection, Intent } from '../src/types';
import { logger } from '../src/utils/logger';
import { generateCallId, generateAppointmentId, toISODate, toISOTime } from '../src/utils/helpers';

/**
 * Seed call sessions
 */
async function seedCallSessions() {
  logger.info('Seeding call sessions...');

  const sessions = [
    {
      call_id: generateCallId(),
      customer_phone: '+905551234567',
      customer_name: 'Ahmet Yılmaz',
      direction: CallDirection.INBOUND,
      status: CallStatus.COMPLETED,
      state: CallState.ENDED,
      intent: Intent.TEST_DRIVE_BOOKING,
      escalated: false,
      created_at: Date.now() - 86400000, // 1 day ago
      ended_at: Date.now() - 86400000 + 300000, // 5 minutes later
      duration_seconds: 300,
      summary: 'Müşteri Corsa Electric için test sürüşü randevusu aldı.',
    },
    {
      call_id: generateCallId(),
      customer_phone: '+905557654321',
      customer_name: 'Ayşe Demir',
      direction: CallDirection.INBOUND,
      status: CallStatus.COMPLETED,
      state: CallState.ENDED,
      intent: Intent.VEHICLE_PRICE_INQUIRY,
      escalated: false,
      created_at: Date.now() - 43200000, // 12 hours ago
      ended_at: Date.now() - 43200000 + 180000, // 3 minutes later
      duration_seconds: 180,
      summary: 'Müşteri Astra modeli fiyat bilgisi aldı.',
    },
    {
      call_id: generateCallId(),
      customer_phone: '+905559876543',
      customer_name: 'Mehmet Kaya',
      direction: CallDirection.INBOUND,
      status: CallStatus.COMPLETED,
      state: CallState.ENDED,
      intent: Intent.SERVICE_APPOINTMENT,
      escalated: false,
      created_at: Date.now() - 21600000, // 6 hours ago
      ended_at: Date.now() - 21600000 + 420000, // 7 minutes later
      duration_seconds: 420,
      summary: 'Periyodik bakım randevusu oluşturuldu.',
    },
    {
      call_id: generateCallId(),
      customer_phone: '+905553456789',
      customer_name: 'Fatma Şahin',
      direction: CallDirection.INBOUND,
      status: CallStatus.COMPLETED,
      state: CallState.ENDED,
      intent: Intent.VEHICLE_STOCK_CHECK,
      escalated: true,
      transfer_reason: 'Özel renk talebi',
      created_at: Date.now() - 7200000, // 2 hours ago
      ended_at: Date.now() - 7200000 + 240000, // 4 minutes later
      duration_seconds: 240,
      summary: 'Müşteri özel renk için danışmana aktarıldı.',
    },
    {
      call_id: generateCallId(),
      customer_phone: '+905556789012',
      customer_name: 'Can Öztürk',
      direction: CallDirection.OUTBOUND,
      status: CallStatus.COMPLETED,
      state: CallState.ENDED,
      intent: Intent.APPOINTMENT_CONFIRMATION,
      escalated: false,
      created_at: Date.now() - 3600000, // 1 hour ago
      ended_at: Date.now() - 3600000 + 120000, // 2 minutes later
      duration_seconds: 120,
      summary: 'Randevu teyit aramasi - müşteri randevuyu onayladı.',
    },
  ];

  for (const session of sessions) {
    await dynamoDBService.put(Tables.CALL_SESSIONS, session);
    logger.info('Created call session', { call_id: session.call_id });
  }

  logger.info(`Seeded ${sessions.length} call sessions`);
}

/**
 * Seed appointments
 */
async function seedAppointments() {
  logger.info('Seeding appointments...');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const appointments = [
    {
      appointment_id: generateAppointmentId(),
      customer_phone: '+905551234567',
      customer_name: 'Ahmet Yılmaz',
      appointment_type: 'test_drive',
      appointment_date: toISODate(tomorrow),
      appointment_time: '14:00',
      vehicle_model: 'Corsa Electric',
      status: 'confirmed',
      confirmation_code: 'TD-ABC123',
      created_at: Date.now() - 86400000,
      confirmed_at: Date.now() - 86400000 + 300000,
    },
    {
      appointment_id: generateAppointmentId(),
      customer_phone: '+905559876543',
      customer_name: 'Mehmet Kaya',
      appointment_type: 'service',
      appointment_date: toISODate(tomorrow),
      appointment_time: '10:00',
      vehicle_plate: '34ABC123',
      service_type: 'Periyodik Bakım',
      status: 'confirmed',
      confirmation_code: 'SRV-XYZ789',
      created_at: Date.now() - 21600000,
      confirmed_at: Date.now() - 21600000 + 420000,
    },
    {
      appointment_id: generateAppointmentId(),
      customer_phone: '+905556789012',
      customer_name: 'Can Öztürk',
      appointment_type: 'test_drive',
      appointment_date: toISODate(nextWeek),
      appointment_time: '11:00',
      vehicle_model: 'Grandland',
      status: 'pending',
      confirmation_code: 'TD-DEF456',
      created_at: Date.now() - 3600000,
    },
    {
      appointment_id: generateAppointmentId(),
      customer_phone: '+905552345678',
      customer_name: 'Zeynep Arslan',
      appointment_type: 'service',
      appointment_date: toISODate(nextWeek),
      appointment_time: '15:30',
      vehicle_plate: '06XYZ987',
      service_type: 'Lastik Değişimi',
      status: 'confirmed',
      confirmation_code: 'SRV-QWE456',
      created_at: Date.now() - 7200000,
      confirmed_at: Date.now() - 7200000 + 180000,
    },
  ];

  for (const appointment of appointments) {
    await dynamoDBService.put(Tables.APPOINTMENTS, appointment);
    logger.info('Created appointment', { appointment_id: appointment.appointment_id });
  }

  logger.info(`Seeded ${appointments.length} appointments`);
}

/**
 * Seed customers
 */
async function seedCustomers() {
  logger.info('Seeding customers...');

  const customers = [
    {
      customer_id: 'cust-1',
      phone: '+905551234567',
      name: 'Ahmet Yılmaz',
      email: 'ahmet.yilmaz@example.com',
      preferred_language: 'tr',
      total_calls: 3,
      total_appointments: 2,
      last_contact: Date.now() - 86400000,
      created_at: Date.now() - 2592000000, // 30 days ago
      tags: ['test_drive', 'electric_vehicle'],
    },
    {
      customer_id: 'cust-2',
      phone: '+905557654321',
      name: 'Ayşe Demir',
      email: 'ayse.demir@example.com',
      preferred_language: 'tr',
      total_calls: 2,
      total_appointments: 0,
      last_contact: Date.now() - 43200000,
      created_at: Date.now() - 1296000000, // 15 days ago
      tags: ['price_inquiry'],
    },
    {
      customer_id: 'cust-3',
      phone: '+905559876543',
      name: 'Mehmet Kaya',
      email: 'mehmet.kaya@example.com',
      preferred_language: 'tr',
      total_calls: 4,
      total_appointments: 3,
      last_contact: Date.now() - 21600000,
      created_at: Date.now() - 7776000000, // 90 days ago
      tags: ['service', 'returning_customer'],
      vehicle_info: {
        plate: '34ABC123',
        model: 'Astra',
        year: 2022,
      },
    },
    {
      customer_id: 'cust-4',
      phone: '+905553456789',
      name: 'Fatma Şahin',
      email: 'fatma.sahin@example.com',
      preferred_language: 'tr',
      total_calls: 1,
      total_appointments: 0,
      last_contact: Date.now() - 7200000,
      created_at: Date.now() - 86400000,
      tags: ['new_customer', 'special_request'],
    },
    {
      customer_id: 'cust-5',
      phone: '+905556789012',
      customer_name: 'Can Öztürk',
      email: 'can.ozturk@example.com',
      preferred_language: 'tr',
      total_calls: 2,
      total_appointments: 1,
      last_contact: Date.now() - 3600000,
      created_at: Date.now() - 604800000, // 7 days ago
      tags: ['test_drive', 'grandland'],
    },
  ];

  for (const customer of customers) {
    await dynamoDBService.put(Tables.CUSTOMERS, customer);
    logger.info('Created customer', { customer_id: customer.customer_id });
  }

  logger.info(`Seeded ${customers.length} customers`);
}

/**
 * Seed daily analytics
 */
async function seedAnalytics() {
  logger.info('Seeding analytics...');

  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  const twoDaysAgo = toISODate(new Date(Date.now() - 172800000));

  const analytics = [
    {
      date: today,
      metric_name: 'daily_summary',
      metric_value: JSON.stringify({
        total_calls: 12,
        completed_calls: 10,
        escalated_calls: 2,
        automation_rate: 83.33,
        total_appointments: 4,
        confirmed_appointments: 3,
        appointment_conversion_rate: 33.33,
        avg_call_duration: 245,
      }),
      created_at: Date.now(),
    },
    {
      date: yesterday,
      metric_name: 'daily_summary',
      metric_value: JSON.stringify({
        total_calls: 18,
        completed_calls: 15,
        escalated_calls: 3,
        automation_rate: 80.00,
        total_appointments: 6,
        confirmed_appointments: 5,
        appointment_conversion_rate: 33.33,
        avg_call_duration: 268,
      }),
      created_at: Date.now() - 86400000,
    },
    {
      date: twoDaysAgo,
      metric_name: 'daily_summary',
      metric_value: JSON.stringify({
        total_calls: 15,
        completed_calls: 13,
        escalated_calls: 2,
        automation_rate: 86.67,
        total_appointments: 5,
        confirmed_appointments: 4,
        appointment_conversion_rate: 33.33,
        avg_call_duration: 232,
      }),
      created_at: Date.now() - 172800000,
    },
  ];

  for (const analytic of analytics) {
    await dynamoDBService.put(Tables.ANALYTICS_DAILY, analytic);
    logger.info('Created analytics entry', { date: analytic.date });
  }

  logger.info(`Seeded ${analytics.length} analytics entries`);
}

/**
 * Seed conversation history
 */
async function seedConversationHistory() {
  logger.info('Seeding conversation history...');

  const recentCallId = generateCallId();

  const conversations = [
    {
      call_id: recentCallId,
      sequence: 1,
      speaker: 'ai',
      text: 'Merhaba, Opel\'e hoş geldiniz. Size nasıl yardımcı olabilirim?',
      timestamp: Date.now() - 600000,
      language: 'tr',
    },
    {
      call_id: recentCallId,
      sequence: 2,
      speaker: 'customer',
      text: 'Merhaba, yeni Corsa Electric modeli hakkında bilgi almak istiyorum.',
      timestamp: Date.now() - 580000,
      language: 'tr',
      confidence: 0.95,
    },
    {
      call_id: recentCallId,
      sequence: 3,
      speaker: 'ai',
      text: 'Tabii ki! Corsa Electric modelimiz şu anda stoklarımızda mevcut. Fiyat bilgisi ve test sürüşü için size yardımcı olabilirim. Hangi konuda detaylı bilgi istersiniz?',
      timestamp: Date.now() - 560000,
      language: 'tr',
      intent: Intent.VEHICLE_PRICE_INQUIRY,
    },
    {
      call_id: recentCallId,
      sequence: 4,
      speaker: 'customer',
      text: 'Fiyatı ne kadar ve test sürüşü yapabilir miyim?',
      timestamp: Date.now() - 540000,
      language: 'tr',
      confidence: 0.92,
    },
    {
      call_id: recentCallId,
      sequence: 5,
      speaker: 'ai',
      text: 'Corsa Electric Elegance donanım 875.000 TL\'den başlayan fiyatlarla. Test sürüşü için size uygun bir randevu oluşturabilirim. Hangi tarih size uygun olur?',
      timestamp: Date.now() - 520000,
      language: 'tr',
    },
  ];

  for (const conversation of conversations) {
    await dynamoDBService.put(Tables.CONVERSATION_HISTORY, conversation);
  }

  logger.info(`Seeded ${conversations.length} conversation turns`);
}

/**
 * Main seed function
 */
async function main() {
  try {
    logger.info('=================================================');
    logger.info('Starting database seed...');
    logger.info('=================================================');

    await seedCallSessions();
    await seedAppointments();
    await seedCustomers();
    await seedAnalytics();
    await seedConversationHistory();

    logger.info('=================================================');
    logger.info('Database seed completed successfully!');
    logger.info('=================================================');
    process.exit(0);
  } catch (error) {
    logger.error('Database seed failed', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as seedDatabase };
