/**
 * Test Helpers - Common utilities for tests
 */

import { CallSession, CallStatus, CallState, CallDirection, Intent } from '../../types';

/**
 * Create mock call session
 */
export function createMockCallSession(overrides?: Partial<CallSession>): CallSession {
  return {
    call_id: 'test-call-123',
    customer_phone: '+905551234567',
    customer_name: 'Test Müşteri',
    direction: CallDirection.INBOUND,
    status: CallStatus.ACTIVE,
    state: CallState.GREETING,
    intent: undefined,
    slots: {},
    conversation_history: [],
    escalated: false,
    escalation_reason: undefined,
    human_takeover: false,
    recording_url: undefined,
    transcript_url: undefined,
    created_at: Date.now(),
    updated_at: Date.now(),
    ended_at: undefined,
    duration: undefined,
    metadata: {},
    ...overrides,
  };
}

/**
 * Create mock conversation history
 */
export function createMockConversationHistory() {
  return [
    {
      role: 'assistant',
      content: 'Merhaba, Opel Çağrı Merkezine hoş geldiniz. Size nasıl yardımcı olabilirim?',
      timestamp: Date.now() - 60000,
    },
    {
      role: 'user',
      content: 'Corsa Electric fiyatını öğrenmek istiyorum',
      timestamp: Date.now() - 50000,
    },
  ];
}

/**
 * Create mock DynamoDB response
 */
export function createMockDynamoDBResponse<T>(items: T[]) {
  return {
    Items: items,
    Count: items.length,
    ScannedCount: items.length,
  };
}

/**
 * Create mock S3 upload response
 */
export function createMockS3UploadResponse(key: string) {
  return {
    ETag: '"mock-etag-123"',
    Key: key,
    Location: `https://mock-bucket.s3.amazonaws.com/${key}`,
    Bucket: 'mock-bucket',
  };
}

/**
 * Create mock OpenAI response
 */
export function createMockOpenAIResponse(content: string, functionCall?: any) {
  return {
    id: 'chatcmpl-mock-123',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4-turbo-preview',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: functionCall ? null : content,
          function_call: functionCall,
        },
        finish_reason: functionCall ? 'function_call' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  };
}

/**
 * Create mock ElevenLabs TTS response
 */
export function createMockElevenLabsTTSResponse() {
  // Mock audio buffer (48kHz, 16-bit, mono)
  const duration = 2; // seconds
  const sampleRate = 48000;
  const samples = duration * sampleRate;
  const buffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample

  // Fill with mock audio data (sine wave)
  for (let i = 0; i < samples; i++) {
    const value = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 32767;
    buffer.writeInt16LE(Math.floor(value), i * 2);
  }

  return buffer;
}

/**
 * Create mock Opel API response
 */
export function createMockOpelVehicleResponse() {
  return {
    vehicle_id: 'CORSA-ELECTRIC-2024',
    model_name: 'Corsa Electric',
    variant: 'Edition',
    price: 1250000,
    currency: 'TRY',
    in_stock: true,
    estimated_delivery: '15-30 gün',
    features: ['Otomatik Şanzıman', 'Elektrikli Motor', 'Navigation'],
    image_url: 'https://example.com/corsa-electric.jpg',
  };
}

/**
 * Create mock appointment
 */
export function createMockAppointment(overrides?: any) {
  return {
    appointment_id: 'apt-123',
    call_id: 'test-call-123',
    customer_phone: '+905551234567',
    customer_name: 'Test Müşteri',
    appointment_date: '2024-01-15',
    appointment_time: '14:00',
    appointment_type: 'test_drive',
    vehicle_model: 'Corsa Electric',
    dealership_location: 'İstanbul Anadolu',
    status: 'confirmed',
    confirmation_call_completed: false,
    reminder_sent: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

/**
 * Wait for async operations
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100,
): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await sleep(interval);
  }
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate random phone number
 */
export function generatePhoneNumber(): string {
  const prefix = '+9055';
  const rest = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  return `${prefix}${rest}`;
}

/**
 * Generate random call ID
 */
export function generateCallId(): string {
  return `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create mock error
 */
export function createMockError(code: string, message: string, statusCode?: number) {
  const error: any = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Create mock network error (retryable)
 */
export function createMockNetworkError() {
  const error: any = new Error('Network error');
  error.code = 'ECONNRESET';
  return error;
}

/**
 * Create mock timeout error
 */
export function createMockTimeoutError() {
  const error: any = new Error('Request timeout');
  error.name = 'TimeoutError';
  error.code = 'ETIMEDOUT';
  return error;
}

/**
 * Assert error thrown
 */
export async function assertThrows(
  fn: () => Promise<any>,
  expectedError?: string | RegExp,
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error: any) {
    if (error.message === 'Expected function to throw, but it did not') {
      throw error;
    }

    if (expectedError) {
      if (typeof expectedError === 'string') {
        expect(error.message).toContain(expectedError);
      } else {
        expect(error.message).toMatch(expectedError);
      }
    }
  }
}

/**
 * Mock timer helpers
 */
export class MockTimer {
  private originalSetTimeout: typeof setTimeout;
  private originalSetInterval: typeof setInterval;
  private timers: Map<NodeJS.Timeout, { callback: Function; delay: number }> = new Map();

  constructor() {
    this.originalSetTimeout = global.setTimeout;
    this.originalSetInterval = global.setInterval;
  }

  install(): void {
    jest.useFakeTimers();
  }

  uninstall(): void {
    jest.useRealTimers();
  }

  tick(ms: number): void {
    jest.advanceTimersByTime(ms);
  }

  runAll(): void {
    jest.runAllTimers();
  }

  runOnlyPending(): void {
    jest.runOnlyPendingTimers();
  }
}

/**
 * Create spy with implementation
 */
export function createSpy<T extends (...args: any[]) => any>(
  implementation?: T,
): jest.MockedFunction<T> {
  return jest.fn(implementation) as jest.MockedFunction<T>;
}

/**
 * Verify function called with args
 */
export function verifyCalledWith(
  spy: jest.Mock,
  ...expectedArgs: any[]
): void {
  expect(spy).toHaveBeenCalledWith(...expectedArgs);
}

/**
 * Verify function called times
 */
export function verifyCalledTimes(
  spy: jest.Mock,
  times: number,
): void {
  expect(spy).toHaveBeenCalledTimes(times);
}
