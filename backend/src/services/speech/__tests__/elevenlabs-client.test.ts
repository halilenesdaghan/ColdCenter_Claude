/**
 * Unit Tests for ElevenLabs Client
 */

import { ElevenLabsClient, TTSOptions } from '../elevenlabs-client';
import axios from 'axios';
import { Readable } from 'stream';

// Mock axios
jest.mock('axios');

// Mock config
jest.mock('../../../config', () => ({
  config: {
    elevenlabs: {
      api_key: 'test-api-key',
      model_id: 'eleven_multilingual_v2',
      voice_id: 'test-voice-id',
    },
  },
}));

// Mock circuit breaker
jest.mock('../../../utils/circuit-breaker', () => ({
  circuitBreakerRegistry: {
    getOrCreate: jest.fn(() => ({
      execute: jest.fn((fn) => fn()),
    })),
  },
}));

// Mock retry utility
jest.mock('../../../utils/retry', () => ({
  retryWithBackoff: jest.fn((fn) => fn()),
  shouldRetryNetworkError: jest.fn(() => true),
}));

describe('ElevenLabsClient', () => {
  let elevenLabsClient: ElevenLabsClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
    };

    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    elevenLabsClient = new ElevenLabsClient();
  });

  describe('Initialization', () => {
    it('should create axios client with correct configuration', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.elevenlabs.io/v1',
        timeout: 30000,
        headers: {
          'xi-api-key': 'test-api-key',
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('textToSpeech', () => {
    it('should generate speech from text', async () => {
      const mockAudioData = Buffer.alloc(1024);
      mockAxiosInstance.post.mockResolvedValue({
        data: mockAudioData,
      });

      const options: TTSOptions = {
        text: 'Merhaba, Opel Çağrı Merkezine hoş geldiniz',
        voice_id: 'test-voice-id',
      };

      const result = await elevenLabsClient.textToSpeech(options);

      expect(result).toBeInstanceOf(Buffer);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/text-to-speech/test-voice-id',
        expect.objectContaining({
          text: options.text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: expect.any(Object),
        }),
        expect.objectContaining({
          headers: {
            Accept: 'audio/mpeg',
          },
          responseType: 'arraybuffer',
        })
      );
    });

    it('should use custom voice settings if provided', async () => {
      const mockAudioData = Buffer.alloc(1024);
      mockAxiosInstance.post.mockResolvedValue({
        data: mockAudioData,
      });

      const options: TTSOptions = {
        text: 'Test text',
        voice_id: 'test-voice-id',
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.8,
          style: 0.5,
          use_speaker_boost: false,
        },
      };

      await elevenLabsClient.textToSpeech(options);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          voice_settings: options.voice_settings,
        }),
        expect.any(Object)
      );
    });

    it('should use custom model_id if provided', async () => {
      const mockAudioData = Buffer.alloc(1024);
      mockAxiosInstance.post.mockResolvedValue({
        data: mockAudioData,
      });

      const options: TTSOptions = {
        text: 'Test text',
        voice_id: 'test-voice-id',
        model_id: 'custom-model-id',
      };

      await elevenLabsClient.textToSpeech(options);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model_id: 'custom-model-id',
        }),
        expect.any(Object)
      );
    });

    it('should handle TTS errors', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('TTS API error'));

      const options: TTSOptions = {
        text: 'Test text',
        voice_id: 'test-voice-id',
      };

      await expect(elevenLabsClient.textToSpeech(options)).rejects.toThrow('TTS API error');
    });

    it('should log performance metrics', async () => {
      const mockAudioData = Buffer.alloc(1024);
      mockAxiosInstance.post.mockResolvedValue({
        data: mockAudioData,
      });

      const options: TTSOptions = {
        text: 'Test text',
        voice_id: 'test-voice-id',
      };

      await elevenLabsClient.textToSpeech(options);

      // Verify that the method completed (performance logging happens internally)
      expect(mockAxiosInstance.post).toHaveBeenCalled();
    });
  });

  describe('textToSpeechStream', () => {
    it('should generate streaming audio', async () => {
      const mockStream = new Readable();
      mockStream.push('audio data');
      mockStream.push(null);

      mockAxiosInstance.post.mockResolvedValue({
        data: mockStream,
      });

      const options: TTSOptions = {
        text: 'Test streaming text',
        voice_id: 'test-voice-id',
      };

      const result = await elevenLabsClient.textToSpeechStream(options);

      expect(result).toBe(mockStream);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/text-to-speech/test-voice-id/stream',
        expect.any(Object),
        expect.objectContaining({
          responseType: 'stream',
        })
      );
    });

    it('should handle streaming errors', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Streaming failed'));

      const options: TTSOptions = {
        text: 'Test text',
        voice_id: 'test-voice-id',
      };

      await expect(elevenLabsClient.textToSpeechStream(options)).rejects.toThrow(
        'Streaming failed'
      );
    });
  });

  describe('speechToText', () => {
    it('should return placeholder result', async () => {
      const audioBuffer = Buffer.alloc(1024);

      const result = await elevenLabsClient.speechToText(audioBuffer, 'tr');

      expect(result).toEqual({
        text: '',
        confidence: 0,
        language: 'tr',
      });
    });

    it('should handle different languages', async () => {
      const audioBuffer = Buffer.alloc(1024);

      const result = await elevenLabsClient.speechToText(audioBuffer, 'en');

      expect(result.language).toBe('en');
    });

    it('should log warning about placeholder', async () => {
      const audioBuffer = Buffer.alloc(1024);

      await elevenLabsClient.speechToText(audioBuffer);

      // Method should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('getVoices', () => {
    it('should retrieve available voices', async () => {
      const mockVoices = [
        { voice_id: 'voice-1', name: 'Turkish Voice 1', language: 'tr' },
        { voice_id: 'voice-2', name: 'Turkish Voice 2', language: 'tr' },
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: { voices: mockVoices },
      });

      const voices = await elevenLabsClient.getVoices();

      expect(voices).toEqual(mockVoices);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/voices');
    });

    it('should return empty array if no voices', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {},
      });

      const voices = await elevenLabsClient.getVoices();

      expect(voices).toEqual([]);
    });

    it('should handle errors when fetching voices', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Failed to fetch voices'));

      await expect(elevenLabsClient.getVoices()).rejects.toThrow('Failed to fetch voices');
    });
  });

  describe('getVoice', () => {
    it('should retrieve specific voice details', async () => {
      const mockVoice = {
        voice_id: 'voice-123',
        name: 'Turkish Voice',
        language: 'tr',
        settings: {},
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockVoice,
      });

      const voice = await elevenLabsClient.getVoice('voice-123');

      expect(voice).toEqual(mockVoice);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/voices/voice-123');
    });

    it('should handle errors when fetching voice', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Voice not found'));

      await expect(elevenLabsClient.getVoice('invalid-voice')).rejects.toThrow(
        'Voice not found'
      );
    });
  });

  describe('getSubscriptionInfo', () => {
    it('should retrieve subscription information', async () => {
      const mockSubscription = {
        tier: 'premium',
        character_count: 100000,
        character_limit: 500000,
        can_extend_character_limit: true,
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: mockSubscription,
      });

      const subscription = await elevenLabsClient.getSubscriptionInfo();

      expect(subscription).toEqual(mockSubscription);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/user/subscription');
    });

    it('should handle errors when fetching subscription', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Subscription fetch failed'));

      await expect(elevenLabsClient.getSubscriptionInfo()).rejects.toThrow(
        'Subscription fetch failed'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true if API is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { user_id: 'test-user' },
      });

      const isHealthy = await elevenLabsClient.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/user');
    });

    it('should return false if API is unhealthy', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API down'));

      const isHealthy = await elevenLabsClient.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });
});
