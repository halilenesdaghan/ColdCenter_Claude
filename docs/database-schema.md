# ColdCenter V1.0 - Database Schema

## Document Information
- **Version**: 1.0.0
- **Last Updated**: 2025-11-13
- **Database**: AWS DynamoDB + Amazon S3

---

## 1. DynamoDB Tables

### Table 1: `call_sessions`
Stores all call session metadata and status.

**Primary Key**:
- `call_id` (HASH) - Unique call identifier

**Attributes**:
```typescript
interface CallSession {
  call_id: string;                    // PK: CALL-20251113-001
  customer_phone: string;             // GSI: +905551234567
  customer_name?: string;
  customer_id?: string;               // CRM customer ID
  direction: 'inbound' | 'outbound';
  status: 'active' | 'completed' | 'failed' | 'transferred';
  intent?: string;                    // Detected intent
  slots?: Record<string, any>;        // Extracted slots
  escalated: boolean;
  transfer_reason?: string;
  agent_id?: string;                  // If transferred
  duration_seconds?: number;
  created_at: number;                 // Unix timestamp
  ended_at?: number;
  recording_url?: string;             // S3 URL
  transcript_url?: string;            // S3 URL
  summary?: string;
}
```

**Global Secondary Indexes**:
1. **customer_phone_index**
   - HASH: `customer_phone`
   - RANGE: `created_at`
   - Purpose: Query all calls from a customer

2. **status_created_index**
   - HASH: `status`
   - RANGE: `created_at`
   - Purpose: Query active calls

**Sample Record**:
```json
{
  "call_id": "CALL-20251113-001",
  "customer_phone": "+905551234567",
  "customer_name": "Ahmet Yılmaz",
  "customer_id": "CUST-12345",
  "direction": "inbound",
  "status": "completed",
  "intent": "test_drive_booking",
  "slots": {
    "vehicle_model": "Corsa",
    "preferred_date": "2025-11-15",
    "preferred_time": "14:00"
  },
  "escalated": false,
  "duration_seconds": 180,
  "created_at": 1699881600,
  "ended_at": 1699881780,
  "recording_url": "s3://coldcenter-prod/call-recordings/2025/11/13/CALL-20251113-001.wav",
  "transcript_url": "s3://coldcenter-prod/transcripts/2025/11/13/CALL-20251113-001.json",
  "summary": "Customer booked test drive for Opel Corsa on Nov 15 at 2 PM."
}
```

---

### Table 2: `call_transcripts`
Stores conversation turns for each call.

**Primary Key**:
- `call_id` (HASH)
- `sequence` (RANGE) - Turn number

**Attributes**:
```typescript
interface CallTranscript {
  call_id: string;
  sequence: number;
  speaker: 'customer' | 'ai' | 'agent';
  text: string;
  timestamp: number;
  confidence?: number;
  language: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  intent?: string;
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
  "language": "tr",
  "sentiment": "neutral",
  "intent": "vehicle_price_inquiry"
}
```

---

### Table 3: `appointments`
Stores all appointments (test drive, service).

**Primary Key**:
- `appointment_id` (HASH)

**Attributes**:
```typescript
interface Appointment {
  appointment_id: string;
  call_id: string;
  customer_phone: string;
  customer_name: string;
  customer_email?: string;
  type: 'test_drive' | 'service';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

  // Test Drive specific
  vehicle_model?: string;
  dealer_id?: string;

  // Service specific
  vehicle_plate?: string;
  chassis_number?: string;
  service_type?: string;
  service_description?: string;

  appointment_date: string;           // ISO 8601 date
  appointment_time: string;           // HH:MM format
  duration_minutes: number;
  confirmation_code: string;

  calendar_event_id?: string;         // Google Calendar ID
  reminder_sent: boolean;
  confirmation_call_completed: boolean;

  created_at: number;
  updated_at: number;
  completed_at?: number;
}
```

**Global Secondary Indexes**:
1. **customer_phone_index**
   - HASH: `customer_phone`
2. **appointment_date_index**
   - HASH: `appointment_date`
   - Purpose: Find all appointments on a specific date
3. **status_index**
   - HASH: `status`
   - RANGE: `appointment_date`
   - Purpose: Find pending/confirmed appointments

**Sample Record**:
```json
{
  "appointment_id": "APPT-20251113-001",
  "call_id": "CALL-20251113-001",
  "customer_phone": "+905551234567",
  "customer_name": "Ahmet Yılmaz",
  "customer_email": "ahmet@example.com",
  "type": "test_drive",
  "status": "confirmed",
  "vehicle_model": "Corsa",
  "dealer_id": "IST-001",
  "appointment_date": "2025-11-15",
  "appointment_time": "14:00",
  "duration_minutes": 60,
  "confirmation_code": "TD-XYZ789",
  "calendar_event_id": "google_cal_event_123",
  "reminder_sent": false,
  "confirmation_call_completed": false,
  "created_at": 1699881700,
  "updated_at": 1699881700
}
```

---

### Table 4: `follow_up_queue`
Stores pending follow-up tasks (outbound calls, reminders).

**Primary Key**:
- `task_id` (HASH)

**Attributes**:
```typescript
interface FollowUpTask {
  task_id: string;
  task_type: 'appointment_confirmation' | 'appointment_reminder' | 'callback' | 'survey';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: number;                   // 1 (high) to 5 (low)

  related_call_id?: string;
  related_appointment_id?: string;
  customer_phone: string;
  customer_name: string;

  scheduled_at: number;               // Unix timestamp
  attempt_count: number;
  max_attempts: number;
  last_attempt_at?: number;

  task_data: Record<string, any>;    // Task-specific data

  created_at: number;
  updated_at: number;
  completed_at?: number;
}
```

**Global Secondary Indexes**:
1. **scheduled_at_index**
   - HASH: `status`
   - RANGE: `scheduled_at`
   - Purpose: Find pending tasks due now

**Sample Record**:
```json
{
  "task_id": "TASK-20251113-001",
  "task_type": "appointment_confirmation",
  "status": "pending",
  "priority": 2,
  "related_appointment_id": "APPT-20251113-001",
  "customer_phone": "+905551234567",
  "customer_name": "Ahmet Yılmaz",
  "scheduled_at": 1699881600,
  "attempt_count": 0,
  "max_attempts": 3,
  "task_data": {
    "appointment_date": "2025-11-15",
    "appointment_time": "14:00",
    "vehicle_model": "Corsa"
  },
  "created_at": 1699881500,
  "updated_at": 1699881500
}
```

---

### Table 5: `customers`
Customer profile data (aggregated from calls and CRM).

**Primary Key**:
- `customer_id` (HASH)

**Attributes**:
```typescript
interface Customer {
  customer_id: string;
  customer_phone: string;             // GSI
  customer_name: string;
  customer_email?: string;

  // Preferences
  preferred_language: string;
  preferred_contact_method: 'phone' | 'sms' | 'email';
  is_vip: boolean;

  // History
  total_calls: number;
  total_appointments: number;
  last_call_date?: number;
  last_appointment_date?: number;

  // Vehicles
  owned_vehicles?: Array<{
    plate: string;
    model: string;
    year: number;
    chassis_number: string;
  }>;

  // CRM Integration
  crm_customer_id?: string;
  crm_sync_at?: number;

  created_at: number;
  updated_at: number;
}
```

**Global Secondary Indexes**:
1. **customer_phone_index**
   - HASH: `customer_phone`
   - Purpose: Lookup by phone number

---

### Table 6: `analytics_daily`
Daily aggregated metrics for reporting.

**Primary Key**:
- `date` (HASH) - Format: YYYY-MM-DD
- `metric_name` (RANGE)

**Attributes**:
```typescript
interface DailyMetric {
  date: string;
  metric_name: string;
  metric_value: number;
  breakdown?: Record<string, number>;
  created_at: number;
}
```

**Sample Records**:
```json
[
  {
    "date": "2025-11-13",
    "metric_name": "total_calls",
    "metric_value": 127,
    "breakdown": {
      "inbound": 100,
      "outbound": 27
    },
    "created_at": 1699920000
  },
  {
    "date": "2025-11-13",
    "metric_name": "automation_rate",
    "metric_value": 0.82,
    "breakdown": {
      "resolved": 104,
      "escalated": 23
    },
    "created_at": 1699920000
  }
]
```

---

## 2. S3 Bucket Structure

### Bucket: `coldcenter-production`

```
s3://coldcenter-production/
│
├── call-recordings/
│   └── {year}/
│       └── {month}/
│           └── {day}/
│               ├── {call_id}.wav                    # Original recording
│               └── {call_id}.meta.json              # Metadata
│
├── transcripts/
│   └── {year}/
│       └── {month}/
│           └── {day}/
│               └── {call_id}.json                   # Full transcript
│
├── call-summaries/
│   └── {year}/
│       └── {month}/
│           └── daily-summary-{date}.json            # Daily summary
│
├── backups/
│   └── dynamodb/
│       └── {table_name}/
│           └── {timestamp}.json                     # Table backup
│
└── exports/
    └── {export_id}/
        └── calls-export-{timestamp}.csv             # CSV export
```

### Recording Metadata Format

**File**: `{call_id}.meta.json`
```json
{
  "call_id": "CALL-20251113-001",
  "format": "wav",
  "codec": "pcm_s16le",
  "sample_rate": 16000,
  "channels": 1,
  "duration_seconds": 180,
  "file_size_bytes": 5760000,
  "recorded_at": "2025-11-13T10:30:00Z",
  "checksum_sha256": "abc123...",
  "encryption": "AES256",
  "lifecycle_policy": "standard_30d_glacier"
}
```

### Transcript Format

**File**: `{call_id}.json`
```json
{
  "call_id": "CALL-20251113-001",
  "language": "tr",
  "duration_seconds": 180,
  "turns": [
    {
      "sequence": 1,
      "speaker": "ai",
      "text": "Merhaba, Opel'e hoş geldiniz. Size nasıl yardımcı olabilirim?",
      "start_time": 0.0,
      "end_time": 3.5,
      "confidence": 1.0
    },
    {
      "sequence": 2,
      "speaker": "customer",
      "text": "Merhaba, Corsa'nın fiyatını öğrenmek istiyorum.",
      "start_time": 4.2,
      "end_time": 7.8,
      "confidence": 0.95,
      "sentiment": "neutral"
    }
  ],
  "summary": "Customer inquired about Opel Corsa pricing and booked a test drive.",
  "key_entities": {
    "vehicle_model": "Corsa",
    "intent": "test_drive_booking"
  }
}
```

---

## 3. Lifecycle Policies

### S3 Lifecycle Rules

**Rule 1: call-recordings**
```json
{
  "Rules": [
    {
      "Id": "archive-old-recordings",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "call-recordings/"
      },
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "GLACIER"
        },
        {
          "Days": 180,
          "StorageClass": "DEEP_ARCHIVE"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

**Rule 2: transcripts**
```json
{
  "Rules": [
    {
      "Id": "archive-old-transcripts",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "transcripts/"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

### DynamoDB TTL (Time-To-Live)

**Table: `call_sessions`**
- TTL Attribute: `ttl`
- Expiration: 365 days after `created_at`

**Table: `follow_up_queue`**
- TTL Attribute: `ttl`
- Expiration: 30 days after `completed_at`

---

## 4. Data Access Patterns

### Pattern 1: Get Call Details
```
Query: call_sessions
Key: call_id = "CALL-20251113-001"
Result: Single item with full call metadata
```

### Pattern 2: Get Customer Call History
```
Query: call_sessions.customer_phone_index
KeyConditionExpression: customer_phone = "+905551234567"
SortKey: created_at DESC
Limit: 10
Result: Last 10 calls from customer
```

### Pattern 3: Get Active Calls
```
Query: call_sessions.status_created_index
KeyConditionExpression: status = "active"
Result: All currently active calls
```

### Pattern 4: Get Today's Appointments
```
Query: appointments.appointment_date_index
KeyConditionExpression: appointment_date = "2025-11-13"
Result: All appointments for today
```

### Pattern 5: Get Pending Follow-Ups
```
Query: follow_up_queue.scheduled_at_index
KeyConditionExpression:
  status = "pending" AND scheduled_at <= {current_timestamp}
Result: Tasks due for execution
```

---

## 5. Capacity Planning

### DynamoDB Estimated Usage

#### MVP Phase (50-100 calls/day)
- **Storage**: ~100 MB
- **Read Capacity**: On-demand (avg 5-10 RCU)
- **Write Capacity**: On-demand (avg 5-10 WCU)
- **Monthly Cost**: ~$5-10

#### Pilot Phase (200-500 calls/day)
- **Storage**: ~500 MB
- **Read Capacity**: On-demand (avg 20-50 RCU)
- **Write Capacity**: On-demand (avg 20-50 WCU)
- **Monthly Cost**: ~$20-30

#### Production Phase (2,000-5,000 calls/day)
- **Storage**: ~5 GB
- **Read Capacity**: On-demand (avg 100-200 RCU)
- **Write Capacity**: On-demand (avg 100-200 WCU)
- **Monthly Cost**: ~$100-150

### S3 Estimated Usage

#### MVP Phase
- **Storage**: ~10 GB/month (call recordings + transcripts)
- **Requests**: ~5,000/month
- **Monthly Cost**: ~$0.25 (Standard) + $0.01 (requests) = $0.26

#### Production Phase
- **Storage**: ~500 GB/month
- **Requests**: ~100,000/month
- **Monthly Cost**: ~$12 (Standard) + ~$5 (Glacier) + ~$0.50 (requests) = ~$17.50

---

## 6. Backup & Recovery

### Backup Strategy

**DynamoDB**:
- **Point-in-Time Recovery (PITR)**: Enabled (last 35 days)
- **On-Demand Backups**: Daily at 02:00 UTC
- **Backup Retention**: 30 days
- **Cross-Region Replication**: Replicate to eu-west-1

**S3**:
- **Versioning**: Enabled
- **Cross-Region Replication**: Replicate to eu-west-1
- **Backup Frequency**: Continuous (via versioning)

### Recovery Procedures

**Scenario 1: Accidental Data Deletion**
1. Restore from PITR to specific timestamp
2. Create new table from backup
3. Validate data integrity
4. Cutover traffic to restored table

**RTO**: 30 minutes
**RPO**: 5 minutes

**Scenario 2: Table Corruption**
1. Restore from latest on-demand backup
2. Replay missed writes from application logs
3. Validate data consistency

**RTO**: 1 hour
**RPO**: 24 hours (daily backup)

---

## 7. Security & Compliance

### Encryption

**At Rest**:
- DynamoDB: AWS managed KMS encryption
- S3: Server-side encryption (SSE-KMS)

**In Transit**:
- TLS 1.2+ for all API calls
- VPC endpoints for DynamoDB/S3 access

### Access Control

**IAM Policies**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:eu-central-1:*:table/call_sessions"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::coldcenter-production/*"
    }
  ]
}
```

### KVKK Compliance

**Data Subject Rights**:
1. **Right to Access**: Provide all data via API endpoint
2. **Right to Deletion**: Delete all records and recordings
3. **Right to Rectification**: Update customer profile data
4. **Right to Portability**: Export data in JSON/CSV format

**Implementation**:
```typescript
class KVKKService {
  async exportCustomerData(customerId: string): Promise<object> {
    // Collect all customer data
    const calls = await this.db.queryCalls(customerId);
    const appointments = await this.db.queryAppointments(customerId);
    const recordings = await this.s3.listRecordings(customerId);

    return {
      customer_profile: {...},
      call_history: calls,
      appointments: appointments,
      recordings: recordings
    };
  }

  async deleteCustomerData(customerId: string): Promise<void> {
    // Delete from all tables and S3
    await this.db.deleteCustomer(customerId);
    await this.db.deleteCustomerCalls(customerId);
    await this.db.deleteCustomerAppointments(customerId);
    await this.s3.deleteCustomerRecordings(customerId);
  }
}
```

---

## 8. Initialization Scripts

### Create DynamoDB Tables

```bash
npm run db:init
```

**Script**: `backend/scripts/init-dynamodb.ts`

### Load Sample Data

```bash
npm run db:seed
```

**Script**: `backend/scripts/seed-data.ts`

---

**Document Approval**:
- [ ] Database Architect
- [ ] Backend Lead
- [ ] Security Team

**Version History**:
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-13 | Data Team | Initial release |
