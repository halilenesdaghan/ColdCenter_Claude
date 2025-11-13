/**
 * AI Orchestrator - Manages OpenAI Realtime API connection and conversation flow
 */

import OpenAI from 'openai';
import { WebSocket } from 'ws';
import { config } from '../config';
import { logger, createLogger } from '../utils/logger';
import {
  CallSession,
  CallState,
  Intent,
  IntentClassification,
  Speaker,
  ConversationTurn,
  Sentiment,
} from '../types';
import { EventEmitter } from 'events';

export interface AIResponse {
  text: string;
  audio?: Buffer;
  intent?: IntentClassification;
  slots?: Record<string, any>;
  action?: string;
  confidence: number;
}

export interface AIOrchestratorEvents {
  'response.generated': (response: AIResponse) => void;
  'intent.detected': (intent: IntentClassification) => void;
  'state.changed': (newState: CallState) => void;
  'error': (error: Error) => void;
  'connection.established': () => void;
  'connection.closed': () => void;
}

/**
 * AI Orchestrator class
 * Manages conversation with OpenAI Realtime API
 */
export class AIOrchestrator extends EventEmitter {
  private openai: OpenAI;
  private ws: WebSocket | null = null;
  private callSession: CallSession;
  private conversationHistory: ConversationTurn[] = [];
  private systemPrompt: string;
  private logger: any;

  constructor(callSession: CallSession) {
    super();
    this.callSession = callSession;
    this.openai = new OpenAI({ apiKey: config.openai.api_key });
    this.logger = createLogger({ call_id: callSession.call_id });
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Build system prompt for Turkish conversation
   */
  private buildSystemPrompt(): string {
    return `Sen Opel yetkili servisinin yapay zeka asistanısın. Görevin müşterilere yardımcı olmak.

KİMLİĞİN:
- İsmin: Opel Asistan
- Görevin: Müşterilere araç fiyatları, stok durumu, test sürüşü ve servis randevuları konusunda yardım etmek
- Dil: Türkçe (profesyonel ama samimi)
- Ton: Yardımsever, sakin, profesyonel

YAPABILECEĞ İN İŞLEMLER:
1. **vehicle_price_inquiry**: Araç fiyatları hakkında bilgi verme
2. **vehicle_stock_check**: Stok ve renk durumu sorgulama
3. **test_drive_booking**: Test sürüşü randevusu oluşturma
4. **service_appointment**: Servis randevusu oluşturma
5. **appointment_confirmation**: Randevu teyit etme (giden aramalar için)

KURALLAR:
- Her zaman kibarlıkla karşıla: "Merhaba, Opel'e hoş geldiniz. Size nasıl yardımcı olabilirim?"
- Müşterinin intentini doğru tespit et
- Gerekli bilgileri topla (araç modeli, renk, tarih, telefon, vb.)
- Emin olmadığında netleştirici sorular sor
- Karmaşık durumlarda "Sizi uzman danışmanımıza bağlıyorum" de
- ASLA uydurma bilgi verme, emin değilsen danışmana aktar

RANDEVU İÇİN GEREKLİ BİLGİLER:
- Test Sürüşü: araç modeli, tercih edilen tarih/saat, ad, telefon, ehliyet bilgisi
- Servis: araç plakası/şasi no, servis türü, tarih/saat, ad, telefon, sorun açıklaması

MESAI SAATLERİ: 09:00-18:00 Pazartesi-Cumartesi

Şu anda saat: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
Müşteri telefonu: ${this.callSession.customer_phone}
Müşteri adı: ${this.callSession.customer_name || 'Bilinmiyor'}`;
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to OpenAI Realtime API...');

      // In a real implementation, we would establish WebSocket connection to OpenAI Realtime API
      // For now, we'll use a simplified approach with the regular API

      this.logger.info('Connected to AI service');
      this.emit('connection.established');
    } catch (error) {
      this.logger.error('Failed to connect to AI service', error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Process user input and generate AI response
   */
  async processUserInput(text: string, audioBuffer?: Buffer): Promise<AIResponse> {
    try {
      this.logger.debug('Processing user input', { text });

      // Add user message to history
      const userTurn: ConversationTurn = {
        call_id: this.callSession.call_id,
        sequence: this.conversationHistory.length + 1,
        speaker: Speaker.CUSTOMER,
        text,
        timestamp: Date.now(),
        confidence: 1.0,
        language: 'tr',
      };
      this.conversationHistory.push(userTurn);

      // Build messages for OpenAI
      const messages: any[] = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory.map((turn) => ({
          role: turn.speaker === Speaker.CUSTOMER ? 'user' : 'assistant',
          content: turn.text,
        })),
      ];

      // Call OpenAI Chat Completion API with function calling
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        functions: this.getFunctionDefinitions(),
        function_call: 'auto',
        temperature: 0.7,
        max_tokens: 500,
      });

      const aiMessage = response.choices[0].message;

      // Check if AI wants to call a function
      if (aiMessage.function_call) {
        const functionName = aiMessage.function_call.name;
        const functionArgs = JSON.parse(aiMessage.function_call.arguments || '{}');

        this.logger.info('AI detected intent', { functionName, functionArgs });

        const intent = this.mapFunctionToIntent(functionName);
        const intentClassification: IntentClassification = {
          intent,
          confidence: 0.9,
          slots: functionArgs,
        };

        this.emit('intent.detected', intentClassification);

        // Generate natural response
        const aiResponse: AIResponse = {
          text: aiMessage.content || this.generateIntentResponse(intent, functionArgs),
          intent: intentClassification,
          slots: functionArgs,
          action: functionName,
          confidence: 0.9,
        };

        // Add AI response to history
        const aiTurn: ConversationTurn = {
          call_id: this.callSession.call_id,
          sequence: this.conversationHistory.length + 1,
          speaker: Speaker.AI,
          text: aiResponse.text,
          timestamp: Date.now(),
          language: 'tr',
          intent,
        };
        this.conversationHistory.push(aiTurn);

        return aiResponse;
      } else {
        // Regular conversational response
        const responseText = aiMessage.content || 'Özür dilerim, sizi anlayamadım. Tekrar söyleyebilir misiniz?';

        const aiResponse: AIResponse = {
          text: responseText,
          confidence: 0.8,
        };

        // Add to history
        const aiTurn: ConversationTurn = {
          call_id: this.callSession.call_id,
          sequence: this.conversationHistory.length + 1,
          speaker: Speaker.AI,
          text: responseText,
          timestamp: Date.now(),
          language: 'tr',
        };
        this.conversationHistory.push(aiTurn);

        return aiResponse;
      }
    } catch (error) {
      this.logger.error('Error processing user input', error);
      throw error;
    }
  }

  /**
   * Get OpenAI function definitions for intent detection
   */
  private getFunctionDefinitions(): any[] {
    return [
      {
        name: 'check_vehicle_price',
        description: 'Müşteri bir aracın fiyatını öğrenmek istiyor',
        parameters: {
          type: 'object',
          properties: {
            vehicle_model: {
              type: 'string',
              enum: ['Corsa', 'Astra', 'Grandland', 'Mokka', 'Combo'],
              description: 'Araç modeli',
            },
            trim_level: {
              type: 'string',
              enum: ['Elegance', 'GS Line', 'Ultimate'],
              description: 'Donanım paketi',
            },
          },
          required: ['vehicle_model'],
        },
      },
      {
        name: 'check_vehicle_stock',
        description: 'Müşteri bir aracın stok durumunu öğrenmek istiyor',
        parameters: {
          type: 'object',
          properties: {
            vehicle_model: {
              type: 'string',
              enum: ['Corsa', 'Astra', 'Grandland', 'Mokka', 'Combo'],
            },
            color: {
              type: 'string',
              description: 'Araç rengi (örn: kırmızı, beyaz, siyah)',
            },
          },
          required: ['vehicle_model', 'color'],
        },
      },
      {
        name: 'book_test_drive',
        description: 'Müşteri test sürüşü randevusu almak istiyor',
        parameters: {
          type: 'object',
          properties: {
            vehicle_model: {
              type: 'string',
              enum: ['Corsa', 'Astra', 'Grandland', 'Mokka', 'Combo'],
            },
            customer_name: {
              type: 'string',
              description: 'Müşteri adı soyadı',
            },
            customer_phone: {
              type: 'string',
              description: 'Müşteri telefon numarası',
            },
            preferred_date: {
              type: 'string',
              description: 'Tercih edilen tarih (YYYY-MM-DD)',
            },
            preferred_time: {
              type: 'string',
              description: 'Tercih edilen saat (HH:MM)',
            },
          },
          required: ['vehicle_model', 'customer_name', 'customer_phone', 'preferred_date'],
        },
      },
      {
        name: 'book_service_appointment',
        description: 'Müşteri servis randevusu almak istiyor',
        parameters: {
          type: 'object',
          properties: {
            customer_name: {
              type: 'string',
            },
            customer_phone: {
              type: 'string',
            },
            vehicle_plate: {
              type: 'string',
              description: 'Araç plakası',
            },
            service_type: {
              type: 'string',
              description: 'Servis türü (periyodik bakım, tamir, lastik değişimi, vb.)',
            },
            preferred_date: {
              type: 'string',
              description: 'Tercih edilen tarih (YYYY-MM-DD)',
            },
            problem_description: {
              type: 'string',
              description: 'Sorun açıklaması',
            },
          },
          required: ['customer_name', 'customer_phone', 'vehicle_plate', 'service_type', 'preferred_date'],
        },
      },
      {
        name: 'escalate_to_agent',
        description: 'Müşteri canlı danışmanla görüşmek istiyor veya sorun karmaşık',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Aktarma nedeni',
            },
          },
          required: ['reason'],
        },
      },
    ];
  }

  /**
   * Map function name to Intent enum
   */
  private mapFunctionToIntent(functionName: string): Intent {
    const mapping: Record<string, Intent> = {
      check_vehicle_price: Intent.VEHICLE_PRICE_INQUIRY,
      check_vehicle_stock: Intent.VEHICLE_STOCK_CHECK,
      book_test_drive: Intent.TEST_DRIVE_BOOKING,
      book_service_appointment: Intent.SERVICE_APPOINTMENT,
      escalate_to_agent: Intent.ESCALATION,
    };

    return mapping[functionName] || Intent.OUT_OF_SCOPE;
  }

  /**
   * Generate intent-specific response
   */
  private generateIntentResponse(intent: Intent, slots: Record<string, any>): string {
    switch (intent) {
      case Intent.VEHICLE_PRICE_INQUIRY:
        return `${slots.vehicle_model} modelinin fiyat bilgisini size hemen iletiyorum.`;
      case Intent.VEHICLE_STOCK_CHECK:
        return `${slots.vehicle_model} modelinin ${slots.color} rengindeki stok durumunu kontrol ediyorum.`;
      case Intent.TEST_DRIVE_BOOKING:
        return `Test sürüşü randevunuzu oluşturuyorum. Bir dakika lütfen.`;
      case Intent.SERVICE_APPOINTMENT:
        return `Servis randevunuzu oluşturuyorum. Kısa bir süre içinde takvimimizi kontrol edeceğim.`;
      case Intent.ESCALATION:
        return `Sizi uzman danışmanımıza aktarıyorum. Lütfen bekleyiniz.`;
      default:
        return `Anladım, size yardımcı oluyorum.`;
    }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  /**
   * Analyze sentiment from text
   */
  analyzeSentiment(text: string): Sentiment {
    // Simple keyword-based sentiment analysis
    // In production, use a proper sentiment analysis model

    const negativeKeywords = [
      'kötü',
      'berbat',
      'çok kötü',
      'memnun değilim',
      'şikayet',
      'sinir',
      'öfke',
      'yetersiz',
    ];
    const positiveKeywords = ['iyi', 'harika', 'mükemmel', 'teşekkür', 'güzel', 'memnun', 'beğendim'];

    const lowerText = text.toLowerCase();

    const hasNegative = negativeKeywords.some((keyword) => lowerText.includes(keyword));
    const hasPositive = positiveKeywords.some((keyword) => lowerText.includes(keyword));

    if (hasNegative && !hasPositive) return Sentiment.NEGATIVE;
    if (hasPositive && !hasNegative) return Sentiment.POSITIVE;
    return Sentiment.NEUTRAL;
  }

  /**
   * Generate call summary
   */
  generateSummary(): string {
    const turns = this.conversationHistory.filter((t) => t.speaker === Speaker.CUSTOMER);
    if (turns.length === 0) {
      return 'Müşteri ile etkileşim olmadı.';
    }

    // Extract key information
    const intent = this.callSession.intent || Intent.OUT_OF_SCOPE;
    const intentLabels: Record<Intent, string> = {
      [Intent.VEHICLE_PRICE_INQUIRY]: 'Araç fiyat sorgulama',
      [Intent.VEHICLE_STOCK_CHECK]: 'Stok kontrolü',
      [Intent.TEST_DRIVE_BOOKING]: 'Test sürüşü randevusu',
      [Intent.SERVICE_APPOINTMENT]: 'Servis randevusu',
      [Intent.APPOINTMENT_CONFIRMATION]: 'Randevu teyit',
      [Intent.ESCALATION]: 'Danışmana aktarım',
      [Intent.OUT_OF_SCOPE]: 'Kapsam dışı',
    };

    return `${intentLabels[intent]}. Toplam ${turns.length} müşteri mesajı. ${
      this.callSession.escalated ? 'Canlı danışmana aktarıldı.' : 'Sistem tarafından çözüldü.'
    }`;
  }

  /**
   * Disconnect from AI service
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.emit('connection.closed');
    this.logger.info('Disconnected from AI service');
  }
}
