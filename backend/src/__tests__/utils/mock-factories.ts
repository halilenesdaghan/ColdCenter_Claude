/**
 * Mock Factories - Factory functions for creating test mocks
 */

import { DynamoDBService } from '../../services/database/dynamodb-client';
import { S3Service } from '../../services/storage/s3-client';
import { ElevenLabsClient } from '../../services/speech/elevenlabs-client';
import { OpelAPIAdapter } from '../../adapters/opel-api-adapter';

/**
 * Mock DynamoDB Service
 */
export function createMockDynamoDBService(): jest.Mocked<DynamoDBService> {
  return {
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    scan: jest.fn().mockResolvedValue([]),
    batchGet: jest.fn().mockResolvedValue([]),
    batchWrite: jest.fn().mockResolvedValue(undefined),
    transactWrite: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
  } as any;
}

/**
 * Mock S3 Service
 */
export function createMockS3Service(): jest.Mocked<S3Service> {
  return {
    uploadFile: jest.fn().mockResolvedValue('mock-file-key'),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('mock data')),
    getSignedUrl: jest.fn().mockResolvedValue('https://mock-signed-url.com'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    fileExists: jest.fn().mockResolvedValue(true),
    listFiles: jest.fn().mockResolvedValue([]),
    copyFile: jest.fn().mockResolvedValue(undefined),
    getFileMetadata: jest.fn().mockResolvedValue({
      size: 1024,
      contentType: 'audio/mpeg',
      lastModified: new Date(),
    }),
  } as any;
}

/**
 * Mock ElevenLabs Client
 */
export function createMockElevenLabsClient(): jest.Mocked<ElevenLabsClient> {
  const mockAudioBuffer = Buffer.alloc(1024);

  return {
    textToSpeech: jest.fn().mockResolvedValue(mockAudioBuffer),
    textToSpeechStream: jest.fn().mockResolvedValue({
      pipe: jest.fn(),
      on: jest.fn(),
    }),
    speechToText: jest.fn().mockResolvedValue({
      text: 'Mock transcription',
      confidence: 0.95,
      language: 'tr',
    }),
    getVoices: jest.fn().mockResolvedValue([
      {
        voice_id: 'mock-voice-id',
        name: 'Turkish Voice',
        language: 'tr',
      },
    ]),
    getVoice: jest.fn().mockResolvedValue({
      voice_id: 'mock-voice-id',
      name: 'Turkish Voice',
      language: 'tr',
    }),
    getSubscriptionInfo: jest.fn().mockResolvedValue({
      tier: 'premium',
      character_count: 1000000,
      character_limit: 5000000,
    }),
    healthCheck: jest.fn().mockResolvedValue(true),
  } as any;
}

/**
 * Mock Opel API Adapter
 */
export function createMockOpelAPIAdapter(): jest.Mocked<OpelAPIAdapter> {
  return {
    getVehiclePricing: jest.fn().mockResolvedValue({
      vehicle_id: 'CORSA-ELECTRIC-2024',
      model_name: 'Corsa Electric',
      variant: 'Edition',
      price: 1250000,
      currency: 'TRY',
      in_stock: true,
      estimated_delivery: '15-30 gün',
      features: ['Otomatik Şanzıman', 'Elektrikli Motor'],
    }),
    checkVehicleStock: jest.fn().mockResolvedValue({
      vehicle_id: 'CORSA-ELECTRIC-2024',
      in_stock: true,
      quantity: 5,
      locations: ['İstanbul', 'Ankara'],
      estimated_delivery: '15-30 gün',
    }),
    searchVehicles: jest.fn().mockResolvedValue([
      {
        vehicle_id: 'CORSA-ELECTRIC-2024',
        model_name: 'Corsa Electric',
        price: 1250000,
        in_stock: true,
      },
    ]),
    createServiceAppointment: jest.fn().mockResolvedValue({
      appointment_id: 'OPL-APT-123',
      status: 'confirmed',
      appointment_date: '2024-01-15',
      appointment_time: '14:00',
      dealership: 'İstanbul Anadolu',
    }),
    createTestDriveAppointment: jest.fn().mockResolvedValue({
      appointment_id: 'OPL-TD-123',
      status: 'confirmed',
      appointment_date: '2024-01-15',
      appointment_time: '14:00',
      vehicle_model: 'Corsa Electric',
      dealership: 'İstanbul Anadolu',
    }),
    getDealerships: jest.fn().mockResolvedValue([
      {
        dealership_id: 'IST-001',
        name: 'İstanbul Anadolu',
        city: 'İstanbul',
        phone: '+902121234567',
        address: 'Ataşehir, İstanbul',
      },
    ]),
    healthCheck: jest.fn().mockResolvedValue(true),
  } as any;
}

/**
 * Mock OpenAI Client
 */
export function createMockOpenAIClient() {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4-turbo-preview',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Mock response from OpenAI',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
      },
    },
  };
}

/**
 * Mock Axios Instance
 */
export function createMockAxiosInstance() {
  return {
    get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    post: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    put: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    delete: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    patch: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    request: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    defaults: {
      headers: {
        common: {},
      },
    },
    interceptors: {
      request: {
        use: jest.fn(),
        eject: jest.fn(),
      },
      response: {
        use: jest.fn(),
        eject: jest.fn(),
      },
    },
  };
}

/**
 * Mock Bull Queue
 */
export function createMockBullQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    clean: jest.fn().mockResolvedValue(undefined),
    obliterate: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
  };
}

/**
 * Mock Circuit Breaker
 */
export function createMockCircuitBreaker() {
  return {
    execute: jest.fn().mockImplementation(async (fn: Function) => {
      return await fn();
    }),
    getState: jest.fn().mockReturnValue('CLOSED'),
    getStats: jest.fn().mockReturnValue({
      failures: 0,
      successes: 0,
      rejections: 0,
    }),
    reset: jest.fn(),
    on: jest.fn(),
  };
}

/**
 * Mock Logger
 */
export function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  };
}

/**
 * Mock EventEmitter
 */
export function createMockEventEmitter() {
  const listeners = new Map<string, Function[]>();

  return {
    on: jest.fn((event: string, listener: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(listener);
    }),
    emit: jest.fn((event: string, ...args: any[]) => {
      const eventListeners = listeners.get(event) || [];
      eventListeners.forEach((listener) => listener(...args));
      return eventListeners.length > 0;
    }),
    removeListener: jest.fn((event: string, listener: Function) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(listener);
        if (index !== -1) {
          eventListeners.splice(index, 1);
        }
      }
    }),
    removeAllListeners: jest.fn((event?: string) => {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    }),
    listenerCount: jest.fn((event: string) => {
      return (listeners.get(event) || []).length;
    }),
  };
}

/**
 * Reset all mocks
 */
export function resetAllMocks(): void {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.resetAllMocks();
}
