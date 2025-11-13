/**
 * Transcript Manager - Manages conversation transcripts
 */

import { s3Service } from './s3-client';
import { dynamoDBService, Tables } from '../database/dynamodb-client';
import { logger } from '../../utils/logger';
import { format } from 'date-fns';
import { ConversationTurn } from '../../types';

export interface TranscriptDocument {
  call_id: string;
  language: string;
  duration_seconds: number;
  turns: ConversationTurn[];
  summary: string;
  key_entities: Record<string, any>;
  created_at: string;
}

/**
 * Transcript Manager class
 */
export class TranscriptManager {
  /**
   * Save transcript
   */
  async saveTranscript(
    call_id: string,
    turns: ConversationTurn[],
    metadata: {
      language: string;
      duration_seconds: number;
      summary: string;
      key_entities?: Record<string, any>;
    },
  ): Promise<string> {
    try {
      const timestamp = new Date();
      const dateStr = format(timestamp, 'yyyy/MM/dd');

      // Generate S3 key
      const transcriptKey = `transcripts/${dateStr}/${call_id}.json`;

      // Create transcript document
      const transcriptDoc: TranscriptDocument = {
        call_id,
        language: metadata.language,
        duration_seconds: metadata.duration_seconds,
        turns,
        summary: metadata.summary,
        key_entities: metadata.key_entities || {},
        created_at: timestamp.toISOString(),
      };

      // Upload to S3
      const transcriptUrl = await s3Service.uploadFile(
        transcriptKey,
        JSON.stringify(transcriptDoc, null, 2),
        {
          contentType: 'application/json',
          metadata: {
            call_id,
            language: metadata.language,
            turn_count: turns.length.toString(),
          },
          encryption: true,
        },
      );

      // Save index to DynamoDB for quick lookup
      await this.saveTranscriptIndex(call_id, transcriptKey, turns.length);

      logger.info('Transcript saved', {
        call_id,
        transcriptKey,
        turnCount: turns.length,
        duration: metadata.duration_seconds,
      });

      return transcriptUrl;
    } catch (error) {
      logger.error('Failed to save transcript', { call_id, error });
      throw error;
    }
  }

  /**
   * Get transcript
   */
  async getTranscript(call_id: string): Promise<TranscriptDocument> {
    try {
      // Get transcript location from index
      const index = await this.getTranscriptIndex(call_id);

      if (!index || !index.s3_key) {
        throw new Error(`Transcript not found for call_id: ${call_id}`);
      }

      // Download from S3
      const buffer = await s3Service.downloadFile(index.s3_key);
      const transcript: TranscriptDocument = JSON.parse(buffer.toString('utf-8'));

      logger.info('Transcript retrieved', { call_id });
      return transcript;
    } catch (error) {
      logger.error('Failed to get transcript', { call_id, error });
      throw error;
    }
  }

  /**
   * Search transcripts by text
   */
  async searchTranscripts(query: string, limit: number = 10): Promise<TranscriptDocument[]> {
    try {
      // In a real implementation, this would use Elasticsearch or similar
      // For now, we'll do a simple scan

      logger.warn('Transcript search is not optimized for production', { query });

      const allTranscripts = await s3Service.listFiles('transcripts/');
      const jsonFiles = allTranscripts.filter((file) => file.endsWith('.json'));

      const results: TranscriptDocument[] = [];
      const lowerQuery = query.toLowerCase();

      for (const file of jsonFiles.slice(0, 100)) {
        // Limit to prevent overload
        try {
          const buffer = await s3Service.downloadFile(file);
          const transcript: TranscriptDocument = JSON.parse(buffer.toString('utf-8'));

          // Search in turns
          const hasMatch = transcript.turns.some((turn) => turn.text.toLowerCase().includes(lowerQuery));

          if (hasMatch) {
            results.push(transcript);
            if (results.length >= limit) break;
          }
        } catch (error) {
          logger.debug('Failed to parse transcript file', { file, error });
        }
      }

      logger.info('Transcript search completed', { query, resultCount: results.length });
      return results;
    } catch (error) {
      logger.error('Failed to search transcripts', { query, error });
      throw error;
    }
  }

  /**
   * Get transcript summary
   */
  async getTranscriptSummary(call_id: string): Promise<string> {
    try {
      const transcript = await this.getTranscript(call_id);
      return transcript.summary;
    } catch (error) {
      logger.error('Failed to get transcript summary', { call_id, error });
      throw error;
    }
  }

  /**
   * Delete transcript
   */
  async deleteTranscript(call_id: string): Promise<void> {
    try {
      // Get index
      const index = await this.getTranscriptIndex(call_id);

      if (index && index.s3_key) {
        // Delete from S3
        await s3Service.deleteFile(index.s3_key);
      }

      // Delete index from DynamoDB
      await this.deleteTranscriptIndex(call_id);

      logger.info('Transcript deleted', { call_id });
    } catch (error) {
      logger.error('Failed to delete transcript', { call_id, error });
      throw error;
    }
  }

  /**
   * Export transcript to text format
   */
  async exportToText(call_id: string): Promise<string> {
    try {
      const transcript = await this.getTranscript(call_id);

      let text = `Call Transcript: ${call_id}\n`;
      text += `Date: ${transcript.created_at}\n`;
      text += `Duration: ${transcript.duration_seconds}s\n`;
      text += `Language: ${transcript.language}\n`;
      text += `\nSummary:\n${transcript.summary}\n`;
      text += `\n${'='.repeat(80)}\n\n`;

      for (const turn of transcript.turns) {
        const speaker = turn.speaker.toUpperCase();
        const timestamp = new Date(turn.timestamp).toISOString();
        text += `[${timestamp}] ${speaker}: ${turn.text}\n\n`;
      }

      return text;
    } catch (error) {
      logger.error('Failed to export transcript to text', { call_id, error });
      throw error;
    }
  }

  /**
   * Get daily transcript statistics
   */
  async getDailyStats(date: Date): Promise<{
    total_transcripts: number;
    total_turns: number;
    average_duration: number;
    languages: Record<string, number>;
  }> {
    try {
      const dateStr = format(date, 'yyyy/MM/dd');
      const prefix = `transcripts/${dateStr}/`;

      const files = await s3Service.listFiles(prefix);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));

      let totalTurns = 0;
      let totalDuration = 0;
      const languages: Record<string, number> = {};

      for (const file of jsonFiles) {
        try {
          const buffer = await s3Service.downloadFile(file);
          const transcript: TranscriptDocument = JSON.parse(buffer.toString('utf-8'));

          totalTurns += transcript.turns.length;
          totalDuration += transcript.duration_seconds;
          languages[transcript.language] = (languages[transcript.language] || 0) + 1;
        } catch (error) {
          logger.debug('Failed to process transcript for stats', { file, error });
        }
      }

      return {
        total_transcripts: jsonFiles.length,
        total_turns: totalTurns,
        average_duration: jsonFiles.length > 0 ? totalDuration / jsonFiles.length : 0,
        languages,
      };
    } catch (error) {
      logger.error('Failed to get daily transcript stats', { date, error });
      throw error;
    }
  }

  // ============================================
  // Private helper methods
  // ============================================

  /**
   * Save transcript index to DynamoDB
   */
  private async saveTranscriptIndex(call_id: string, s3_key: string, turn_count: number): Promise<void> {
    try {
      await dynamoDBService.put(Tables.CALL_SESSIONS, {
        call_id,
        transcript_url: `s3://${s3_key}`,
        transcript_turn_count: turn_count,
        transcript_indexed_at: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to save transcript index', { call_id, error });
      // Don't throw - index is secondary
    }
  }

  /**
   * Get transcript index from DynamoDB
   */
  private async getTranscriptIndex(call_id: string): Promise<{ s3_key?: string } | null> {
    try {
      const session = await dynamoDBService.get(Tables.CALL_SESSIONS, { call_id });

      if (!session || !session.transcript_url) {
        return null;
      }

      // Extract S3 key from URL
      const s3_key = session.transcript_url.replace('s3://', '');

      return { s3_key };
    } catch (error) {
      logger.error('Failed to get transcript index', { call_id, error });
      return null;
    }
  }

  /**
   * Delete transcript index from DynamoDB
   */
  private async deleteTranscriptIndex(call_id: string): Promise<void> {
    try {
      await dynamoDBService.update(Tables.CALL_SESSIONS, { call_id }, {
        transcript_url: null,
        transcript_turn_count: null,
        transcript_indexed_at: null,
      });
    } catch (error) {
      logger.error('Failed to delete transcript index', { call_id, error });
      // Don't throw - index deletion is secondary
    }
  }
}

// Export singleton instance
export const transcriptManager = new TranscriptManager();
