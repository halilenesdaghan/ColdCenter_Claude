# ColdCenter V1.0 - System Architecture

## Document Information
- **Version**: 1.0.0
- **Last Updated**: 2025-11-13
- **Owner**: Architecture Team
- **Status**: Active

---

## 1. Architecture Overview

ColdCenter V1.0 follows a **modular, event-driven microservices architecture** designed for scalability, maintainability, and resilience. The system is built on AWS cloud infrastructure with a focus on low-latency real-time communication.

### 1.1 Architectural Principles

1. **Separation of Concerns**: Each component has a single, well-defined responsibility
2. **Stateless Services**: Backend services are stateless for easy horizontal scaling
3. **Event-Driven**: Components communicate via events and message queues
4. **API-First**: All integrations follow REST/WebSocket API contracts
5. **Security by Design**: Encryption, authentication, and audit logging at every layer
6. **Observability**: Comprehensive logging, metrics, and tracing
7. **Fail-Safe**: Graceful degradation and circuit breakers for external dependencies

### 1.2 High-Level System Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL INTERFACES                               │
├────────────────────────────────────────────────────────────────────────────┤
│  PSTN/SIP        │   Web Dashboard   │   Opel APIs    │  Google Calendar  │
└────────┬──────────────────┬────────────────┬──────────────────┬────────────┘
         │                  │                │                  │
    ┌────▼──────────────────▼────────────────▼──────────────────▼────┐
    │                    API GATEWAY / LOAD BALANCER                  │
    │                     (AWS ALB + Route 53)                        │
    └────────────────────────────┬───────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
    ┌────▼────────┐      ┌──────▼──────┐       ┌───────▼────────┐
    │   Speech    │      │     AI      │       │   Dashboard    │
    │   Gateway   │◀────▶│ Orchestrator│       │    Backend     │
    │ (ElevenLabs)│      │ (GPT-4o RT) │       │   (Express)    │
    └─────────────┘      └──────┬──────┘       └────────────────┘
                                 │
                 ┌───────────────┼───────────────────────┐
                 │               │                       │
         ┌───────▼──────┐ ┌─────▼─────────┐   ┌────────▼────────┐
         │ CRM Adapter  │ │   Workflow    │   │     Storage     │
         │ (Opel APIs)  │ │    Engine     │   │   (DynamoDB)    │
         └──────────────┘ └───────────────┘   └─────────────────┘
                                                        │
                                                ┌───────▼────────┐
                                                │   S3 Storage   │
                                                │  (Recordings)  │
                                                └────────────────┘
```

---

## 2. Component Architecture

### 2.1 Call Ingestion Layer

#### 2.1.1 VoIP Gateway
**Purpose**: Bridge between PSTN/SIP network and our application.

**Responsibilities**:
- Accept incoming SIP calls from Turkcell trunk
- Extract CLI (Caller ID), DNIS (dialed number)
- Establish RTP audio streams
- Handle DTMF tones for IVR navigation
- Forward call to Speech Gateway via WebRTC

**Technology Stack**:
- **Provider**: Turkcell Business VoIP
- **Protocol**: SIP (Session Initiation Protocol)
- **Audio Codec**: G.711 μ-law, Opus (16kHz)
- **Signaling**: SIP over TLS
- **Media**: SRTP (Secure RTP)

**Key Endpoints**:
- `POST /api/voip/inbound` - Receive new inbound call
- `POST /api/voip/outbound` - Initiate outbound call
- `GET /api/voip/status/:call_id` - Get call status
- `POST /api/voip/transfer` - Transfer call to agent
- `POST /api/voip/hangup` - End call

**Data Flow**:
```
Customer → PSTN → Turkcell SIP Trunk → VoIP Gateway
                                            ↓
                                    Extract CLI/DNIS
                                            ↓
                                    Authenticate Call
                                            ↓
                                    Create Call Session
                                            ↓
                                    Forward to Speech Gateway
```

#### 2.1.2 WebRTC Bridge
**Purpose**: Enable web-based testing and future web dialer support.

**Responsibilities**:
- Establish WebRTC peer connections
- Handle ICE candidate exchange
- Proxy audio streams to Speech Gateway
- Maintain NAT traversal

**Technology**:
- **Library**: `simple-peer` (Node.js)
- **Signaling**: Socket.io
- **STUN/TURN**: Coturn server

---

### 2.2 Speech Gateway

#### 2.2.1 Component Overview
The Speech Gateway is responsible for converting between audio streams and text, enabling the AI to "hear" and "speak".

**Core Functions**:
1. **STT (Speech-to-Text)**: Convert customer audio → text
2. **TTS (Text-to-Speech)**: Convert AI text → audio
3. **Audio Processing**: Noise reduction, normalization, echo cancellation
4. **Stream Management**: Handle real-time bidirectional audio

**Architecture**:
```
┌──────────────────────────────────────────────────────────┐
│                    Speech Gateway                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐        ┌──────────────┐               │
│  │   Audio     │───────▶│  STT Engine  │──────────┐    │
│  │  Ingestion  │        │ (ElevenLabs) │          │    │
│  └─────────────┘        └──────────────┘          │    │
│        ▲                                           ▼    │
│        │                                    ┌───────────┴──┐
│        │                                    │   AI Orch    │
│        │                                    │ (Text I/O)   │
│        │                                    └───────────┬──┘
│  ┌─────┴───────┐        ┌──────────────┐          │    │
│  │   Audio     │◀───────│  TTS Engine  │◀─────────┘    │
│  │   Output    │        │ (ElevenLabs) │               │
│  └─────────────┘        └──────────────┘               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 2.2.2 STT (Speech-to-Text) Pipeline

**Flow**:
```
Audio Stream (PCM 16kHz) → Audio Processor → ElevenLabs STT API
                                                      ↓
                               Transcript with timestamps
                                                      ↓
                                   Send to AI Orchestrator
```

**Implementation** (`backend/src/services/speech/stt-service.ts`):
```typescript
class STTService {
  async transcribe(audioBuffer: Buffer): Promise<Transcript> {
    // 1. Pre-process audio
    const processed = await this.audioProcessor.normalize(audioBuffer);

    // 2. Send to ElevenLabs
    const response = await this.elevenlabs.transcribe({
      audio: processed,
      language: 'tr',
      model: 'eleven_multilingual_v2'
    });

    // 3. Post-process transcript
    return {
      text: response.text,
      confidence: response.confidence,
      words: response.words, // Word-level timestamps
      language: 'tr',
      isFinal: true
    };
  }
}
```

**Error Handling**:
- Fallback to OpenAI Whisper if ElevenLabs fails
- Retry logic: 3 attempts with exponential backoff
- Partial transcripts for long utterances

#### 2.2.3 TTS (Text-to-Speech) Pipeline

**Flow**:
```
AI Response Text → TTS Queue → ElevenLabs TTS API
                                        ↓
                              Audio Stream (MP3/PCM)
                                        ↓
                            Convert to RTP/WebRTC format
                                        ↓
                                Stream to Customer
```

**Implementation** (`backend/src/services/speech/tts-service.ts`):
```typescript
class TTSService {
  async synthesize(text: string, voiceId: string): Promise<AudioStream> {
    // 1. Text normalization
    const normalized = this.normalizeText(text);

    // 2. Generate audio
    const audioStream = await this.elevenlabs.textToSpeechStream({
      text: normalized,
      voice_id: voiceId,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    });

    // 3. Convert format (MP3 → PCM 16kHz)
    const pcmStream = await this.audioConverter.mp3ToPCM(audioStream);

    return pcmStream;
  }
}
```

**Voice Configuration**:
- **Voice ID**: Custom Opel brand voice (trained with ElevenLabs Voice Lab)
- **Language**: Turkish (tr-TR)
- **Speed**: 1.0x (natural pace)
- **Emotion**: Professional, friendly

---

### 2.3 AI Orchestrator

#### 2.3.1 Component Overview
The "brain" of the system - manages conversation flow, intent detection, slot filling, and decision-making.

**Core Responsibilities**:
1. **Conversation Management**: Maintain dialogue state, context, history
2. **Intent Detection**: Classify user utterances into intent categories
3. **Slot Filling**: Extract required parameters from user input
4. **Action Execution**: Call external APIs (CRM, Calendar, etc.)
5. **Response Generation**: Craft natural Turkish responses
6. **Escalation Logic**: Decide when to transfer to human agent

**Architecture**:
```
┌────────────────────────────────────────────────────────────┐
│                   AI Orchestrator                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │         OpenAI Realtime API Connection           │    │
│  │            (WebSocket GPT-4o)                     │    │
│  └───────────────────┬──────────────────────────────┘    │
│                      │                                     │
│  ┌───────────────────▼────────────────────────────┐      │
│  │         Session Manager                        │      │
│  │  - Active sessions (call_id → state)          │      │
│  │  - Context buffer (last 10 turns)             │      │
│  │  - User profile cache                          │      │
│  └───────────────────┬────────────────────────────┘      │
│                      │                                     │
│  ┌───────────────────▼────────────────────────────┐      │
│  │         Intent Classifier                      │      │
│  │  - NLU pipeline                                │      │
│  │  - Confidence scoring                          │      │
│  │  - Ambiguity resolution                        │      │
│  └───────────────────┬────────────────────────────┘      │
│                      │                                     │
│  ┌───────────────────▼────────────────────────────┐      │
│  │         Slot Filling Engine                    │      │
│  │  - Required vs optional slots                 │      │
│  │  - Validation rules                            │      │
│  │  - Prompt for missing slots                    │      │
│  └───────────────────┬────────────────────────────┘      │
│                      │                                     │
│  ┌───────────────────▼────────────────────────────┐      │
│  │         Action Executor                        │      │
│  │  - Function calling                            │      │
│  │  - API adapter routing                         │      │
│  │  - Result validation                           │      │
│  └───────────────────┬────────────────────────────┘      │
│                      │                                     │
│  ┌───────────────────▼────────────────────────────┐      │
│  │         Response Generator                     │      │
│  │  - Template selection                          │      │
│  │  - Personalization                             │      │
│  │  - Tone adjustment                             │      │
│  └────────────────────────────────────────────────┘      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

#### 2.3.2 Conversation State Machine

Each call session follows a state machine:

```
                    ┌──────────┐
                    │   IDLE   │
                    └────┬─────┘
                         │ Incoming Call
                         ▼
                    ┌──────────┐
                    │ GREETING │ "Merhaba, Opel'e hoş geldiniz..."
                    └────┬─────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ AUTHENTICATE │ CLI lookup / Name verification
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ INTENT_DETECT│ "Size nasıl yardımcı olabilirim?"
                  └──────┬───────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ SLOT_FILL│    │ EXECUTING│    │ CLARIFY  │
  └────┬─────┘    └────┬─────┘    └────┬─────┘
       │               │                │
       └───────────────┼────────────────┘
                       │
                       ▼
                 ┌──────────┐
                 │ RESPOND  │ Generate & deliver response
                 └────┬─────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │FOLLOW_UP │  │ CLOSING  │  │ TRANSFER │
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │             │              │
       └─────────────┴──────────────┘
                     │
                     ▼
                ┌──────────┐
                │ ENDED    │
                └──────────┘
```

**State Definitions**:

| State | Description | Max Duration | Exit Conditions |
|-------|-------------|--------------|-----------------|
| GREETING | Initial greeting | 10s | User responds |
| AUTHENTICATE | Verify customer identity | 60s | Authenticated / Skip |
| INTENT_DETECT | Understand user goal | 30s | Intent classified |
| SLOT_FILL | Collect required info | 180s | All slots filled |
| EXECUTING | Call external APIs | 30s | Action completed |
| RESPOND | Deliver answer | 15s | Response played |
| CLOSING | End conversation | 15s | User confirms |
| TRANSFER | Escalate to agent | 30s | Agent connected |

#### 2.3.3 Intent Classification System

**Tier-1 Intents** (MVP):
```typescript
enum Intent {
  VEHICLE_PRICE_INQUIRY = 'vehicle_price_inquiry',
  VEHICLE_STOCK_CHECK = 'vehicle_stock_check',
  TEST_DRIVE_BOOKING = 'test_drive_booking',
  SERVICE_APPOINTMENT = 'service_appointment',
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
  ESCALATION = 'escalation',
  OUT_OF_SCOPE = 'out_of_scope'
}
```

**Classification Method**:
1. **Primary**: OpenAI function calling with predefined schemas
2. **Fallback**: Keyword matching + ML classifier
3. **Confidence Threshold**: 0.7 (below this → ask for clarification)

**Example Intent Schema** (`vehicle_price_inquiry`):
```json
{
  "name": "vehicle_price_inquiry",
  "description": "User wants to know the price of a vehicle",
  "parameters": {
    "type": "object",
    "properties": {
      "vehicle_model": {
        "type": "string",
        "enum": ["Corsa", "Astra", "Grandland", "Mokka", "Combo"],
        "description": "The Opel vehicle model"
      },
      "trim_level": {
        "type": "string",
        "enum": ["Elegance", "GS Line", "Ultimate"],
        "description": "Trim/package level"
      },
      "payment_method": {
        "type": "string",
        "enum": ["cash", "lease", "finance"],
        "description": "How the customer plans to pay"
      }
    },
    "required": ["vehicle_model"]
  }
}
```

#### 2.3.4 Slot Filling Engine

**Validation Rules**:
```typescript
interface SlotValidator {
  name: string;
  type: 'string' | 'date' | 'phone' | 'email' | 'enum';
  required: boolean;
  validate: (value: any) => boolean;
  errorMessage: string;
  promptTemplate: string;
}

const validators: Record<string, SlotValidator> = {
  phone: {
    name: 'customer_phone',
    type: 'phone',
    required: true,
    validate: (v) => /^(\+90|0)?5\d{9}$/.test(v),
    errorMessage: 'Geçerli bir cep telefonu numarası giriniz.',
    promptTemplate: 'Cep telefonu numaranızı paylaşabilir misiniz?'
  },
  preferred_date: {
    name: 'preferred_date',
    type: 'date',
    required: true,
    validate: (v) => {
      const date = new Date(v);
      return date > new Date() && date < addDays(new Date(), 60);
    },
    errorMessage: 'Randevu tarihi bugünden sonra ve en fazla 60 gün içinde olmalı.',
    promptTemplate: 'Hangi tarihte randevu almak istersiniz?'
  }
};
```

---

### 2.4 CRM Adapter Layer

#### 2.4.1 Component Overview
Abstracts external CRM systems (Opel APIs) behind a unified interface.

**Responsibilities**:
- Authenticate with Opel APIs
- Query vehicle stock, pricing, service schedules
- Submit appointments and reservations
- Handle rate limiting and retries
- Cache responses to reduce API calls

**Architecture Pattern**: **Adapter Pattern**
```
┌───────────────────────────────────────────────┐
│            CRM Adapter Interface              │
│  - getVehiclePrice(model, trim)              │
│  - checkStock(model, color)                   │
│  - createAppointment(type, details)           │
└────────────────┬──────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│  Opel  │  │  Mock  │  │ Future │
│  API   │  │  API   │  │  CRMs  │
└────────┘  └────────┘  └────────┘
```

#### 2.4.2 Opel API Integration

**Base URL**: `https://api.opel.com.tr/v1` (production)

**Authentication**:
- **Method**: OAuth 2.0 Client Credentials
- **Token Endpoint**: `/oauth/token`
- **Token Lifetime**: 1 hour
- **Refresh Strategy**: Proactive refresh at 55 minutes

**Endpoints**:

1. **Get Vehicle Pricing**
```http
GET /vehicles/{model}/pricing
Authorization: Bearer {token}

Response:
{
  "model": "Corsa",
  "trim_levels": [
    {
      "name": "Elegance",
      "base_price": 750000,
      "currency": "TRY",
      "available_colors": ["red", "white", "black"]
    }
  ]
}
```

2. **Check Stock Availability**
```http
GET /inventory/availability?model={model}&color={color}&dealer={id}
Authorization: Bearer {token}

Response:
{
  "available": true,
  "quantity": 3,
  "delivery_estimate_days": 7,
  "dealer_locations": [
    {"id": "IST-001", "name": "Opel Istanbul Yetkili Servisi"}
  ]
}
```

3. **Create Appointment**
```http
POST /appointments
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "test_drive",
  "customer": {
    "name": "Ahmet Yılmaz",
    "phone": "+905551234567",
    "email": "ahmet@example.com"
  },
  "vehicle_model": "Corsa",
  "preferred_datetime": "2025-11-15T14:00:00Z",
  "dealer_id": "IST-001"
}

Response:
{
  "appointment_id": "APPT-123456",
  "status": "confirmed",
  "confirmation_code": "XYZ789"
}
```

#### 2.4.3 Mock API (Development)

For local development, a mock API simulates Opel APIs:

**Location**: `backend/mock-api/`
**Port**: 3001
**Features**:
- Realistic response latencies (100-500ms)
- Random stock availability
- Simulated booking conflicts
- Error injection for testing

---

### 2.5 Workflow Engine

#### 2.5.1 Component Overview
Manages long-running workflows like appointment scheduling, follow-ups, and outbound campaigns.

**Core Workflows**:
1. **Appointment Booking**: Test drive, service appointment
2. **Follow-Up Calls**: Confirmation, reminders
3. **Outbound Campaigns**: Customer surveys, promotions
4. **Escalation Routing**: Transfer to human agents

**Technology**: **Bull Queue** (Redis-backed job queue)

**Architecture**:
```
┌──────────────────────────────────────────────┐
│            Workflow Engine                   │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────┐    │
│  │      Job Scheduler (Cron)          │    │
│  │  - Scan follow_up_queue            │    │
│  │  - Trigger outbound calls          │    │
│  │  - Send reminders                  │    │
│  └─────────────┬──────────────────────┘    │
│                │                             │
│  ┌─────────────▼──────────────────────┐    │
│  │      Bull Queue (Redis)            │    │
│  │                                     │    │
│  │  ┌───────────────┐                 │    │
│  │  │ appointment   │                 │    │
│  │  │ confirmation  │                 │    │
│  │  └───────┬───────┘                 │    │
│  │          │                          │    │
│  │  ┌───────▼───────┐                 │    │
│  │  │   reminder    │                 │    │
│  │  └───────┬───────┘                 │    │
│  │          │                          │    │
│  │  ┌───────▼───────┐                 │    │
│  │  │ follow_up     │                 │    │
│  │  └───────────────┘                 │    │
│  └────────────────────────────────────┘    │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │      Job Processors                │    │
│  │  - Process queue jobs              │    │
│  │  - Invoke AI for outbound calls    │    │
│  │  - Update job status               │    │
│  └────────────────────────────────────┘    │
│                                              │
└──────────────────────────────────────────────┘
```

#### 2.5.2 Appointment Booking Workflow

**Flow**:
```
1. User requests appointment
   ↓
2. AI collects required slots
   ↓
3. Check availability (Google Calendar API)
   ↓
4. Create appointment record (DynamoDB)
   ↓
5. Send confirmation SMS/Email
   ↓
6. Schedule reminder job (24h before)
   ↓
7. Schedule confirmation call job (48h before)
```

**Implementation**:
```typescript
class AppointmentWorkflow {
  async bookTestDrive(details: TestDriveRequest): Promise<AppointmentResult> {
    // 1. Validate input
    this.validator.validate(details);

    // 2. Check calendar availability
    const available = await this.calendar.checkAvailability(
      details.preferred_date,
      details.dealer_id
    );

    if (!available) {
      const alternatives = await this.calendar.suggestAlternatives(
        details.preferred_date,
        3 // suggest 3 alternatives
      );
      return { status: 'unavailable', alternatives };
    }

    // 3. Create appointment
    const appointment = await this.db.createAppointment({
      call_id: details.call_id,
      type: 'test_drive',
      customer: details.customer,
      vehicle_model: details.vehicle_model,
      datetime: details.preferred_date,
      status: 'confirmed'
    });

    // 4. Send confirmation
    await this.notificationService.sendSMS({
      to: details.customer.phone,
      message: `Test sürüşü randevunuz ${formatDate(details.preferred_date)} olarak oluşturuldu. Onay kodu: ${appointment.confirmation_code}`
    });

    // 5. Schedule reminder
    await this.queue.add('reminder', {
      appointment_id: appointment.id,
      send_at: subHours(details.preferred_date, 24)
    });

    // 6. Schedule confirmation call
    await this.queue.add('confirmation_call', {
      appointment_id: appointment.id,
      call_at: subHours(details.preferred_date, 48)
    });

    return { status: 'confirmed', appointment };
  }
}
```

---

### 2.6 Data Storage Architecture

#### 2.6.1 DynamoDB Schema Design

**Table 1: `call_sessions`**
Stores active and historical call sessions.

```json
{
  "TableName": "call_sessions",
  "KeySchema": [
    {"AttributeName": "call_id", "KeyType": "HASH"}
  ],
  "AttributeDefinitions": [
    {"AttributeName": "call_id", "AttributeType": "S"},
    {"AttributeName": "customer_phone", "AttributeType": "S"},
    {"AttributeName": "created_at", "AttributeType": "N"}
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "customer_phone_index",
      "KeySchema": [
        {"AttributeName": "customer_phone", "KeyType": "HASH"},
        {"AttributeName": "created_at", "KeyType": "RANGE"}
      ]
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
```

**Sample Record**:
```json
{
  "call_id": "CALL-20251113-001",
  "customer_phone": "+905551234567",
  "customer_name": "Ahmet Yılmaz",
  "direction": "inbound",
  "status": "completed",
  "intent": "test_drive_booking",
  "duration_seconds": 180,
  "escalated": false,
  "created_at": 1699881600,
  "ended_at": 1699881780,
  "recording_url": "s3://coldcenter-recordings/2025/11/13/CALL-20251113-001.wav"
}
```

**Table 2: `call_transcripts`**
Stores conversation transcripts.

```json
{
  "TableName": "call_transcripts",
  "KeySchema": [
    {"AttributeName": "call_id", "KeyType": "HASH"},
    {"AttributeName": "sequence", "KeyType": "RANGE"}
  ],
  "AttributeDefinitions": [
    {"AttributeName": "call_id", "AttributeType": "S"},
    {"AttributeName": "sequence", "AttributeType": "N"}
  ]
}
```

**Sample Record**:
```json
{
  "call_id": "CALL-20251113-001",
  "sequence": 5,
  "speaker": "customer",
  "text": "Corsa'nın fiyatı ne kadar?",
  "timestamp": 1699881625,
  "confidence": 0.95,
  "language": "tr"
}
```

**Table 3: `appointments`**
Stores all appointments (test drive, service).

```json
{
  "TableName": "appointments",
  "KeySchema": [
    {"AttributeName": "appointment_id", "KeyType": "HASH"}
  ],
  "AttributeDefinitions": [
    {"AttributeName": "appointment_id", "AttributeType": "S"},
    {"AttributeName": "customer_phone", "AttributeType": "S"},
    {"AttributeName": "appointment_date", "AttributeType": "S"}
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "customer_phone_index",
      "KeySchema": [
        {"AttributeName": "customer_phone", "KeyType": "HASH"}
      ]
    },
    {
      "IndexName": "date_index",
      "KeySchema": [
        {"AttributeName": "appointment_date", "KeyType": "HASH"}
      ]
    }
  ]
}
```

**Table 4: `follow_up_queue`**
Stores pending follow-up tasks.

```json
{
  "TableName": "follow_up_queue",
  "KeySchema": [
    {"AttributeName": "task_id", "KeyType": "HASH"}
  ],
  "AttributeDefinitions": [
    {"AttributeName": "task_id", "AttributeType": "S"},
    {"AttributeName": "scheduled_at", "AttributeType": "N"},
    {"AttributeName": "status", "AttributeType": "S"}
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "scheduled_at_index",
      "KeySchema": [
        {"AttributeName": "status", "KeyType": "HASH"},
        {"AttributeName": "scheduled_at", "KeyType": "RANGE"}
      ]
    }
  ]
}
```

#### 2.6.2 S3 Bucket Structure

```
s3://coldcenter-production/
├── call-recordings/
│   ├── 2025/
│   │   └── 11/
│   │       └── 13/
│   │           ├── CALL-20251113-001.wav
│   │           └── CALL-20251113-002.wav
├── transcripts/
│   └── 2025/
│       └── 11/
│           └── 13/
│               ├── CALL-20251113-001.json
│               └── CALL-20251113-002.json
├── call-summaries/
│   └── 2025/
│       └── 11/
│           └── daily-summary-2025-11-13.json
└── backups/
    └── dynamodb/
        └── 2025-11-13-call_sessions.json
```

**Lifecycle Policies**:
- **Active recordings** (0-30 days): S3 Standard
- **Archive recordings** (31-180 days): S3 Glacier
- **Long-term archive** (181+ days): S3 Deep Archive
- **Deletion**: After 365 days (or per KVKK request)

---

## 3. Security Architecture

### 3.1 Authentication & Authorization

**Service-to-Service**:
- API keys stored in AWS Secrets Manager
- Rotation every 90 days
- Different keys per environment (dev, staging, prod)

**Dashboard Users**:
- JWT tokens with 1-hour expiration
- Refresh tokens with 30-day expiration
- Role-based access control (RBAC)

**Roles**:
| Role | Permissions |
|------|-------------|
| Admin | Full access to all data and settings |
| Supervisor | View all calls, export reports |
| Agent | View own transferred calls only |
| Viewer | Dashboard metrics only (no PII) |

### 3.2 Encryption

**In Transit**:
- TLS 1.2+ for all HTTP/WebSocket connections
- SRTP for VoIP media streams
- Certificate pinning for critical APIs

**At Rest**:
- DynamoDB: AWS KMS encryption
- S3: Server-side encryption (SSE-KMS)
- Secrets Manager: Automatic encryption

### 3.3 PII Masking

**Automatic masking** in logs and non-production environments:
- Phone numbers: `+90 5XX XXX XX**`
- Chassis numbers: `W0L****JU******`
- Credit card numbers: Full redaction
- Names: First name only + last initial (e.g., "Ahmet Y.")

**Implementation**:
```typescript
class PIIMasker {
  maskPhone(phone: string): string {
    return phone.replace(/(\+90)(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 XX**');
  }

  maskChassis(chassis: string): string {
    return chassis.replace(/^(.{3}).*(.{2})$/, '$1****$2');
  }
}
```

---

## 4. Observability Architecture

### 4.1 Logging Strategy

**Log Levels**:
- **ERROR**: System failures, unhandled exceptions
- **WARN**: Degraded performance, retries, fallback activations
- **INFO**: Successful operations, state changes
- **DEBUG**: Detailed traces (dev/staging only)

**Structured Logging Format** (JSON):
```json
{
  "timestamp": "2025-11-13T10:30:45.123Z",
  "level": "INFO",
  "service": "ai-orchestrator",
  "call_id": "CALL-20251113-001",
  "event": "intent_detected",
  "intent": "test_drive_booking",
  "confidence": 0.92,
  "duration_ms": 450
}
```

**Log Aggregation**:
- **Target**: AWS CloudWatch Logs
- **Retention**: 30 days
- **Export**: S3 for long-term analysis

### 4.2 Metrics & Monitoring

**Key Metrics**:
```typescript
// Call Metrics
gauge('active_calls', 5);
counter('total_calls_today', 127);
histogram('call_duration_seconds', 180);

// AI Metrics
histogram('intent_detection_latency_ms', 450);
gauge('intent_confidence_score', 0.92);
counter('escalations_today', 12);

// API Metrics
histogram('crm_api_latency_ms', 320);
counter('crm_api_errors', 2);
gauge('crm_api_success_rate', 0.98);

// Speech Metrics
histogram('tts_latency_ms', 180);
histogram('stt_latency_ms', 250);
counter('speech_api_errors', 1);
```

**Dashboard Panels**:
1. **Overview**: Active calls, success rate, escalation rate
2. **Performance**: Latency charts (p50, p95, p99)
3. **Errors**: Error rate by service, recent errors
4. **Business**: Appointments booked, conversion rate, customer satisfaction

### 4.3 Alerting

**Critical Alerts** (PagerDuty):
- API error rate > 5%
- Active calls stuck > 10 minutes
- DynamoDB throttling errors
- Speech API downtime

**Warning Alerts** (Slack):
- API latency p95 > 2s
- Escalation rate > 30%
- Queue backlog > 50 items

---

## 5. Scalability & Performance

### 5.1 Horizontal Scaling

**Backend Services**:
- Containerized with Docker
- Deployed on AWS ECS Fargate
- Auto-scaling policy: CPU > 70% or Memory > 80%
- Min instances: 2, Max instances: 20

**Load Balancing**:
- AWS Application Load Balancer (ALB)
- Health check endpoint: `GET /health`
- Sticky sessions for WebSocket connections

### 5.2 Caching Strategy

**Redis Cache**:
- **Session state**: TTL 30 minutes
- **User profiles**: TTL 10 minutes
- **Vehicle pricing**: TTL 5 minutes
- **Stock availability**: TTL 2 minutes

**Eviction Policy**: LRU (Least Recently Used)

### 5.3 Rate Limiting

**API Rate Limits**:
- OpenAI Realtime: 100 concurrent connections
- ElevenLabs TTS: 500 requests/minute
- Opel APIs: 1000 requests/hour
- Google Calendar: 10 requests/second

**Implementation**: Token bucket algorithm with Redis

---

## 6. Disaster Recovery

### 6.1 Backup Strategy

**DynamoDB**:
- Point-in-Time Recovery (PITR) enabled
- On-demand backups: Daily at 02:00 UTC
- Cross-region replication: eu-west-1 (Ireland) as secondary

**S3**:
- Versioning enabled
- Cross-region replication (CRR) to eu-west-1
- Lifecycle policies for cost optimization

### 6.2 Failover Plan

**RTO (Recovery Time Objective)**: 30 minutes
**RPO (Recovery Point Objective)**: 5 minutes

**Failover Procedure**:
1. Detect failure (health checks, alarms)
2. Route 53 DNS failover to secondary region
3. Restore latest DynamoDB snapshot if needed
4. Validate data integrity
5. Resume operations

---

## 7. Deployment Architecture

### 7.1 Environment Strategy

| Environment | Purpose | Infrastructure | Deployment |
|------------|---------|----------------|------------|
| Local | Development | Docker Compose | Manual (`npm run dev`) |
| Staging | Integration Testing | AWS (t3.small) | Auto (push to `staging` branch) |
| Production | Live System | AWS (t3.medium+) | Manual (GitHub Release) |

### 7.2 CI/CD Pipeline

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Developer   │─────▶│   GitHub     │─────▶│   GitHub     │
│  Push Code   │      │  Repository  │      │   Actions    │
└──────────────┘      └──────────────┘      └──────┬───────┘
                                                    │
                                                    ▼
                                            ┌───────────────┐
                                            │  Run Tests    │
                                            │  - Unit       │
                                            │  - Integration│
                                            └───────┬───────┘
                                                    │
                                              Pass  │  Fail
                                    ┌───────────────┴────────────┐
                                    ▼                            ▼
                            ┌───────────────┐          ┌─────────────┐
                            │  Build Docker │          │   Notify    │
                            │    Images     │          │  Developer  │
                            └───────┬───────┘          └─────────────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │   Push to ECR │
                            └───────┬───────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │ Deploy to ECS │
                            │   (Staging)   │
                            └───────┬───────┘
                                    │
                            ┌───────▼────────┐
                            │ Run E2E Tests  │
                            └───────┬────────┘
                                    │
                              Pass  │  Fail
                    ┌───────────────┴────────────┐
                    ▼                            ▼
            ┌───────────────┐          ┌─────────────┐
            │ Await Manual  │          │   Rollback  │
            │   Approval    │          └─────────────┘
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │  Deploy to    │
            │  Production   │
            │ (Blue-Green)  │
            └───────────────┘
```

---

## 8. Architecture Decision Records (ADRs)

### ADR-001: Use OpenAI Realtime API for Conversational AI
**Status**: Accepted
**Context**: Need low-latency, natural Turkish conversations
**Decision**: Use OpenAI GPT-4o Realtime API
**Consequences**: Excellent Turkish support, function calling, but vendor lock-in

### ADR-002: DynamoDB for Primary Database
**Status**: Accepted
**Context**: Need serverless, scalable database for call metadata
**Decision**: Use DynamoDB with on-demand billing
**Consequences**: Low operational overhead, pay-per-use, but requires careful schema design

### ADR-003: ElevenLabs for TTS/STT
**Status**: Accepted
**Context**: Need high-quality Turkish voice synthesis
**Decision**: Use ElevenLabs Multilingual V2 with custom voice
**Consequences**: Best Turkish voice quality, but limited to Professional plan quota

### ADR-004: Bull Queue for Workflow Management
**Status**: Accepted
**Context**: Need reliable job queue for outbound calls and reminders
**Decision**: Use Bull (Redis-backed queue)
**Consequences**: Proven reliability, easy to monitor, but requires Redis infrastructure

---

## 9. Future Architecture Enhancements

### Phase 2 (Pilot → Production)
- [ ] Multi-tenancy support (multiple dealers)
- [ ] Real-time agent dashboard with live call monitoring
- [ ] Advanced sentiment analysis (detect frustration, urgency)
- [ ] Voice biometrics for customer authentication

### Phase 3 (Production Scaling)
- [ ] Multi-region deployment (Istanbul + Frankfurt)
- [ ] WebRTC support for web-based calling
- [ ] AI-powered agent assist (suggest responses to human agents)
- [ ] Predictive analytics (forecast call volume, optimize staffing)

---

## 10. Appendix

### 10.1 Technology Comparison Matrix

| Category | Chosen | Alternatives Considered | Reasoning |
|----------|--------|-------------------------|-----------|
| AI Model | OpenAI GPT-4o Realtime | Google Dialogflow, Azure Bot Service | Best Turkish support, function calling |
| TTS | ElevenLabs | Google TTS, Azure TTS | Most natural Turkish voice |
| Database | DynamoDB | PostgreSQL, MongoDB | Serverless, scalable, low ops |
| Queue | Bull (Redis) | AWS SQS, RabbitMQ | Redis already used for caching |
| Frontend | React + MUI | Vue, Angular | Team familiarity, rich ecosystem |

### 10.2 System Capacity Planning

| Metric | MVP | Pilot | Production |
|--------|-----|-------|------------|
| Concurrent Calls | 5 | 20 | 100+ |
| Daily Calls | 50-100 | 200-500 | 2,000-5,000 |
| DynamoDB RCU/WCU | On-demand | On-demand | On-demand |
| S3 Storage | 10 GB/month | 50 GB/month | 500 GB/month |
| EC2 Instances | 1 t3.small | 2 t3.medium | 4-10 t3.large |
| Redis Memory | 512 MB | 2 GB | 8 GB |
| Monthly AWS Cost | $50-100 | $200-300 | $800-1,500 |

---

**Document Approval**:
- [ ] Chief Architect
- [ ] Technical Lead
- [ ] DevOps Lead
- [ ] Security Lead

**Version History**:
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-13 | Architecture Team | Initial release |
