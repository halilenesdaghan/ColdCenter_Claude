/**
 * Call Manager - Manages call state machine and orchestrates all services
 */

import { EventEmitter } from 'events';
import {
  CallSession,
  CallState,
  CallStatus,
  CallDirection,
  Intent,
  IntentClassification,
} from '../types';
import { AIOrchestrator, AIResponse } from './ai-orchestrator';
import { createLogger } from '../utils/logger';
import { dynamoDBService, Tables } from '../services/database/dynamodb-client';
import { generateCallId, isBusinessHours } from '../utils/helpers';

export interface CallManagerEvents {
  'state.changed': (oldState: CallState, newState: CallState) => void;
  'intent.detected': (intent: IntentClassification) => void;
  'escalation.triggered': (reason: string) => void;
  'call.ended': (session: CallSession) => void;
}

/**
 * State machine transitions
 */
const STATE_TRANSITIONS: Record<CallState, CallState[]> = {
  [CallState.IDLE]: [CallState.GREETING],
  [CallState.GREETING]: [CallState.AUTHENTICATE, CallState.INTENT_DETECT],
  [CallState.AUTHENTICATE]: [CallState.INTENT_DETECT, CallState.TRANSFER],
  [CallState.INTENT_DETECT]: [CallState.SLOT_FILL, CallState.EXECUTING, CallState.CLARIFY, CallState.TRANSFER],
  [CallState.SLOT_FILL]: [CallState.EXECUTING, CallState.CLARIFY, CallState.INTENT_DETECT],
  [CallState.EXECUTING]: [CallState.RESPOND, CallState.TRANSFER],
  [CallState.CLARIFY]: [CallState.INTENT_DETECT, CallState.SLOT_FILL],
  [CallState.RESPOND]: [CallState.FOLLOW_UP, CallState.CLOSING, CallState.INTENT_DETECT],
  [CallState.FOLLOW_UP]: [CallState.INTENT_DETECT, CallState.CLOSING],
  [CallState.CLOSING]: [CallState.ENDED],
  [CallState.TRANSFER]: [CallState.ENDED],
  [CallState.ENDED]: [],
};

/**
 * Call Manager class
 */
export class CallManager extends EventEmitter {
  private session: CallSession;
  private aiOrchestrator: AIOrchestrator;
  private logger: any;
  private stateTimeout: NodeJS.Timeout | null = null;
  private failedAttempts: number = 0;
  private maxFailedAttempts: number = 3;

  constructor(customerPhone: string, direction: CallDirection = CallDirection.INBOUND) {
    super();

    // Initialize call session
    this.session = {
      call_id: generateCallId(),
      customer_phone: customerPhone,
      direction,
      status: CallStatus.ACTIVE,
      state: CallState.IDLE,
      escalated: false,
      created_at: Date.now(),
    };

    this.logger = createLogger({ call_id: this.session.call_id });
    this.aiOrchestrator = new AIOrchestrator(this.session);

    // Listen to AI events
    this.aiOrchestrator.on('intent.detected', this.handleIntentDetected.bind(this));
    this.aiOrchestrator.on('error', this.handleAIError.bind(this));
  }

  /**
   * Start call session
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting call session', {
        customer_phone: this.session.customer_phone,
        direction: this.session.direction,
      });

      // Save initial session to database
      await this.saveSession();

      // Connect to AI service
      await this.aiOrchestrator.connect();

      // Transition to greeting
      await this.transitionTo(CallState.GREETING);

      // Generate greeting message
      const greeting = await this.generateGreeting();
      await this.deliverResponse(greeting);

      // Transition to intent detection
      await this.transitionTo(CallState.INTENT_DETECT);
    } catch (error) {
      this.logger.error('Failed to start call session', error);
      throw error;
    }
  }

  /**
   * Process user input (speech-to-text result)
   */
  async processUserInput(text: string, audioBuffer?: Buffer): Promise<void> {
    try {
      this.logger.debug('Processing user input', { text, state: this.session.state });

      // Clear any existing timeouts
      this.clearStateTimeout();

      // Check for escalation keywords
      if (this.shouldEscalate(text)) {
        await this.escalate('User requested agent');
        return;
      }

      // Process with AI
      const aiResponse = await this.aiOrchestrator.processUserInput(text, audioBuffer);

      // Handle based on current state
      await this.handleAIResponse(aiResponse);

      // Reset failed attempts on successful processing
      this.failedAttempts = 0;

      // Set state timeout
      this.setStateTimeout();
    } catch (error) {
      this.logger.error('Error processing user input', error);
      this.failedAttempts++;

      if (this.failedAttempts >= this.maxFailedAttempts) {
        await this.escalate('Multiple failed processing attempts');
      } else {
        await this.deliverResponse({
          text: 'Özür dilerim, sizi tam anlayamadım. Tekrar söyleyebilir misiniz?',
          confidence: 1.0,
        });
      }
    }
  }

  /**
   * Handle AI response based on current state
   */
  private async handleAIResponse(response: AIResponse): Promise<void> {
    switch (this.session.state) {
      case CallState.INTENT_DETECT:
        if (response.intent) {
          await this.handleIntentDetection(response.intent);
        } else {
          // No clear intent, ask for clarification
          await this.transitionTo(CallState.CLARIFY);
        }
        break;

      case CallState.SLOT_FILL:
        if (response.slots && this.areRequiredSlotsFilled(response.slots)) {
          await this.transitionTo(CallState.EXECUTING);
          if (response.intent) {
            await this.executeIntent(response.intent.intent, response.slots);
          }
        }
        break;

      case CallState.EXECUTING:
        await this.transitionTo(CallState.RESPOND);
        await this.deliverResponse(response);
        break;

      case CallState.RESPOND:
        await this.transitionTo(CallState.FOLLOW_UP);
        await this.deliverResponse({
          text: 'Başka bir konuda yardımcı olabilir miyim?',
          confidence: 1.0,
        });
        break;

      case CallState.FOLLOW_UP:
        // Check if user wants to continue or end
        if (this.isEndingConversation(response.text)) {
          await this.end('Customer ended conversation');
        } else {
          await this.transitionTo(CallState.INTENT_DETECT);
        }
        break;

      default:
        await this.deliverResponse(response);
    }
  }

  /**
   * Handle intent detection
   */
  private async handleIntentDetection(intent: IntentClassification): Promise<void> {
    this.logger.info('Intent detected', intent);

    // Update session
    this.session.intent = intent.intent;
    this.session.slots = intent.slots || {};

    // Emit event
    this.emit('intent.detected', intent);

    // Check if escalation is needed
    if (intent.intent === Intent.ESCALATION) {
      await this.escalate(intent.slots?.reason || 'User requested agent');
      return;
    }

    // Check if all required slots are filled
    if (this.areRequiredSlotsFilled(intent.slots || {})) {
      await this.transitionTo(CallState.EXECUTING);
      await this.executeIntent(intent.intent, intent.slots || {});
    } else {
      await this.transitionTo(CallState.SLOT_FILL);
      // AI will ask for missing information
    }
  }

  /**
   * Handle intent detected event
   */
  private handleIntentDetected(intent: IntentClassification): void {
    this.emit('intent.detected', intent);
  }

  /**
   * Handle AI error
   */
  private handleAIError(error: Error): void {
    this.logger.error('AI error occurred', error);
    this.failedAttempts++;

    if (this.failedAttempts >= this.maxFailedAttempts) {
      this.escalate('AI service errors');
    }
  }

  /**
   * Execute detected intent
   */
  private async executeIntent(intent: Intent, slots: Record<string, any>): Promise<void> {
    this.logger.info('Executing intent', { intent, slots });

    try {
      // Intent execution will be handled by specific adapters
      // For now, just deliver a confirmation response
      const response = this.generateIntentExecutionResponse(intent, slots);
      await this.deliverResponse(response);

      await this.transitionTo(CallState.RESPOND);
    } catch (error) {
      this.logger.error('Failed to execute intent', error);
      await this.escalate('Intent execution failed');
    }
  }

  /**
   * Generate greeting message
   */
  private async generateGreeting(): Promise<AIResponse> {
    const hour = new Date().getHours();
    let greeting = 'Merhaba';

    if (hour < 12) greeting = 'Günaydın';
    else if (hour < 18) greeting = 'İyi günler';
    else greeting = 'İyi akşamlar';

    return {
      text: `${greeting}, Opel'e hoş geldiniz. Size nasıl yardımcı olabilirim?`,
      confidence: 1.0,
    };
  }

  /**
   * Generate intent execution response
   */
  private generateIntentExecutionResponse(intent: Intent, slots: Record<string, any>): AIResponse {
    let text = '';

    switch (intent) {
      case Intent.VEHICLE_PRICE_INQUIRY:
        text = `${slots.vehicle_model} modeline ilişkin fiyat bilgilerini sisteme kaydettim.`;
        break;
      case Intent.TEST_DRIVE_BOOKING:
        text = `Test sürüşü randevunuz oluşturuldu. Onay kodunuz SMS ile gönderilecek.`;
        break;
      case Intent.SERVICE_APPOINTMENT:
        text = `Servis randevunuz oluşturuldu. Detaylar telefon numaranıza gönderilecek.`;
        break;
      default:
        text = 'İşleminiz tamamlandı.';
    }

    return { text, confidence: 1.0 };
  }

  /**
   * Deliver AI response (will be converted to speech)
   */
  private async deliverResponse(response: AIResponse): Promise<void> {
    this.logger.debug('Delivering response', { text: response.text });
    // Response will be sent to TTS service and then to customer
    // For now, just log it
  }

  /**
   * Check if required slots are filled
   */
  private areRequiredSlotsFilled(slots: Record<string, any>): boolean {
    // Simplified check - in production, check based on intent requirements
    return Object.keys(slots).length > 0;
  }

  /**
   * Check if should escalate based on user input
   */
  private shouldEscalate(text: string): boolean {
    const escalationKeywords = [
      'danışman',
      'müşteri temsilcisi',
      'insan',
      'yetkili',
      'şikayet',
      'patron',
      'müdür',
    ];

    const lowerText = text.toLowerCase();
    return escalationKeywords.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * Check if user wants to end conversation
   */
  private isEndingConversation(text: string): boolean {
    const endingPhrases = ['hayır', 'yok', 'tamam', 'teşekkür', 'iyi günler', 'hoşçakal', 'kapatabilirim'];

    const lowerText = text.toLowerCase();
    return endingPhrases.some((phrase) => lowerText.includes(phrase));
  }

  /**
   * Escalate to human agent
   */
  async escalate(reason: string): Promise<void> {
    this.logger.warn('Escalating call', { reason });

    this.session.escalated = true;
    this.session.transfer_reason = reason;

    await this.transitionTo(CallState.TRANSFER);

    // Check if within business hours
    if (isBusinessHours()) {
      await this.deliverResponse({
        text: 'Sizi uzman danışmanımıza aktarıyorum. Lütfen bekleyiniz.',
        confidence: 1.0,
      });
      // Perform warm transfer
      this.emit('escalation.triggered', reason);
    } else {
      await this.deliverResponse({
        text: 'Şu anda mesai saatleri dışındayız. En kısa sürede size dönüş yapacağız. İyi günler dilerim.',
        confidence: 1.0,
      });
      // Add to follow-up queue
      await this.end('After hours escalation');
    }
  }

  /**
   * Transition to new state
   */
  private async transitionTo(newState: CallState): Promise<void> {
    const oldState = this.session.state;

    // Validate transition
    if (!STATE_TRANSITIONS[oldState].includes(newState)) {
      this.logger.warn('Invalid state transition attempted', { oldState, newState });
      return;
    }

    this.logger.info('State transition', { from: oldState, to: newState });

    this.session.state = newState;
    await this.saveSession();

    this.emit('state.changed', oldState, newState);
  }

  /**
   * Set state timeout
   */
  private setStateTimeout(): void {
    const timeouts: Record<CallState, number> = {
      [CallState.GREETING]: 10000,
      [CallState.AUTHENTICATE]: 60000,
      [CallState.INTENT_DETECT]: 30000,
      [CallState.SLOT_FILL]: 180000,
      [CallState.EXECUTING]: 30000,
      [CallState.CLARIFY]: 20000,
      [CallState.RESPOND]: 15000,
      [CallState.FOLLOW_UP]: 15000,
      [CallState.CLOSING]: 10000,
      [CallState.TRANSFER]: 30000,
      [CallState.IDLE]: 0,
      [CallState.ENDED]: 0,
    };

    const timeout = timeouts[this.session.state] || 30000;

    if (timeout > 0) {
      this.stateTimeout = setTimeout(() => {
        this.logger.warn('State timeout', { state: this.session.state });
        this.escalate('State timeout');
      }, timeout);
    }
  }

  /**
   * Clear state timeout
   */
  private clearStateTimeout(): void {
    if (this.stateTimeout) {
      clearTimeout(this.stateTimeout);
      this.stateTimeout = null;
    }
  }

  /**
   * End call session
   */
  async end(reason?: string): Promise<void> {
    this.logger.info('Ending call session', { reason });

    this.clearStateTimeout();

    await this.transitionTo(CallState.CLOSING);

    // Deliver closing message
    await this.deliverResponse({
      text: 'Opel\'i aradığınız için teşekkür ederiz. İyi günler dileriz.',
      confidence: 1.0,
    });

    await this.transitionTo(CallState.ENDED);

    // Update session
    this.session.status = CallStatus.COMPLETED;
    this.session.ended_at = Date.now();
    this.session.duration_seconds = Math.floor((this.session.ended_at - this.session.created_at) / 1000);
    this.session.summary = this.aiOrchestrator.generateSummary();

    await this.saveSession();

    // Disconnect AI
    this.aiOrchestrator.disconnect();

    this.emit('call.ended', this.session);
  }

  /**
   * Save session to database
   */
  private async saveSession(): Promise<void> {
    try {
      await dynamoDBService.put(Tables.CALL_SESSIONS, this.session);
    } catch (error) {
      this.logger.error('Failed to save session', error);
    }
  }

  /**
   * Get call session
   */
  getSession(): CallSession {
    return { ...this.session };
  }

  /**
   * Get conversation history
   */
  getConversationHistory() {
    return this.aiOrchestrator.getConversationHistory();
  }
}
