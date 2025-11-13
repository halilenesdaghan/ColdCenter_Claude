import dotenv from 'dotenv';
import { AppConfig } from '../types';

// Load environment variables
dotenv.config();

/**
 * Parse boolean environment variable
 */
const parseBoolean = (value: string | undefined, defaultValue: boolean = false): boolean => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

/**
 * Parse number array from comma-separated string
 */
const parseNumberArray = (value: string | undefined, defaultValue: number[] = []): number[] => {
  if (!value) return defaultValue;
  return value.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v));
};

/**
 * Application configuration
 */
export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  log_level: process.env.LOG_LEVEL || 'info',

  openai: {
    api_key: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-realtime-preview',
    organization_id: process.env.OPENAI_ORGANIZATION_ID,
  },

  elevenlabs: {
    api_key: process.env.ELEVENLABS_API_KEY || '',
    voice_id: process.env.ELEVENLABS_VOICE_ID || '',
    model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
  },

  aws: {
    region: process.env.AWS_REGION || 'eu-central-1',
    access_key_id: process.env.AWS_ACCESS_KEY_ID,
    secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
  },

  dynamodb: {
    endpoint: process.env.DYNAMODB_ENDPOINT,
    table_prefix: process.env.DYNAMODB_TABLE_PREFIX || 'coldcenter_',
  },

  s3: {
    bucket_name: process.env.S3_BUCKET_NAME || 'coldcenter-dev',
    local_base_path: process.env.LOCAL_S3_BASE_PATH || './data',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  google_calendar: {
    calendar_id: process.env.GOOGLE_CALENDAR_ID || '',
    service_account_key_path: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './secrets/google-service-account.json',
  },

  opel_api: {
    use_mock: parseBoolean(process.env.USE_MOCK_OPEL_API, true),
    url: process.env.OPEL_API_URL || 'http://localhost:3001',
    api_key: process.env.OPEL_API_KEY,
    api_secret: process.env.OPEL_API_SECRET,
  },

  voip: {
    provider: process.env.VOIP_PROVIDER || 'turkcell',
    sip_uri: process.env.VOIP_SIP_URI,
    username: process.env.VOIP_USERNAME,
    password: process.env.VOIP_PASSWORD,
  },

  security: {
    encryption_key: process.env.ENCRYPTION_KEY || '',
    jwt_secret: process.env.JWT_SECRET || 'dev_jwt_secret',
  },

  features: {
    call_recording: parseBoolean(process.env.ENABLE_CALL_RECORDING, true),
    transcript_storage: parseBoolean(process.env.ENABLE_TRANSCRIPT_STORAGE, true),
    sentiment_analysis: parseBoolean(process.env.ENABLE_SENTIMENT_ANALYSIS, true),
    outbound_calls: parseBoolean(process.env.ENABLE_OUTBOUND_CALLS, true),
  },

  business_hours: {
    start: process.env.BUSINESS_HOURS_START || '09:00',
    end: process.env.BUSINESS_HOURS_END || '18:00',
    days: parseNumberArray(process.env.BUSINESS_DAYS, [1, 2, 3, 4, 5, 6]),
    timezone: process.env.TIMEZONE || 'Europe/Istanbul',
  },

  rate_limiting: {
    window_ms: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max_requests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  kvkk: {
    data_retention_days: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
    pii_masking_enabled: parseBoolean(process.env.PII_MASKING_ENABLED, true),
    audit_log_enabled: parseBoolean(process.env.AUDIT_LOG_ENABLED, true),
  },
};

/**
 * Validate required configuration
 */
export const validateConfig = (): void => {
  const errors: string[] = [];

  // Check required OpenAI config
  if (!config.openai.api_key && config.env !== 'test') {
    errors.push('OPENAI_API_KEY is required');
  }

  // Check required ElevenLabs config
  if (!config.elevenlabs.api_key && config.env !== 'test') {
    errors.push('ELEVENLABS_API_KEY is required');
  }

  // Check encryption key in production
  if (config.env === 'production' && !config.security.encryption_key) {
    errors.push('ENCRYPTION_KEY is required in production');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
};

/**
 * Is production environment
 */
export const isProduction = (): boolean => config.env === 'production';

/**
 * Is development environment
 */
export const isDevelopment = (): boolean => config.env === 'development';

/**
 * Is test environment
 */
export const isTest = (): boolean => config.env === 'test';
