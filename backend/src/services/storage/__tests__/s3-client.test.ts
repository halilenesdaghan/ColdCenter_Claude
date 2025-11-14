/**
 * Unit Tests for S3 Client
 */

import { S3Service } from '../s3-client';
import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

// Mock config
jest.mock('../../../config', () => ({
  config: {
    aws: {
      region: 'eu-central-1',
      s3: {
        bucket: 'test-bucket',
      },
    },
    env: 'test',
  },
}));

// Mock fs for local mode
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('test data')),
  unlink: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 100 }),
  readdir: jest.fn().mockResolvedValue([]),
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
}));

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(() => {
    jest.clearAllMocks();
    s3Service = new S3Service();
  });

  describe('uploadFile', () => {
    it('should upload file to S3 (AWS mode)', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const key = await s3Service.uploadFile('test-key', Buffer.from('test data'));

      expect(key).toBe('test-key');
      expect(mockSend).toHaveBeenCalled();
    });

    it('should upload file to local filesystem (local mode)', async () => {
      const fs = require('fs/promises');

      const key = await s3Service.uploadFile('local-key', Buffer.from('test data'));

      expect(key).toBe('local-key');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle Buffer input', async () => {
      const buffer = Buffer.from('test data');
      const key = await s3Service.uploadFile('buffer-key', buffer);

      expect(key).toBe('buffer-key');
    });

    it('should handle string input', async () => {
      const key = await s3Service.uploadFile('string-key', 'test data');

      expect(key).toBe('string-key');
    });

    it('should handle Readable stream input', async () => {
      const stream = Readable.from(['test data']);
      const key = await s3Service.uploadFile('stream-key', stream);

      expect(key).toBe('stream-key');
    });

    it('should handle upload with metadata', async () => {
      const metadata = {
        'call-id': 'call-123',
        'customer-phone': '+905551234567',
      };

      const key = await s3Service.uploadFile('meta-key', Buffer.from('test'), {
        metadata,
      });

      expect(key).toBe('meta-key');
    });

    it('should handle upload with encryption', async () => {
      const key = await s3Service.uploadFile('encrypted-key', Buffer.from('test'), {
        encryption: true,
      });

      expect(key).toBe('encrypted-key');
    });

    it('should handle upload errors gracefully', async () => {
      const fs = require('fs/promises');
      fs.writeFile.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(
        s3Service.uploadFile('error-key', Buffer.from('test'))
      ).rejects.toThrow('Upload failed');
    });
  });

  describe('downloadFile', () => {
    it('should download file from S3 (AWS mode)', async () => {
      const mockData = Buffer.from('downloaded data');
      const mockStream = Readable.from([mockData]);

      const mockSend = jest.fn().mockResolvedValue({
        Body: mockStream,
      });

      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const data = await s3Service.downloadFile('test-key');

      expect(data).toBeInstanceOf(Buffer);
    });

    it('should download file from local filesystem (local mode)', async () => {
      const fs = require('fs/promises');

      const data = await s3Service.downloadFile('local-key');

      expect(data).toBeInstanceOf(Buffer);
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle download errors', async () => {
      const fs = require('fs/promises');
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));

      await expect(s3Service.downloadFile('missing-key')).rejects.toThrow('File not found');
    });
  });

  describe('getSignedUrl', () => {
    it('should generate signed URL for S3 (AWS mode)', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValue('https://signed-url.com');

      const mockSend = jest.fn();
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const url = await s3Service.getSignedUrl('test-key', 3600);

      expect(url).toBe('https://signed-url.com');
    });

    it('should generate file:// URL for local mode', async () => {
      const url = await s3Service.getSignedUrl('local-key', 3600);

      expect(url).toMatch(/^file:\/\//);
    });

    it('should respect expiration time', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValue('https://signed-url.com');

      const mockSend = jest.fn();
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      await s3Service.getSignedUrl('test-key', 7200);

      expect(getSignedUrl).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file from S3 (AWS mode)', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      await s3Service.deleteFile('test-key');

      expect(mockSend).toHaveBeenCalled();
    });

    it('should delete file from local filesystem (local mode)', async () => {
      const fs = require('fs/promises');

      await s3Service.deleteFile('local-key');

      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      const fs = require('fs/promises');
      fs.unlink.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(s3Service.deleteFile('error-key')).rejects.toThrow('Delete failed');
    });
  });

  describe('fileExists', () => {
    it('should check if file exists in S3 (AWS mode)', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const exists = await s3Service.fileExists('test-key');

      expect(exists).toBe(true);
    });

    it('should return false if file does not exist (AWS mode)', async () => {
      const mockSend = jest.fn().mockRejectedValue({ name: 'NotFound' });
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const exists = await s3Service.fileExists('missing-key');

      expect(exists).toBe(false);
    });

    it('should check if file exists locally (local mode)', async () => {
      const fs = require('fs/promises');

      const exists = await s3Service.fileExists('local-key');

      expect(exists).toBe(true);
      expect(fs.access).toHaveBeenCalled();
    });

    it('should return false if local file does not exist', async () => {
      const fs = require('fs/promises');
      fs.access.mockRejectedValueOnce(new Error('ENOENT'));

      const exists = await s3Service.fileExists('missing-local-key');

      expect(exists).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('should list files in S3 (AWS mode)', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Contents: [
          { Key: 'file1.txt' },
          { Key: 'file2.txt' },
        ],
      });

      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const files = await s3Service.listFiles('prefix/');

      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('should list files locally (local mode)', async () => {
      const fs = require('fs/promises');
      fs.readdir.mockResolvedValueOnce(['file1.txt', 'file2.txt']);

      const files = await s3Service.listFiles('prefix/');

      expect(files).toHaveLength(2);
      expect(fs.readdir).toHaveBeenCalled();
    });

    it('should handle empty directories', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Contents: [] });
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const files = await s3Service.listFiles('empty/');

      expect(files).toHaveLength(0);
    });
  });

  describe('copyFile', () => {
    it('should copy file in S3 (AWS mode)', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      await s3Service.copyFile('source-key', 'dest-key');

      expect(mockSend).toHaveBeenCalled();
    });

    it('should copy file locally (local mode)', async () => {
      const fs = require('fs/promises');

      await s3Service.copyFile('source-key', 'dest-key');

      expect(fs.copyFile).toHaveBeenCalled();
    });

    it('should handle copy errors', async () => {
      const fs = require('fs/promises');
      fs.copyFile.mockRejectedValueOnce(new Error('Copy failed'));

      await expect(
        s3Service.copyFile('source-key', 'dest-key')
      ).rejects.toThrow('Copy failed');
    });
  });

  describe('getFileMetadata', () => {
    it('should get file metadata from S3 (AWS mode)', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        ContentLength: 1024,
        ContentType: 'audio/mpeg',
        LastModified: new Date('2024-01-01'),
      });

      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();
      const metadata = await s3Service.getFileMetadata('test-key');

      expect(metadata.size).toBe(1024);
      expect(metadata.contentType).toBe('audio/mpeg');
      expect(metadata.lastModified).toBeInstanceOf(Date);
    });

    it('should get file metadata locally (local mode)', async () => {
      const fs = require('fs/promises');

      const metadata = await s3Service.getFileMetadata('local-key');

      expect(metadata.size).toBe(100);
      expect(fs.stat).toHaveBeenCalled();
    });

    it('should handle missing files', async () => {
      const mockSend = jest.fn().mockRejectedValue({ name: 'NotFound' });
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      s3Service = new S3Service();

      await expect(s3Service.getFileMetadata('missing-key')).rejects.toThrow();
    });
  });
});
