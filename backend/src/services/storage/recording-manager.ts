/**
 * Recording Manager - Manages call audio recordings
 */

import { s3Service } from './s3-client';
import { logger } from '../../utils/logger';
import { format } from 'date-fns';
import { sha256 } from '../../utils/helpers';

export interface RecordingMetadata {
  call_id: string;
  format: 'wav' | 'mp3' | 'opus';
  codec: string;
  sample_rate: number;
  channels: number;
  duration_seconds: number;
  file_size_bytes: number;
  recorded_at: string;
  checksum_sha256: string;
  encryption: string;
}

/**
 * Recording Manager class
 */
export class RecordingManager {
  /**
   * Save call recording
   */
  async saveRecording(
    call_id: string,
    audioBuffer: Buffer,
    metadata: Omit<RecordingMetadata, 'call_id' | 'file_size_bytes' | 'checksum_sha256' | 'recorded_at'>,
  ): Promise<string> {
    try {
      const timestamp = new Date();
      const dateStr = format(timestamp, 'yyyy/MM/dd');
      const extension = metadata.format;

      // Generate S3 key
      const recordingKey = `call-recordings/${dateStr}/${call_id}.${extension}`;
      const metadataKey = `call-recordings/${dateStr}/${call_id}.meta.json`;

      // Calculate checksum
      const checksum = sha256(audioBuffer.toString('base64'));

      // Complete metadata
      const completeMetadata: RecordingMetadata = {
        call_id,
        ...metadata,
        file_size_bytes: audioBuffer.length,
        recorded_at: timestamp.toISOString(),
        checksum_sha256: checksum,
        encryption: 'AES256',
      };

      // Upload recording
      const recordingUrl = await s3Service.uploadFile(recordingKey, audioBuffer, {
        contentType: this.getContentType(metadata.format),
        metadata: {
          call_id,
          format: metadata.format,
          duration: metadata.duration_seconds.toString(),
        },
        encryption: true,
      });

      // Upload metadata
      await s3Service.uploadFile(
        metadataKey,
        JSON.stringify(completeMetadata, null, 2),
        {
          contentType: 'application/json',
          encryption: true,
        },
      );

      logger.info('Recording saved', {
        call_id,
        recordingKey,
        size: audioBuffer.length,
        duration: metadata.duration_seconds,
      });

      return recordingUrl;
    } catch (error) {
      logger.error('Failed to save recording', { call_id, error });
      throw error;
    }
  }

  /**
   * Get recording
   */
  async getRecording(call_id: string, format: string = 'wav'): Promise<Buffer> {
    try {
      // Find recording file
      const prefix = `call-recordings/`;
      const files = await s3Service.listFiles(prefix);
      const recordingFile = files.find((file) => file.includes(call_id) && file.endsWith(`.${format}`));

      if (!recordingFile) {
        throw new Error(`Recording not found for call_id: ${call_id}`);
      }

      const buffer = await s3Service.downloadFile(recordingFile);

      logger.info('Recording retrieved', { call_id, size: buffer.length });
      return buffer;
    } catch (error) {
      logger.error('Failed to get recording', { call_id, error });
      throw error;
    }
  }

  /**
   * Get recording URL (signed)
   */
  async getRecordingUrl(call_id: string, format: string = 'wav', expiresIn: number = 3600): Promise<string> {
    try {
      const prefix = `call-recordings/`;
      const files = await s3Service.listFiles(prefix);
      const recordingFile = files.find((file) => file.includes(call_id) && file.endsWith(`.${format}`));

      if (!recordingFile) {
        throw new Error(`Recording not found for call_id: ${call_id}`);
      }

      const url = await s3Service.getSignedUrl(recordingFile, expiresIn);

      logger.info('Recording URL generated', { call_id, expiresIn });
      return url;
    } catch (error) {
      logger.error('Failed to get recording URL', { call_id, error });
      throw error;
    }
  }

  /**
   * Get recording metadata
   */
  async getRecordingMetadata(call_id: string): Promise<RecordingMetadata> {
    try {
      const prefix = `call-recordings/`;
      const files = await s3Service.listFiles(prefix);
      const metadataFile = files.find((file) => file.includes(call_id) && file.endsWith('.meta.json'));

      if (!metadataFile) {
        throw new Error(`Recording metadata not found for call_id: ${call_id}`);
      }

      const buffer = await s3Service.downloadFile(metadataFile);
      const metadata: RecordingMetadata = JSON.parse(buffer.toString('utf-8'));

      return metadata;
    } catch (error) {
      logger.error('Failed to get recording metadata', { call_id, error });
      throw error;
    }
  }

  /**
   * Delete recording
   */
  async deleteRecording(call_id: string): Promise<void> {
    try {
      const prefix = `call-recordings/`;
      const files = await s3Service.listFiles(prefix);
      const recordingFiles = files.filter((file) => file.includes(call_id));

      for (const file of recordingFiles) {
        await s3Service.deleteFile(file);
      }

      logger.info('Recording deleted', { call_id, fileCount: recordingFiles.length });
    } catch (error) {
      logger.error('Failed to delete recording', { call_id, error });
      throw error;
    }
  }

  /**
   * List recordings for date range
   */
  async listRecordings(startDate: Date, endDate: Date): Promise<string[]> {
    try {
      const recordings: string[] = [];

      // Iterate through date range
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = format(currentDate, 'yyyy/MM/dd');
        const prefix = `call-recordings/${dateStr}/`;

        const files = await s3Service.listFiles(prefix);
        const audioFiles = files.filter(
          (file) => file.endsWith('.wav') || file.endsWith('.mp3') || file.endsWith('.opus'),
        );

        recordings.push(...audioFiles);

        // Next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      logger.info('Recordings listed', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        count: recordings.length,
      });

      return recordings;
    } catch (error) {
      logger.error('Failed to list recordings', { error });
      throw error;
    }
  }

  /**
   * Archive old recordings (move to Glacier)
   */
  async archiveOldRecordings(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const recordings = await this.listRecordings(new Date('2020-01-01'), cutoffDate);

      // In real implementation, this would transition to S3 Glacier
      // For now, just log
      logger.info('Recordings ready for archival', {
        count: recordings.length,
        olderThanDays,
      });

      return recordings.length;
    } catch (error) {
      logger.error('Failed to archive old recordings', { error });
      throw error;
    }
  }

  /**
   * Get content type for audio format
   */
  private getContentType(format: string): string {
    const contentTypes: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      opus: 'audio/opus',
    };

    return contentTypes[format] || 'audio/wav';
  }
}

// Export singleton instance
export const recordingManager = new RecordingManager();
