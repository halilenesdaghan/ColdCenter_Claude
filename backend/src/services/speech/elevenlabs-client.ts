/**
 * ElevenLabs Client - TTS/STT API integration
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { retryWithBackoff, shouldRetryNetworkError } from '../../utils/retry';
import { circuitBreakerRegistry } from '../../utils/circuit-breaker';
import { Readable } from 'stream';

/**
 * ElevenLabs API endpoints
 */
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

/**
 * TTS voice settings
 */
export interface VoiceSettings {
  stability: number;       // 0-1, higher = more consistent
  similarity_boost: number; // 0-1, higher = closer to original
  style?: number;          // 0-1, exaggeration of speaker style
  use_speaker_boost?: boolean;
}

/**
 * TTS request options
 */
export interface TTSOptions {
  text: string;
  voice_id: string;
  model_id?: string;
  voice_settings?: VoiceSettings;
  output_format?: 'mp3_44100_128' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000';
}

/**
 * STT result
 */
export interface STTResult {
  text: string;
  confidence: number;
  language: string;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

/**
 * ElevenLabs Client class
 */
export class ElevenLabsClient {
  private client: AxiosInstance;
  private circuitBreaker = circuitBreakerRegistry.getOrCreate('elevenlabs', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    monitoringPeriod: 120000,
  });

  constructor() {
    this.client = axios.create({
      baseURL: ELEVENLABS_BASE_URL,
      timeout: 30000,
      headers: {
        'xi-api-key': config.elevenlabs.api_key,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Text-to-Speech (streaming)
   */
  async textToSpeech(options: TTSOptions): Promise<Buffer> {
    try {
      logger.debug('Generating speech', {
        text_length: options.text.length,
        voice_id: options.voice_id,
      });

      const startTime = Date.now();

      const response = await this.circuitBreaker.execute(
        async () => {
          return await retryWithBackoff(
            async () => {
              return await this.client.post(
                `/text-to-speech/${options.voice_id}`,
                {
                  text: options.text,
                  model_id: options.model_id || config.elevenlabs.model_id,
                  voice_settings: options.voice_settings || {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0,
                    use_speaker_boost: true,
                  },
                },
                {
                  headers: {
                    Accept: 'audio/mpeg',
                  },
                  responseType: 'arraybuffer',
                },
              );
            },
            {
              maxAttempts: 3,
              retryIf: shouldRetryNetworkError,
            },
          );
        },
        async () => {
          logger.warn('ElevenLabs TTS fallback triggered');
          throw new Error('TTS service temporarily unavailable');
        },
      );

      const audioBuffer = Buffer.from(response.data);
      const duration = Date.now() - startTime;

      logger.info('Speech generated', {
        duration_ms: duration,
        audio_size: audioBuffer.length,
      });

      return audioBuffer;
    } catch (error) {
      logger.error('TTS failed', { error });
      throw error;
    }
  }

  /**
   * Text-to-Speech (streaming for WebSocket)
   */
  async textToSpeechStream(options: TTSOptions): Promise<Readable> {
    try {
      logger.debug('Generating speech stream', {
        text_length: options.text.length,
        voice_id: options.voice_id,
      });

      const response = await this.client.post(
        `/text-to-speech/${options.voice_id}/stream`,
        {
          text: options.text,
          model_id: options.model_id || config.elevenlabs.model_id,
          voice_settings: options.voice_settings || {
            stability: 0.5,
            similarity_boost: 0.75,
            use_speaker_boost: true,
          },
        },
        {
          responseType: 'stream',
          headers: {
            Accept: 'audio/mpeg',
          },
        },
      );

      return response.data;
    } catch (error) {
      logger.error('TTS streaming failed', { error });
      throw error;
    }
  }

  /**
   * Speech-to-Text
   */
  async speechToText(audioBuffer: Buffer, language: string = 'tr'): Promise<STTResult> {
    try {
      logger.debug('Transcribing audio', {
        audio_size: audioBuffer.length,
        language,
      });

      const startTime = Date.now();

      // Note: ElevenLabs doesn't have official STT yet
      // This is a placeholder for when they release it
      // For now, we should use OpenAI Whisper or similar

      logger.warn('ElevenLabs STT not yet available, using placeholder');

      // Placeholder response
      const result: STTResult = {
        text: '',
        confidence: 0,
        language,
      };

      const duration = Date.now() - startTime;

      logger.info('Audio transcribed (placeholder)', {
        duration_ms: duration,
      });

      return result;
    } catch (error) {
      logger.error('STT failed', { error });
      throw error;
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<any[]> {
    try {
      const response = await this.client.get('/voices');
      return response.data.voices || [];
    } catch (error) {
      logger.error('Failed to get voices', { error });
      throw error;
    }
  }

  /**
   * Get voice details
   */
  async getVoice(voice_id: string): Promise<any> {
    try {
      const response = await this.client.get(`/voices/${voice_id}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get voice', { voice_id, error });
      throw error;
    }
  }

  /**
   * Get user subscription info
   */
  async getSubscriptionInfo(): Promise<any> {
    try {
      const response = await this.client.get('/user/subscription');
      return response.data;
    } catch (error) {
      logger.error('Failed to get subscription info', { error });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/user');
      return true;
    } catch (error) {
      logger.error('ElevenLabs health check failed', { error });
      return false;
    }
  }
}

// Export singleton instance
export const elevenLabsClient = new ElevenLabsClient();
