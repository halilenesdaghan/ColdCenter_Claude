/**
 * Unit Tests for Helper Utilities
 */

import {
  sleep,
  formatPhoneNumber,
  validatePhoneNumber,
  generateCallId,
  generateCustomerId,
  sanitizeUserInput,
  extractSlotValue,
  calculateCallDuration,
  formatCurrency,
  normalizeIntent,
  maskPII,
  parseAppointmentDateTime,
  isBusinessHours,
  sha256,
  generateRandomString,
} from '../helpers';

describe('Helper Utilities', () => {
  describe('sleep', () => {
    it('should wait for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(95); // Allow 5ms tolerance
      expect(duration).toBeLessThan(150);
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await sleep(0);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format Turkish phone numbers correctly', () => {
      expect(formatPhoneNumber('05551234567')).toBe('+905551234567');
      expect(formatPhoneNumber('905551234567')).toBe('+905551234567');
      expect(formatPhoneNumber('+905551234567')).toBe('+905551234567');
    });

    it('should handle different input formats', () => {
      expect(formatPhoneNumber('0555 123 45 67')).toBe('+905551234567');
      expect(formatPhoneNumber('0555-123-45-67')).toBe('+905551234567');
      expect(formatPhoneNumber('(0555) 123 45 67')).toBe('+905551234567');
    });

    it('should preserve international format', () => {
      expect(formatPhoneNumber('+442071234567')).toBe('+442071234567');
      expect(formatPhoneNumber('+12125551234')).toBe('+12125551234');
    });
  });

  describe('validatePhoneNumber', () => {
    it('should validate Turkish phone numbers', () => {
      expect(validatePhoneNumber('+905551234567')).toBe(true);
      expect(validatePhoneNumber('905551234567')).toBe(true);
      expect(validatePhoneNumber('05551234567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhoneNumber('123')).toBe(false);
      expect(validatePhoneNumber('invalid')).toBe(false);
      expect(validatePhoneNumber('')).toBe(false);
      expect(validatePhoneNumber('0555')).toBe(false);
    });

    it('should validate international numbers', () => {
      expect(validatePhoneNumber('+442071234567')).toBe(true);
      expect(validatePhoneNumber('+12125551234')).toBe(true);
    });
  });

  describe('generateCallId', () => {
    it('should generate unique call IDs', () => {
      const id1 = generateCallId();
      const id2 = generateCallId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^call-\d+-[a-z0-9]+$/);
    });

    it('should generate IDs with correct prefix', () => {
      const id = generateCallId();
      expect(id).toMatch(/^call-/);
    });

    it('should generate IDs of reasonable length', () => {
      const id = generateCallId();
      expect(id.length).toBeGreaterThan(15);
      expect(id.length).toBeLessThan(50);
    });
  });

  describe('generateCustomerId', () => {
    it('should generate customer ID from phone', () => {
      const id = generateCustomerId('+905551234567');
      expect(id).toBe('cust-3e8c8f8e5a31b5f6f32d8c8f8e5a31b5f6f32d8c8f8e5a31b5f6f32d8c8f8e5a');
    });

    it('should generate same ID for same phone', () => {
      const phone = '+905551234567';
      const id1 = generateCustomerId(phone);
      const id2 = generateCustomerId(phone);

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different phones', () => {
      const id1 = generateCustomerId('+905551234567');
      const id2 = generateCustomerId('+905559876543');

      expect(id1).not.toBe(id2);
    });
  });

  describe('sanitizeUserInput', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeUserInput('<script>alert("xss")</script>')).toBe('');
      expect(sanitizeUserInput('Hello <b>world</b>')).toBe('Hello world');
    });

    it('should trim whitespace', () => {
      expect(sanitizeUserInput('  Hello  ')).toBe('Hello');
      expect(sanitizeUserInput('\n\tHello\n\t')).toBe('Hello');
    });

    it('should handle empty strings', () => {
      expect(sanitizeUserInput('')).toBe('');
      expect(sanitizeUserInput('   ')).toBe('');
    });

    it('should preserve Turkish characters', () => {
      expect(sanitizeUserInput('Merhaba dünya şçğüöıİ')).toBe('Merhaba dünya şçğüöıİ');
    });

    it('should limit length if specified', () => {
      const longText = 'a'.repeat(1000);
      expect(sanitizeUserInput(longText, 100)).toHaveLength(100);
    });
  });

  describe('extractSlotValue', () => {
    it('should extract vehicle model from text', () => {
      const slots = {};
      extractSlotValue('Corsa Electric fiyatı nedir?', 'vehicle_model', slots);
      expect(slots).toHaveProperty('vehicle_model');
    });

    it('should extract dates', () => {
      const slots = {};
      extractSlotValue('15 Ocak tarihine randevu almak istiyorum', 'date', slots);
      expect(slots).toHaveProperty('date');
    });

    it('should extract times', () => {
      const slots = {};
      extractSlotValue('Saat 14:00 için randevu', 'time', slots);
      expect(slots).toHaveProperty('time');
    });

    it('should not extract if pattern not found', () => {
      const slots = {};
      extractSlotValue('Merhaba', 'vehicle_model', slots);
      expect(slots).not.toHaveProperty('vehicle_model');
    });
  });

  describe('calculateCallDuration', () => {
    it('should calculate duration in seconds', () => {
      const start = Date.now();
      const end = start + 5000; // 5 seconds later

      expect(calculateCallDuration(start, end)).toBe(5);
    });

    it('should handle millisecond precision', () => {
      const start = Date.now();
      const end = start + 1500; // 1.5 seconds

      expect(calculateCallDuration(start, end)).toBe(1);
    });

    it('should handle same timestamps', () => {
      const timestamp = Date.now();
      expect(calculateCallDuration(timestamp, timestamp)).toBe(0);
    });

    it('should handle negative duration gracefully', () => {
      const end = Date.now();
      const start = end + 1000;

      expect(calculateCallDuration(start, end)).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('should format Turkish Lira correctly', () => {
      expect(formatCurrency(1250000, 'TRY')).toBe('1.250.000 ₺');
      expect(formatCurrency(999.99, 'TRY')).toBe('1.000 ₺');
    });

    it('should format USD correctly', () => {
      expect(formatCurrency(50000, 'USD')).toBe('$50.000');
    });

    it('should format EUR correctly', () => {
      expect(formatCurrency(45000, 'EUR')).toBe('€45.000');
    });

    it('should handle zero amounts', () => {
      expect(formatCurrency(0, 'TRY')).toBe('0 ₺');
    });

    it('should handle large amounts', () => {
      expect(formatCurrency(10000000, 'TRY')).toBe('10.000.000 ₺');
    });
  });

  describe('normalizeIntent', () => {
    it('should normalize intent names', () => {
      expect(normalizeIntent('vehicle_price_inquiry')).toBe('vehicle_price_inquiry');
      expect(normalizeIntent('VEHICLE_PRICE_INQUIRY')).toBe('vehicle_price_inquiry');
      expect(normalizeIntent('Vehicle Price Inquiry')).toBe('vehicle_price_inquiry');
    });

    it('should handle Turkish characters', () => {
      expect(normalizeIntent('randevu_teyit')).toBe('randevu_teyit');
    });

    it('should handle special characters', () => {
      expect(normalizeIntent('test-drive-booking')).toBe('test_drive_booking');
      expect(normalizeIntent('test drive booking')).toBe('test_drive_booking');
    });
  });

  describe('maskPII', () => {
    it('should mask phone numbers', () => {
      const text = 'Telefon numaram +905551234567';
      const masked = maskPII(text);

      expect(masked).not.toContain('+905551234567');
      expect(masked).toContain('***');
    });

    it('should mask email addresses', () => {
      const text = 'Email: test@example.com';
      const masked = maskPII(text);

      expect(masked).not.toContain('test@example.com');
      expect(masked).toContain('***');
    });

    it('should mask TC identity numbers', () => {
      const text = 'TC: 12345678901';
      const masked = maskPII(text);

      expect(masked).not.toContain('12345678901');
      expect(masked).toContain('***');
    });

    it('should preserve non-PII content', () => {
      const text = 'Merhaba, Corsa Electric fiyatını öğrenmek istiyorum';
      const masked = maskPII(text);

      expect(masked).toBe(text);
    });
  });

  describe('parseAppointmentDateTime', () => {
    it('should parse date and time together', () => {
      const result = parseAppointmentDateTime('15 Ocak 2024 14:00');

      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('time');
      expect(result.date).toMatch(/2024-01-15/);
      expect(result.time).toBe('14:00');
    });

    it('should parse date only', () => {
      const result = parseAppointmentDateTime('15 Ocak 2024');

      expect(result).toHaveProperty('date');
      expect(result.date).toMatch(/2024-01-15/);
    });

    it('should parse relative dates', () => {
      const result = parseAppointmentDateTime('yarın');

      expect(result).toHaveProperty('date');
      expect(result.date).toBeTruthy();
    });

    it('should handle invalid input', () => {
      const result = parseAppointmentDateTime('invalid date');

      expect(result).toEqual({});
    });
  });

  describe('isBusinessHours', () => {
    it('should return true during business hours', () => {
      // Monday 10:00 AM
      const date = new Date('2024-01-15T10:00:00');
      expect(isBusinessHours(date)).toBe(true);
    });

    it('should return false outside business hours', () => {
      // Monday 8:00 PM
      const date = new Date('2024-01-15T20:00:00');
      expect(isBusinessHours(date)).toBe(false);
    });

    it('should return false on weekends', () => {
      // Saturday 10:00 AM
      const date = new Date('2024-01-13T10:00:00');
      expect(isBusinessHours(date)).toBe(false);
    });

    it('should handle edge cases', () => {
      // Monday 9:00 AM (start of business hours)
      const start = new Date('2024-01-15T09:00:00');
      expect(isBusinessHours(start)).toBe(true);

      // Monday 6:00 PM (end of business hours)
      const end = new Date('2024-01-15T18:00:00');
      expect(isBusinessHours(end)).toBe(true);
    });
  });

  describe('sha256', () => {
    it('should generate consistent hashes', () => {
      const input = 'test input';
      const hash1 = sha256(input);
      const hash2 = sha256(input);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = sha256('input 1');
      const hash2 = sha256('input 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate 64-character hex string', () => {
      const hash = sha256('test');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty strings', () => {
      const hash = sha256('');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle Turkish characters', () => {
      const hash = sha256('Merhaba dünya şçğüöı');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateRandomString', () => {
    it('should generate string of specified length', () => {
      expect(generateRandomString(10)).toHaveLength(10);
      expect(generateRandomString(32)).toHaveLength(32);
    });

    it('should generate unique strings', () => {
      const str1 = generateRandomString(16);
      const str2 = generateRandomString(16);

      expect(str1).not.toBe(str2);
    });

    it('should contain only alphanumeric characters', () => {
      const str = generateRandomString(100);
      expect(str).toMatch(/^[a-z0-9]+$/);
    });

    it('should handle zero length', () => {
      expect(generateRandomString(0)).toBe('');
    });

    it('should handle large lengths', () => {
      const str = generateRandomString(1000);
      expect(str).toHaveLength(1000);
    });
  });
});
