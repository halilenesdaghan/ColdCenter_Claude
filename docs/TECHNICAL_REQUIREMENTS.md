# ColdCenter V1.0 - Technical Requirements Document

## Document Information
- **Version**: 1.0.0
- **Last Updated**: 2025-11-13
- **Owner**: Engineering Team
- **Status**: Active

---

## 1. Executive Summary

ColdCenter V1.0 is an AI-powered, voice-based call center solution designed for Opel authorized service centers. The system combines OpenAI's Realtime API with ElevenLabs' speech services to deliver natural Turkish conversations for handling customer inquiries, appointments, and escalations.

### Key Objectives
- **Customer Experience**: 24/7 availability with natural dialogue and consistent information
- **Operational Efficiency**: Automate repetitive requests, balance consultant workload
- **Revenue Growth**: Higher conversion rates for test drives and service appointments
- **Data-Driven**: Comprehensive call analytics, summaries, and recordings

---

## 2. System Architecture Requirements

### 2.1 High-Level Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Customer  │────▶│ VoIP Gateway │────▶│   Speech    │
│   (PSTN)    │◀────│  (Turkcell)  │◀────│   Gateway   │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │ AI Orchestrator │
                                        │  (GPT-4o RT)    │
                                        └────────┬────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────┐
                    ▼                            ▼                    ▼
            ┌──────────────┐           ┌──────────────┐     ┌───────────────┐
            │ CRM Adapter  │           │   Workflow   │     │   Storage     │
            │ (Opel APIs)  │           │    Engine    │     │ (DynamoDB/S3) │
            └──────────────┘           └──────────────┘     └───────────────┘
```

### 2.2 Core Components

#### 2.2.1 Call Ingestion Layer
- **Technology**: Twilio/Turkcell VoIP SIP Trunk
- **Protocols**: SIP, RTP, WebRTC
- **Requirements**:
  - Support for G.711 μ-law/A-law codecs
  - Opus codec for high-quality audio (16kHz, 24kHz)
  - CLI (Caller Line Identification) capture
  - DTMF tone detection for IVR navigation

#### 2.2.2 Speech Gateway
- **TTS Provider**: ElevenLabs Multilingual V2
- **STT Provider**: ElevenLabs Speech-to-Text
- **Requirements**:
  - Turkish language support (tr-TR)
  - Real-time streaming (< 300ms latency)
  - Voice customization (Opel brand voice)
  - Fallback to OpenAI Whisper if ElevenLabs fails
  - Audio format: 16kHz PCM, mono channel

#### 2.2.3 AI Orchestrator
- **Model**: OpenAI GPT-4o Realtime API
- **Capabilities**:
  - Natural Turkish conversation
  - Context retention across conversation turns
  - Intent classification and slot filling
  - Sentiment analysis (escalation triggers)
  - Function calling for external API integration
  - Conversation summarization
- **Requirements**:
  - WebSocket connection management
  - Session state persistence
  - Multi-turn dialogue handling
  - Interruption detection and handling
  - Background noise filtering

#### 2.2.4 CRM Adapter
- **Target Systems**: Opel Stock API, Pricing API, Service Scheduling
- **Protocol**: REST API (JSON)
- **Requirements**:
  - Authentication (OAuth 2.0 / API Key)
  - Rate limiting and circuit breaker
  - Response caching (5-minute TTL for stock/pricing)
  - Retry logic with exponential backoff
  - Mock mode for development

#### 2.2.5 Workflow Engine
- **Functions**:
  - Appointment scheduling (test drive, service)
  - Outbound call queue management
  - Follow-up scheduling
  - Escalation routing
- **Requirements**:
  - Google Calendar API integration
  - Conflict detection and resolution
  - SLA tracking (24-hour follow-up)
  - Priority queue for VIP customers

#### 2.2.6 Data Storage Layer
- **Primary Database**: AWS DynamoDB
- **Object Storage**: Amazon S3
- **Requirements**:
  - Call metadata: DynamoDB (GSI for quick queries)
  - Audio recordings: S3 with versioning
  - Transcripts: S3 + DynamoDB index
  - Call summaries: DynamoDB
  - Encryption at rest (KMS)
  - PITR (Point-in-Time Recovery) for DynamoDB

---

## 3. Performance Requirements

### 3.1 Latency Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| First Response Time | < 3s | < 5s |
| TTS Generation | < 200ms | < 500ms |
| STT Transcription | < 300ms | < 600ms |
| AI Response Generation | < 1s | < 2s |
| API Call (CRM) | < 500ms | < 1s |
| Total Round-Trip | < 2s | < 3s |
| Hot Transfer | < 10s | < 30s |

### 3.2 Throughput Requirements

#### MVP Phase (Local)
- **Concurrent Calls**: 5
- **Daily Call Volume**: 50-100
- **Peak Hour Load**: 10 calls

#### Pilot Phase (AWS)
- **Concurrent Calls**: 20
- **Daily Call Volume**: 200-500
- **Peak Hour Load**: 50 calls

#### Production Phase
- **Concurrent Calls**: 100+
- **Daily Call Volume**: 2,000-5,000
- **Peak Hour Load**: 300 calls

### 3.3 Availability & Reliability

- **Uptime SLA**: 99.5% (MVP), 99.9% (Production)
- **Mean Time to Recovery (MTTR)**: < 30 minutes
- **Data Durability**: 99.999999999% (S3 11 nines)
- **Backup Frequency**: Continuous (DynamoDB PITR), Daily snapshots

---

## 4. Technology Stack

### 4.1 Backend

```json
{
  "runtime": "Node.js 18 LTS",
  "framework": "Express.js 4.x",
  "language": "TypeScript 5.x",
  "realtime_communication": "Socket.io 4.x",
  "testing": "Jest 29.x",
  "linting": "ESLint + Prettier"
}
```

**Key Libraries**:
- `openai`: OpenAI Node.js SDK for Realtime API
- `axios`: HTTP client for CRM APIs
- `ws`: WebSocket client/server
- `dotenv`: Environment configuration
- `winston`: Structured logging
- `joi`: Schema validation
- `bull`: Queue management (Redis-backed)
- `aws-sdk`: DynamoDB, S3, KMS integration

### 4.2 Frontend

```json
{
  "framework": "React 18.x",
  "language": "TypeScript 5.x",
  "ui_library": "Material-UI (MUI) 5.x",
  "state_management": "Zustand / React Query",
  "routing": "React Router 6.x",
  "charts": "Recharts",
  "build_tool": "Vite"
}
```

### 4.3 Infrastructure

| Component | Technology |
|-----------|-----------|
| Cloud Provider | AWS (eu-central-1 Frankfurt) |
| Compute | EC2 (t3.medium for backend) |
| Container Orchestration | Docker + Docker Compose (local), ECS Fargate (prod) |
| Database | DynamoDB (on-demand billing) |
| Object Storage | S3 (Standard + Glacier) |
| CDN | CloudFront |
| Load Balancer | ALB (Application Load Balancer) |
| DNS | Route 53 |
| Secrets Management | AWS Secrets Manager |
| Monitoring | CloudWatch + Custom Metrics |
| IaC | Terraform 1.5+ |

### 4.4 External Services

| Service | Purpose | Pricing Tier |
|---------|---------|--------------|
| OpenAI Realtime API | AI conversation engine | Pay-per-use (GPT-4o) |
| ElevenLabs | TTS/STT | Professional ($99/mo) |
| Turkcell VoIP | PSTN/SIP trunking | Enterprise plan |
| Google Calendar API | Appointment scheduling | Free (Workspace) |

---

## 5. Functional Requirements

### 5.1 Tier-1 Intents (MVP)

#### 5.1.1 vehicle_price_inquiry
**User Goal**: Get pricing information for a specific vehicle model.

**Required Slots**:
- `vehicle_model` (e.g., "Corsa", "Astra", "Grandland")
- `trim_level` (optional: "Elegance", "GS Line", "Ultimate")
- `payment_method` (optional: "cash", "lease", "finance")

**Success Criteria**:
- Retrieve accurate pricing from Opel API
- Provide base price + optional equipment pricing
- Offer to schedule a test drive

**Sample Dialogue**:
```
Customer: "Merhaba, Corsa'nın fiyatı ne kadar?"
AI: "Merhaba! Yeni Opel Corsa modeline mi ilgi duyuyorsunuz? Hangi donanım seviyesini merak ediyorsunuz?"
Customer: "GS Line paketini düşünüyorum."
AI: "Corsa GS Line'ın güncel fiyatı 850.000 TL'dir. Peşin ödeme için bu ay özel %5 indirim kampanyamız var. Test sürüşü randevusu almak ister misiniz?"
```

#### 5.1.2 vehicle_stock_check
**User Goal**: Check availability of a specific vehicle model and color.

**Required Slots**:
- `vehicle_model`
- `color` (e.g., "kırmızı", "beyaz", "siyah")
- `location` (dealer location, optional)

**Success Criteria**:
- Query Opel stock API
- Provide availability status (in-stock, 2-4 weeks, special order)
- Offer reservation if available

#### 5.1.3 test_drive_booking
**User Goal**: Schedule a test drive appointment.

**Required Slots**:
- `vehicle_model`
- `preferred_date` (ISO 8601 format)
- `preferred_time` (e.g., "morning", "afternoon", "14:00")
- `customer_name`
- `customer_phone`
- `driver_license_info` (validation required)

**Success Criteria**:
- Check Google Calendar availability
- Avoid double-booking
- Send SMS/email confirmation
- Add to CRM system

**Business Rules**:
- Test drives only 09:00-17:00, Mon-Sat
- Minimum 1-hour slots
- Maximum 3 test drives per day
- Require valid driver's license (min 2 years exp)

#### 5.1.4 service_appointment
**User Goal**: Book a service/maintenance appointment.

**Required Slots**:
- `customer_name`
- `vehicle_plate` or `chassis_number`
- `service_type` ("periodic maintenance", "repair", "tire change", etc.)
- `preferred_date`
- `preferred_time`
- `description` (optional: detailed issue description)

**Success Criteria**:
- Validate customer ownership (CLI or chassis lookup)
- Check service bay availability
- Estimate service duration
- Send confirmation + reminder (24h before)

#### 5.1.5 appointment_confirmation (Outbound)
**User Goal**: Confirm an upcoming appointment.

**Required Slots**:
- `customer_name`
- `appointment_id`
- `appointment_type` ("test_drive" or "service")
- `appointment_datetime`

**Success Criteria**:
- Greet customer politely
- Confirm appointment details
- Handle rescheduling if needed
- Update appointment status in DB

**Sample Dialogue**:
```
AI: "Merhaba, Opel yetkili servisinden arıyorum. [Customer Name] Bey ile görüşüyorum, değil mi?"
Customer: "Evet, benim."
AI: "Yarın saat 14:00'te test sürüşü randevunuz bulunuyor. Randevunuzu teyit etmek için aradım."
Customer: "Evet, geleceğim."
AI: "Harika! Yarın görüşmek üzere, iyi günler dilerim."
```

### 5.2 Escalation & Transfer

**Triggers**:
1. **User Request**: "Müşteri temsilcisi ile görüşmek istiyorum"
2. **Failed Intent**: 3 consecutive failed attempts to understand user
3. **Complexity**: Request outside AI capabilities (e.g., warranty dispute, custom order)
4. **Sentiment**: Detected anger/frustration (tone analysis)
5. **VIP Customer**: Flagged customer profile

**Transfer Process**:
- **Warm Transfer** (09:00-18:00):
  1. AI: "Sizi danışmanımıza bağlıyorum, lütfen bekleyin."
  2. Internal announcement to agent with conversation summary
  3. Transfer call with context
- **After Hours** (18:00-09:00):
  1. AI: "Şu anda mesai saatleri dışındayız. Sizinle en kısa sürede iletişime geçeceğiz."
  2. Add to `follow_up_queue` table
  3. Next-day priority routing

---

## 6. Non-Functional Requirements

### 6.1 Security

- **Encryption**:
  - TLS 1.2+ for all network communication
  - AES-256 encryption for data at rest (KMS-managed keys)
  - End-to-end encryption for audio streams
- **Authentication**:
  - API key authentication for external services
  - IAM roles for AWS resource access
  - JWT tokens for dashboard users
- **PII Protection**:
  - Mask phone numbers in logs (format: +90 5XX XXX XX**)
  - Mask chassis numbers (format: W0L****JU******)
  - Redact credit card info if mentioned
- **Compliance**:
  - KVKK (Turkish GDPR) compliance
  - Explicit consent for call recording
  - Right to deletion (30-day window)

### 6.2 Scalability

- **Horizontal Scaling**:
  - Stateless backend services (ECS Fargate)
  - Load balancing across multiple instances
  - Auto-scaling based on CPU/memory utilization
- **Database**:
  - DynamoDB on-demand scaling
  - S3 unlimited storage
  - Redis cluster for session caching

### 6.3 Observability

- **Logging**:
  - Structured JSON logs (Winston)
  - CloudWatch Logs with 30-day retention
  - Log levels: ERROR, WARN, INFO, DEBUG
  - Correlation IDs for distributed tracing
- **Metrics**:
  - Call volume (per hour/day)
  - Success rate by intent
  - Average call duration
  - Escalation rate
  - API latency (p50, p95, p99)
- **Alerting**:
  - Critical: API error rate > 5%
  - Warning: TTS latency > 1s
  - Info: Daily summary report

### 6.4 Maintainability

- **Code Quality**:
  - TypeScript strict mode
  - 80%+ test coverage
  - ESLint + Prettier enforcement
  - Pre-commit hooks (Husky)
- **Documentation**:
  - Inline code comments (JSDoc)
  - API documentation (OpenAPI 3.0)
  - Architecture Decision Records (ADRs)
  - Runbooks for common operations

---

## 7. Development & Deployment

### 7.1 Local Development

**Prerequisites**:
- Node.js 18 LTS
- Docker Desktop
- Git
- AWS CLI (for testing AWS integrations)

**Setup**:
```bash
git clone <repo-url>
cd ColdCenter_V1.0
npm install
cp .env.example .env.local
docker-compose up -d dynamodb-local
npm run db:init
npm run dev
```

### 7.2 Deployment Pipeline

```
Feature Branch → Pull Request → Code Review → Main Branch
     ↓                                              ↓
   Local Tests                              Automated CI/CD
                                                     ↓
                                            ┌────────────────┐
                                            │   Staging      │
                                            │ (integration)  │
                                            └───────┬────────┘
                                                    ↓
                                            Manual Approval
                                                    ↓
                                            ┌────────────────┐
                                            │  Production    │
                                            │  (blue-green)  │
                                            └────────────────┘
```

**CI/CD Tools**:
- GitHub Actions for CI
- Terraform for infrastructure
- Docker for containerization
- AWS CodeDeploy for deployment

### 7.3 Environment Strategy

| Environment | Purpose | Infrastructure |
|-------------|---------|----------------|
| Local | Development | Docker Compose |
| Staging | Integration testing | AWS (t3.small) |
| Production | Live system | AWS (t3.medium+) |

---

## 8. Risk Assessment & Mitigation

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| OpenAI API downtime | Medium | High | Fallback to rule-based responses |
| ElevenLabs quota exceeded | Low | High | Monitor usage, implement rate limiting |
| VoIP connectivity issues | Medium | Critical | Redundant SIP trunks |
| DynamoDB throttling | Low | Medium | On-demand billing mode |
| S3 storage costs | Medium | Low | Lifecycle policies (Glacier after 30 days) |

### 8.2 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Poor AI understanding | Medium | High | Continuous training with real conversations |
| Customer dissatisfaction | Low | High | Easy escalation to human agent |
| KVKK compliance violation | Low | Critical | Regular security audits |
| Unexpected API costs | Medium | Medium | Budget alerts, usage caps |

---

## 9. Success Metrics

### 9.1 MVP Phase (Week 6-9)

- [ ] 50 test calls completed
- [ ] 80%+ automation rate (resolved without escalation)
- [ ] < 5 second first response time
- [ ] < 3 minute average call duration
- [ ] 0 critical bugs

### 9.2 Pilot Phase (Week 9-13)

- [ ] 200-500 real calls handled
- [ ] 75%+ customer satisfaction (CSAT)
- [ ] 60%+ appointment conversion rate
- [ ] < 2 second average latency
- [ ] 99.5% uptime

### 9.3 Production Targets

- [ ] 2,000+ daily calls
- [ ] 85%+ automation rate
- [ ] 70%+ appointment show-up rate
- [ ] < 20% escalation rate
- [ ] 99.9% uptime

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

For each feature to be considered "done":
1. Code implemented with TypeScript
2. Unit tests written (80%+ coverage)
3. Integration tests passed
4. Documentation updated
5. Code reviewed and approved
6. Deployed to staging
7. QA tested
8. Security scan passed

### 10.2 Go-Live Checklist

- [ ] All Tier-1 intents functional
- [ ] 50 test calls successful
- [ ] Security audit completed
- [ ] KVKK compliance verified
- [ ] Monitoring dashboards configured
- [ ] Runbooks documented
- [ ] On-call schedule established
- [ ] Rollback plan tested

---

## 11. Appendix

### 11.1 Glossary

- **CLI**: Caller Line Identification (phone number of caller)
- **DTMF**: Dual-Tone Multi-Frequency (phone keypad tones)
- **GSI**: Global Secondary Index (DynamoDB)
- **IVR**: Interactive Voice Response
- **KVKK**: Turkish Personal Data Protection Law (like GDPR)
- **PII**: Personally Identifiable Information
- **PSTN**: Public Switched Telephone Network
- **RTP**: Real-time Transport Protocol
- **SIP**: Session Initiation Protocol
- **TTS**: Text-to-Speech
- **STT**: Speech-to-Text

### 11.2 References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/guides/realtime)
- [ElevenLabs API Documentation](https://elevenlabs.io/docs)
- [AWS DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [KVKK Law (Turkish)](https://www.kvkk.gov.tr/)

---

**Document Approval**:
- [ ] Technical Lead
- [ ] Product Owner
- [ ] Security Team
- [ ] DevOps Team

**Version History**:
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-13 | Engineering Team | Initial release |
