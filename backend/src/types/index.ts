// ============================================
// ColdCenter V1.0 - Core Type Definitions
// ============================================

/**
 * Call-related types
 */
export enum CallDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum CallStatus {
  IDLE = 'idle',
  RINGING = 'ringing',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TRANSFERRED = 'transferred',
}

export enum CallState {
  IDLE = 'idle',
  GREETING = 'greeting',
  AUTHENTICATE = 'authenticate',
  INTENT_DETECT = 'intent_detect',
  SLOT_FILL = 'slot_fill',
  EXECUTING = 'executing',
  CLARIFY = 'clarify',
  RESPOND = 'respond',
  FOLLOW_UP = 'follow_up',
  CLOSING = 'closing',
  TRANSFER = 'transfer',
  ENDED = 'ended',
}

export interface CallSession {
  call_id: string;
  customer_phone: string;
  customer_name?: string;
  customer_id?: string;
  direction: CallDirection;
  status: CallStatus;
  state: CallState;
  intent?: Intent;
  slots?: Record<string, any>;
  escalated: boolean;
  transfer_reason?: string;
  agent_id?: string;
  duration_seconds?: number;
  created_at: number;
  ended_at?: number;
  recording_url?: string;
  transcript_url?: string;
  summary?: string;
  metadata?: Record<string, any>;
}

/**
 * Intent & Conversation types
 */
export enum Intent {
  VEHICLE_PRICE_INQUIRY = 'vehicle_price_inquiry',
  VEHICLE_STOCK_CHECK = 'vehicle_stock_check',
  TEST_DRIVE_BOOKING = 'test_drive_booking',
  SERVICE_APPOINTMENT = 'service_appointment',
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
  ESCALATION = 'escalation',
  OUT_OF_SCOPE = 'out_of_scope',
}

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  slots?: Record<string, any>;
  alternative_intents?: Array<{
    intent: Intent;
    confidence: number;
  }>;
}

export enum Speaker {
  CUSTOMER = 'customer',
  AI = 'ai',
  AGENT = 'agent',
}

export enum Sentiment {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

export interface ConversationTurn {
  call_id: string;
  sequence: number;
  speaker: Speaker;
  text: string;
  timestamp: number;
  confidence?: number;
  language: string;
  sentiment?: Sentiment;
  intent?: Intent;
}

/**
 * Appointment types
 */
export enum AppointmentType {
  TEST_DRIVE = 'test_drive',
  SERVICE = 'service',
}

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export interface Appointment {
  appointment_id: string;
  call_id: string;
  customer_phone: string;
  customer_name: string;
  customer_email?: string;
  type: AppointmentType;
  status: AppointmentStatus;

  // Test Drive specific
  vehicle_model?: string;
  dealer_id?: string;

  // Service specific
  vehicle_plate?: string;
  chassis_number?: string;
  service_type?: string;
  service_description?: string;

  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  confirmation_code: string;

  calendar_event_id?: string;
  reminder_sent: boolean;
  confirmation_call_completed: boolean;

  created_at: number;
  updated_at: number;
  completed_at?: number;
}

/**
 * Follow-up task types
 */
export enum TaskType {
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  CALLBACK = 'callback',
  SURVEY = 'survey',
  DAILY_SUMMARY = 'daily_summary',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface FollowUpTask {
  task_id: string;
  task_type: TaskType;
  status: TaskStatus;
  priority: number;

  related_call_id?: string;
  related_appointment_id?: string;
  customer_phone: string;
  customer_name: string;

  scheduled_at: number;
  attempt_count: number;
  max_attempts: number;
  last_attempt_at?: number;

  task_data: Record<string, any>;

  created_at: number;
  updated_at: number;
  completed_at?: number;
}

/**
 * Customer types
 */
export interface Customer {
  customer_id: string;
  customer_phone: string;
  customer_name: string;
  customer_email?: string;

  preferred_language: string;
  preferred_contact_method: 'phone' | 'sms' | 'email';
  is_vip: boolean;

  total_calls: number;
  total_appointments: number;
  last_call_date?: number;
  last_appointment_date?: number;

  owned_vehicles?: Array<{
    plate: string;
    model: string;
    year: number;
    chassis_number: string;
  }>;

  crm_customer_id?: string;
  crm_sync_at?: number;

  created_at: number;
  updated_at: number;
}

/**
 * Speech & Audio types
 */
export interface Transcript {
  text: string;
  confidence: number;
  words?: Array<{
    word: string;
    start_time: number;
    end_time: number;
    confidence: number;
  }>;
  language: string;
  is_final: boolean;
}

export interface AudioStream {
  format: 'pcm' | 'mp3' | 'wav' | 'opus';
  sample_rate: number;
  channels: number;
  buffer: Buffer;
}

/**
 * CRM/Opel API types
 */
export interface VehicleModel {
  model: string;
  trim_levels: TrimLevel[];
}

export interface TrimLevel {
  name: string;
  base_price: number;
  currency: string;
  available_colors: string[];
  features?: string[];
}

export interface StockAvailability {
  available: boolean;
  quantity: number;
  delivery_estimate_days: number;
  dealer_locations: Array<{
    id: string;
    name: string;
    address?: string;
  }>;
}

export interface AppointmentRequest {
  type: AppointmentType;
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  vehicle_model?: string;
  preferred_datetime: string;
  dealer_id: string;
}

export interface AppointmentResponse {
  appointment_id: string;
  status: string;
  confirmation_code: string;
}

/**
 * Workflow & Queue types
 */
export interface QueueJob<T = any> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  timestamp: number;
}

/**
 * Configuration types
 */
export interface AppConfig {
  env: string;
  port: number;
  log_level: string;

  openai: {
    api_key: string;
    model: string;
    organization_id?: string;
  };

  elevenlabs: {
    api_key: string;
    voice_id: string;
    model_id: string;
  };

  aws: {
    region: string;
    access_key_id?: string;
    secret_access_key?: string;
  };

  dynamodb: {
    endpoint?: string;
    table_prefix: string;
  };

  s3: {
    bucket_name: string;
    local_base_path?: string;
  };

  redis: {
    host: string;
    port: number;
    password?: string;
  };

  google_calendar: {
    calendar_id: string;
    service_account_key_path: string;
  };

  opel_api: {
    use_mock: boolean;
    url: string;
    api_key?: string;
    api_secret?: string;
  };

  voip: {
    provider: string;
    sip_uri?: string;
    username?: string;
    password?: string;
  };

  security: {
    encryption_key: string;
    jwt_secret: string;
  };

  features: {
    call_recording: boolean;
    transcript_storage: boolean;
    sentiment_analysis: boolean;
    outbound_calls: boolean;
  };

  business_hours: {
    start: string;
    end: string;
    days: number[];
    timezone: string;
  };

  rate_limiting: {
    window_ms: number;
    max_requests: number;
  };

  kvkk: {
    data_retention_days: number;
    pii_masking_enabled: boolean;
    audit_log_enabled: boolean;
  };
}

/**
 * API Response types
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: number;
    request_id: string;
  };
}

/**
 * Error types
 */
export enum ErrorCode {
  // System errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // Business logic errors
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
  APPOINTMENT_NOT_AVAILABLE = 'APPOINTMENT_NOT_AVAILABLE',
  VEHICLE_NOT_FOUND = 'VEHICLE_NOT_FOUND',
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',

  // External API errors
  OPENAI_API_ERROR = 'OPENAI_API_ERROR',
  ELEVENLABS_API_ERROR = 'ELEVENLABS_API_ERROR',
  OPEL_API_ERROR = 'OPEL_API_ERROR',
  GOOGLE_CALENDAR_ERROR = 'GOOGLE_CALENDAR_ERROR',

  // Call handling errors
  CALL_NOT_FOUND = 'CALL_NOT_FOUND',
  CALL_ALREADY_ENDED = 'CALL_ALREADY_ENDED',
  TRANSFER_FAILED = 'TRANSFER_FAILED',
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public details?: any,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Metrics types
 */
export interface CallMetrics {
  total_calls: number;
  active_calls: number;
  completed_calls: number;
  failed_calls: number;
  transferred_calls: number;
  average_duration_seconds: number;
  automation_rate: number;
  escalation_rate: number;
}

export interface IntentMetrics {
  intent: Intent;
  count: number;
  success_rate: number;
  average_confidence: number;
}

export interface PerformanceMetrics {
  tts_latency_ms: number;
  stt_latency_ms: number;
  intent_detection_latency_ms: number;
  api_latency_ms: number;
  total_round_trip_ms: number;
}
