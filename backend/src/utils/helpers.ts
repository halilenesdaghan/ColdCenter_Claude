import { v4 as uuidv4 } from 'uuid';
import { format, parse, addMinutes, isWithinInterval, parseISO } from 'date-fns';
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
import crypto from 'crypto';
import { config } from '../config';

/**
 * Generate unique call ID
 */
export const generateCallId = (): string => {
  const date = format(new Date(), 'yyyyMMdd');
  const uuid = uuidv4().split('-')[0];
  return `CALL-${date}-${uuid}`;
};

/**
 * Generate unique appointment ID
 */
export const generateAppointmentId = (): string => {
  const date = format(new Date(), 'yyyyMMdd');
  const uuid = uuidv4().split('-')[0];
  return `APPT-${date}-${uuid}`;
};

/**
 * Generate unique task ID
 */
export const generateTaskId = (): string => {
  const date = format(new Date(), 'yyyyMMdd');
  const uuid = uuidv4().split('-')[0];
  return `TASK-${date}-${uuid}`;
};

/**
 * Generate confirmation code
 */
export const generateConfirmationCode = (prefix: string = 'TD'): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous characters
  let code = prefix + '-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Mask phone number for KVKK compliance
 */
export const maskPhoneNumber = (phone: string): string => {
  if (!config.kvkk.pii_masking_enabled) return phone;

  // Format: +90 5XX XXX XX**
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 11) return phone;

  return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)}**`;
};

/**
 * Mask chassis number
 */
export const maskChassisNumber = (chassis: string): string => {
  if (!config.kvkk.pii_masking_enabled) return chassis;

  // Format: W0L****JU******
  if (chassis.length < 5) return chassis;
  return chassis.slice(0, 3) + '****' + chassis.slice(-2);
};

/**
 * Mask customer name
 */
export const maskCustomerName = (name: string): string => {
  if (!config.kvkk.pii_masking_enabled) return name;

  const parts = name.trim().split(' ');
  if (parts.length === 0) return name;

  // Show first name + last initial
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

/**
 * Validate Turkish phone number
 */
export const isValidTurkishPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');

  // Check formats: +905XXXXXXXXX or 05XXXXXXXXX
  return /^(90)?5\d{9}$/.test(cleaned);
};

/**
 * Normalize Turkish phone number to E.164 format
 */
export const normalizePhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('90')) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('5')) {
    return `+90${cleaned}`;
  }
  if (cleaned.startsWith('0')) {
    return `+90${cleaned.slice(1)}`;
  }

  return phone;
};

/**
 * Check if current time is within business hours
 */
export const isBusinessHours = (timezone: string = config.business_hours.timezone): boolean => {
  try {
    const now = new Date();
    const zonedNow = utcToZonedTime(now, timezone);
    const dayOfWeek = zonedNow.getDay();

    // Check if today is a business day
    if (!config.business_hours.days.includes(dayOfWeek)) {
      return false;
    }

    const currentTime = format(zonedNow, 'HH:mm');
    const startTime = config.business_hours.start;
    const endTime = config.business_hours.end;

    return currentTime >= startTime && currentTime < endTime;
  } catch (error) {
    return false;
  }
};

/**
 * Encrypt sensitive data
 */
export const encrypt = (text: string): string => {
  if (!config.security.encryption_key) {
    throw new Error('Encryption key not configured');
  }

  const iv = crypto.randomBytes(16);
  const key = Buffer.from(config.security.encryption_key, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
};

/**
 * Decrypt sensitive data
 */
export const decrypt = (encryptedText: string): string => {
  if (!config.security.encryption_key) {
    throw new Error('Encryption key not configured');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const key = Buffer.from(config.security.encryption_key, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Generate SHA-256 hash
 */
export const sha256 = (text: string): string => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Sleep/delay utility
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry with exponential backoff
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000,
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
};

/**
 * Format duration in seconds to human-readable string
 */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
};

/**
 * Sanitize string for logging (remove sensitive data)
 */
export const sanitizeForLog = (obj: any): any => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sensitiveFields = ['password', 'api_key', 'secret', 'token', 'authorization'];
  const sanitized: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof obj[key] === 'object') {
      sanitized[key] = sanitizeForLog(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }

  return sanitized;
};

/**
 * Parse ISO date string to Date object
 */
export const parseISODate = (dateString: string): Date => {
  return parseISO(dateString);
};

/**
 * Format Date to ISO string
 */
export const toISODate = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

/**
 * Format Date to ISO time string
 */
export const toISOTime = (date: Date): string => {
  return format(date, 'HH:mm');
};
