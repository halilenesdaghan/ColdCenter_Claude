import { v4 as uuidv4 } from 'uuid';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
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
 * Check if given date/time is within business hours
 */
export const isBusinessHours = (date?: Date | string, timezone: string = 'Europe/Istanbul'): boolean => {
  try {
    const checkDate = date ? (typeof date === 'string' ? new Date(date) : date) : new Date();
    const zonedDate = toZonedTime(checkDate, timezone);
    const dayOfWeek = zonedDate.getDay();

    // Monday = 1, Friday = 5
    const businessDays = [1, 2, 3, 4, 5]; // Monday to Friday
    if (!businessDays.includes(dayOfWeek)) {
      return false;
    }

    const hours = zonedDate.getHours();
    const minutes = zonedDate.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    // Business hours: 9:00 - 18:00
    const startMinutes = 9 * 60; // 9:00
    const endMinutes = 18 * 60; // 18:00

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
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

/**
 * Format phone number (alias for normalizePhoneNumber)
 */
export const formatPhoneNumber = normalizePhoneNumber;

/**
 * Validate phone number (alias for isValidTurkishPhone)
 */
export const validatePhoneNumber = isValidTurkishPhone;

/**
 * Generate customer ID from phone number
 */
export const generateCustomerId = (phone: string): string => {
  const normalized = normalizePhoneNumber(phone);
  return `cust-${sha256(normalized)}`;
};

/**
 * Sanitize user input
 */
export const sanitizeUserInput = (input: string, maxLength?: number): string => {
  if (!input) return '';

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length if specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
};

/**
 * Extract slot value from text
 */
export const extractSlotValue = (text: string, slotName: string, slots: Record<string, any>): void => {
  // Simple slot extraction - can be enhanced with NLP
  const lowerText = text.toLowerCase();

  if (slotName === 'vehicle_model') {
    const models = ['corsa', 'astra', 'grandland', 'mokka', 'combo', 'vivaro'];
    for (const model of models) {
      if (lowerText.includes(model)) {
        slots[slotName] = model.charAt(0).toUpperCase() + model.slice(1);
        return;
      }
    }
  }

  if (slotName === 'date') {
    // Extract date patterns
    const datePatterns = [
      /(\d{1,2})\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i,
      /yarın/i,
      /bugün/i,
    ];

    for (const pattern of datePatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        slots[slotName] = match[0];
        return;
      }
    }
  }

  if (slotName === 'time') {
    // Extract time patterns
    const timePattern = /(\d{1,2}):(\d{2})|(\d{1,2})\s*saat/i;
    const match = lowerText.match(timePattern);
    if (match) {
      slots[slotName] = match[0];
    }
  }
};

/**
 * Calculate call duration in seconds
 */
export const calculateCallDuration = (startTime: number, endTime: number): number => {
  const duration = Math.floor((endTime - startTime) / 1000);
  return duration > 0 ? duration : 0;
};

/**
 * Format currency
 */
export const formatCurrency = (amount: number, currency: string = 'TRY'): string => {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('tr-TR');

  switch (currency) {
    case 'TRY':
      return `${formatted} ₺`;
    case 'USD':
      return `$${formatted}`;
    case 'EUR':
      return `€${formatted}`;
    default:
      return `${formatted} ${currency}`;
  }
};

/**
 * Normalize intent name
 */
export const normalizeIntent = (intent: string): string => {
  return intent
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');
};

/**
 * Mask PII (Personally Identifiable Information)
 */
export const maskPII = (text: string): string => {
  let masked = text;

  // Mask phone numbers
  masked = masked.replace(/(\+90|0)?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/g, '***');

  // Mask email addresses
  masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***');

  // Mask TC identity numbers (11 digits)
  masked = masked.replace(/\b\d{11}\b/g, '***');

  return masked;
};

/**
 * Parse appointment date and time from text
 */
export const parseAppointmentDateTime = (text: string): { date?: string; time?: string } => {
  const result: { date?: string; time?: string } = {};

  // Parse time (HH:MM format)
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hours = timeMatch[1].padStart(2, '0');
    const minutes = timeMatch[2].padStart(2, '0');
    result.time = `${hours}:${minutes}`;
  }

  // Parse date patterns
  const dateMatch = text.match(/(\d{1,2})\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s*(\d{4})?/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const monthNames = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
    const month = monthNames.indexOf(dateMatch[2].toLowerCase()) + 1;
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();

    result.date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  // Handle "yarın" (tomorrow)
  if (text.toLowerCase().includes('yarın')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    result.date = toISODate(tomorrow);
  }

  return result;
};

/**
 * Generate random string
 */
export const generateRandomString = (length: number): string => {
  if (length === 0) return '';

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};
