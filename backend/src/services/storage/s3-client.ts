/**
 * S3 Client - AWS S3 operations wrapper
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';

/**
 * S3 Client Configuration
 */
const s3Config: any = {
  region: config.aws.region,
};

if (config.aws.access_key_id && config.aws.secret_access_key) {
  s3Config.credentials = {
    accessKeyId: config.aws.access_key_id,
    secretAccessKey: config.aws.secret_access_key,
  };
}

const s3Client = new S3Client(s3Config);

/**
 * S3 Service class
 */
export class S3Service {
  private bucketName: string;
  private useLocal: boolean;
  private localBasePath: string;

  constructor() {
    this.bucketName = config.s3.bucket_name;
    this.useLocal = config.env === 'development' && !!config.s3.local_base_path;
    this.localBasePath = config.s3.local_base_path || './data';
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    key: string,
    body: Buffer | Readable | string,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
      encryption?: boolean;
    },
  ): Promise<string> {
    try {
      if (this.useLocal) {
        return await this.uploadFileLocal(key, body);
      }

      let bodyData: Buffer | string;
      if (body instanceof Buffer || typeof body === 'string') {
        bodyData = body;
      } else {
        bodyData = await this.streamToBuffer(body as Readable);
      }

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: bodyData,
        ContentType: options?.contentType || 'application/octet-stream',
        Metadata: options?.metadata,
        ServerSideEncryption: options?.encryption !== false ? 'AES256' : undefined,
      });

      await s3Client.send(command);

      const url = this.useLocal
        ? `file://${path.join(this.localBasePath, key)}`
        : `s3://${this.bucketName}/${key}`;

      logger.info('File uploaded to S3', { key, url });
      return url;
    } catch (error) {
      logger.error('Failed to upload file to S3', { key, error });
      throw error;
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(key: string): Promise<Buffer> {
    try {
      if (this.useLocal) {
        return await this.downloadFileLocal(key);
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await s3Client.send(command);

      if (!response.Body) {
        throw new Error('Empty response body');
      }

      const buffer = await this.streamToBuffer(response.Body as Readable);

      logger.info('File downloaded from S3', { key, size: buffer.length });
      return buffer;
    } catch (error) {
      logger.error('Failed to download file from S3', { key, error });
      throw error;
    }
  }

  /**
   * Get signed URL for temporary access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      if (this.useLocal) {
        return `file://${path.join(this.localBasePath, key)}`;
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });

      logger.debug('Generated signed URL', { key, expiresIn });
      return url;
    } catch (error) {
      logger.error('Failed to generate signed URL', { key, error });
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      if (this.useLocal) {
        await this.deleteFileLocal(key);
        return;
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await s3Client.send(command);

      logger.info('File deleted from S3', { key });
    } catch (error) {
      logger.error('Failed to delete file from S3', { key, error });
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      if (this.useLocal) {
        return await this.fileExistsLocal(key);
      }

      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List files with prefix
   */
  async listFiles(prefix: string, maxKeys: number = 1000): Promise<string[]> {
    try {
      if (this.useLocal) {
        return await this.listFilesLocal(prefix);
      }

      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await s3Client.send(command);
      const keys = response.Contents?.map((obj) => obj.Key!) || [];

      logger.debug('Listed files from S3', { prefix, count: keys.length });
      return keys;
    } catch (error) {
      logger.error('Failed to list files from S3', { prefix, error });
      throw error;
    }
  }

  /**
   * Copy file within S3
   */
  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      if (this.useLocal) {
        await this.copyFileLocal(sourceKey, destinationKey);
        return;
      }

      const command = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
      });

      await s3Client.send(command);

      logger.info('File copied in S3', { sourceKey, destinationKey });
    } catch (error) {
      logger.error('Failed to copy file in S3', { sourceKey, destinationKey, error });
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  }> {
    try {
      if (this.useLocal) {
        return await this.getFileMetadataLocal(key);
      }

      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await s3Client.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType || 'application/octet-stream',
        metadata: response.Metadata || {},
      };
    } catch (error) {
      logger.error('Failed to get file metadata', { key, error });
      throw error;
    }
  }

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  // ============================================
  // Local file system operations (for development)
  // ============================================

  private async uploadFileLocal(key: string, body: Buffer | Readable | string): Promise<string> {
    const filePath = path.join(this.localBasePath, key);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Convert body to buffer if needed
    let buffer: Buffer;
    if (body instanceof Buffer) {
      buffer = body;
    } else if (typeof body === 'string') {
      buffer = Buffer.from(body);
    } else {
      buffer = await this.streamToBuffer(body as Readable);
    }

    await fs.writeFile(filePath, buffer);

    logger.debug('File saved locally', { filePath });
    return `file://${filePath}`;
  }

  private async downloadFileLocal(key: string): Promise<Buffer> {
    const filePath = path.join(this.localBasePath, key);
    const buffer = await fs.readFile(filePath);
    return buffer;
  }

  private async deleteFileLocal(key: string): Promise<void> {
    const filePath = path.join(this.localBasePath, key);
    await fs.unlink(filePath);
  }

  private async fileExistsLocal(key: string): Promise<boolean> {
    const filePath = path.join(this.localBasePath, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async listFilesLocal(prefix: string): Promise<string[]> {
    const dirPath = path.join(this.localBasePath, prefix);
    try {
      const files = await fs.readdir(dirPath, { recursive: true });
      return files.map((file) => path.join(prefix, file.toString()));
    } catch {
      return [];
    }
  }

  private async copyFileLocal(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = path.join(this.localBasePath, sourceKey);
    const destPath = path.join(this.localBasePath, destinationKey);
    const destDir = path.dirname(destPath);

    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourcePath, destPath);
  }

  private async getFileMetadataLocal(key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  }> {
    const filePath = path.join(this.localBasePath, key);
    const stats = await fs.stat(filePath);

    return {
      size: stats.size,
      lastModified: stats.mtime,
      contentType: 'application/octet-stream',
      metadata: {},
    };
  }
}

// Export singleton instance
export const s3Service = new S3Service();
