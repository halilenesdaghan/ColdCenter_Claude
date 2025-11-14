# ColdCenter V1.0

Opel yetkili servisleri için tasarlanan AI destekli, ses tabanlı çağrı merkezi çözümü. Proje; doğal Türkçe konuşabilen bir yapay zekâ asistanı ile müşterilerin fiyat, stok, test sürüşü ve servis randevusu ihtiyaçlarını uçtan uca karşılamayı, gerekli durumlarda canlı temsilciye sorunsuz geçiş yapmayı ve tüm etkileşimleri kayıt altına almayı hedefler.

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
- **Node.js** v18.0.0+
- **Docker & Docker Compose**
- **OpenAI API Key** ([Al](https://platform.openai.com/))
- **ElevenLabs API Key** ([Al](https://elevenlabs.io/))

### Kurulum (Otomatik)

```bash
# Repository'yi klonla
git clone <repo-url>
cd ColdCenter_V1.0

# Setup script'ini çalıştır (tüm bağımlılıkları kurar ve servisleri başlatır)
./scripts/setup.sh
```

### Kurulum (Manuel)

```bash
# 1. Bağımlılıkları yükle
cd backend && npm install
cd mock-api && npm install && cd ../..

# 2. Environment dosyası oluştur
cp .env.example .env.local

# 3. .env.local'i düzenle ve API keylerini ekle
# OPENAI_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID

# 4. Docker servisleri başlat
docker-compose up -d dynamodb-local redis mock-api

# 5. Veritabanını initialize et
cd backend && npm run db:init

# 6. Backend'i başlat
npm run dev
```

### Test

```bash
# Health check
curl http://localhost:3000/health

# Araç fiyatı sorgula
curl http://localhost:3000/api/vehicles/Corsa/pricing

# Çağrı başlat
curl -X POST http://localhost:3000/api/calls/start \
  -H "Content-Type: application/json" \
  -d '{"customer_phone": "+905551234567"}'
```

---

## 📋 İş Hedefleri
- **Müşteri deneyimi**: 7/24 ulaşılabilir, doğal diyalog deneyimi ve tutarlı bilgi akışı
- **Operasyon verimliliği**: Tekrarlayan taleplerin otomasyonu, danışman yoğunluğunun dengelenmesi
- **Gelir artırımı**: Test sürüşü ve servis randevularında daha yüksek dönüşüm oranı, outbound teyitlerle iptal azaltma
- **Veri odaklılık**: Çağrı özetleri, aksiyonlar ve kayıtlar üzerinden servis süreçlerinin ölçümlenmesi

## 🎯 Öncelikli Kullanım Senaryoları (MVP - Tier 1)
1. **vehicle_price_inquiry** – Araç fiyat bilgisi sorgulama
2. **vehicle_stock_check** – Stok ve renk durumu kontrolü
3. **test_drive_booking** – Test sürüşü randevusu oluşturma
4. **service_appointment** – Servis randevusu oluşturma
5. **appointment_confirmation** – Outbound randevu teyit çağrıları
6. **Eskalasyon** – 3 başarısız deneme sonrası veya kullanıcı talebiyle canlı danışmana warm transfer (09:00–18:00); mesai dışında follow-up queue'ye ekleme

## 🏗️ Ürün Yetenekleri
- Doğal Türkçe konuşma, bağlam koruma, niyet analizi (OpenAI Realtime GPT-4o)
- ElevenLabs tabanlı TTS/STT ile düşük gecikmeli çift yönlü ses akışı
- Opel stok ve fiyat servisleri ile gerçek zamanlı entegrasyon
- Test sürüşü & servis randevusu planlama, takvim çakışma kontrolü
- Çağrı özetleme, aksiyon kayıtları ve müşteri profil güncelleme
- Dinamik IVR/CLI doğrulama ve müşteri kimlik tespiti
- KVKK uyumluluğu için kayıt, maskeleme ve saklama politikaları

## 🛠️ Teknoloji Yığını
| Katman | Teknoloji |
| --- | --- |
| AI & Diyalog | OpenAI Realtime API (GPT-4o) |
| Ses Servisleri | ElevenLabs TTS/STT, WebRTC/VoIP köprüleri |
| VoIP Provider | Turkcell Business VoIP (SIP/RTP) |
| Veri Katmanı | AWS DynamoDB (metaveri), Amazon S3 (kayıt ve transkriptler) |
| Backend | Node.js 18 LTS + Express.js + Socket.io |
| Altyapı | AWS EU (Frankfurt), lokal docker-compose ile emülasyon |
| Observability | CloudWatch, Custom Metrics, React Dashboard |

## 📐 Mimari Genel Bakış
```
Müşteri ↔ VoIP/PSTN ↔ Speech Gateway ↔ AI Orchestrator ↔ CRM/Servis API'leri
                                  |                    |
                              ElevenLabs          AWS DynamoDB/S3
```
1. **Call Ingestion** – Twilio/VoIP trunk, WebRTC, PSTN köprüleri
2. **Speech Gateway** – Sesin transcription & synthesis işlemleri
3. **AI Orchestrator** – Diyalog state machine, niyet/slot yönetimi, aksiyon kararları
4. **CRM Adapter** – Opel stok, fiyat, randevu API'lerine REST/GraphQL bağlayıcılar
5. **Workflow Engine** – Randevu oluşturma, teyit, tekrar arama kuyrukları
6. **Compliance Layer** – KVKK, loglama, çağrı saklama politikaları

## 🗂️ Proje Yapısı

```
ColdCenter_V1.0/
├── backend/                    # Node.js Backend
│   ├── src/
│   │   ├── core/              # AI Orchestrator, Call Manager
│   │   ├── services/          # Database, Speech, Workflow
│   │   ├── adapters/          # Opel API, Google Calendar
│   │   ├── middleware/        # Express middleware
│   │   ├── models/            # Data models
│   │   ├── utils/             # Helpers, Logger
│   │   ├── config/            # Configuration
│   │   └── index.ts           # Main entry point
│   ├── mock-api/              # Mock Opel API for development
│   ├── tests/                 # Unit, Integration, E2E tests
│   └── scripts/               # Database init, seed scripts
├── frontend/                   # React Dashboard (TBD)
├── infrastructure/             # Terraform, AWS configs
│   ├── terraform/
│   ├── docker/
│   └── scripts/
├── docs/                       # Documentation
│   ├── TECHNICAL_REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   ├── API_DESIGN.md
│   ├── INTEGRATION_SPEC.md
│   ├── database-schema.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   └── DEPLOYMENT.md
├── data/                       # Local data (recordings, transcripts)
├── logs/                       # Application logs
├── secrets/                    # API keys, certificates (gitignored)
├── docker-compose.yml          # Local development setup
├── .env.example                # Environment template
└── README.md
```

## 📖 Proje Dokümantasyonu

### Teknik Dokümantasyon
- **[TECHNICAL_REQUIREMENTS.md](./docs/TECHNICAL_REQUIREMENTS.md)** - Detaylı teknik gereksinimler, performans hedefleri, teknoloji stack
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Sistem mimarisi, bileşen diyagramları, veri akışı
- **[database-schema.md](./docs/database-schema.md)** - DynamoDB tablo şemaları, S3 bucket yapısı, veri modelleri

### Operasyon Dokümantasyonu
- **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Lokal setup, AWS deployment, CI/CD pipeline, rollback stratejileri

### Başlarken
1. **İlk kez mi?** → [DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Lokal Kurulum bölümünü takip edin
2. **Mimari anlama** → [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
3. **Güvenlik gereksinimleri** → [SECURITY.md](./docs/SECURITY.md)
4. **Test yazma** → [TESTING.md](./docs/TESTING.md)

## 🔧 Geliştirme Komutları

### Backend
```bash
cd backend

# Development mode (hot reload)
npm run dev

# Build
npm run build

# Production
npm start

# Tests
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:e2e           # End-to-end tests

# Database
npm run db:init            # Initialize tables
npm run db:seed            # Seed test data

# Linting
npm run lint
npm run lint:fix
npm run format
```

### Docker
```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d backend

# View logs
docker-compose logs -f backend

# Stop all
docker-compose down

# Rebuild
docker-compose build backend
```

## 🧪 Test & Kalite
- **Unit**: Jest (Node.js backend)
- **Entegrasyon**: DynamoDB local, S3 mock, OpenAI/ElevenLabs integration tests
- **E2E**: 5 intent × 3 varyasyon = 15 senaryo (happy path, edge case, error)
- **Load Testing**: Artillery (MVP: 5 concurrent calls, Pilot: 20 concurrent)
- **Başarı Kriteri**: 50 test çağrısı, %80 başarı oranı, 2-5 dakika ortalama süre

## 📊 İzleme & KPI'lar
- Ortalama çağrı süresi, otomatize çözülme oranı, canlı transfer oranı
- Randevu dönüşüm oranı, outbound teyit başarı yüzdesi
- SLA: İlk yanıt < 5 sn, aktarım < 30 sn, toplam round-trip latency < 600 ms
- Alarmlar: API hata oranı >%2, TTS/STT latency >2 sn, Realtime bağlantı düşüşleri

## 🚦 Dağıtım Yol Haritası

### Faz 1: MVP (Lokal - 6-9 Hafta) ✅
- ✅ 5 Tier-1 intent implementation (fiyat, stok, test drive, servis, teyit)
- ✅ Mock Opel Stok API
- ✅ Lokal DynamoDB + file system storage
- ✅ OpenAI Realtime + ElevenLabs entegrasyonu
- ✅ Google Calendar randevu sistemi
- ⏳ 50 test çağrısı başarısı (%80+)

### Faz 2: Pilot (AWS - 9-13 Hafta)
- ⏳ AWS infrastructure (Terraform IaC)
- ⏳ Turkcell VoIP entegrasyonu (SIP/RTP)
- ⏳ Gerçek Opel API bağlantısı
- ⏳ React Dashboard (Material-UI)
- ⏳ CloudWatch monitoring & alarmlar
- ⏳ 200-500 gerçek çağrı pilot testi

### Faz 3: Production (TBD)
- Multi-tenant support (çoklu bayi)
- Auto-scaling & load balancing
- Blue-green deployment
- Cross-region disaster recovery
- Outbound campaign manager

## 🔒 Güvenlik & Uyumluluk

- **Encryption**: TLS 1.2+, AES-256 at rest
- **Authentication**: API keys, IAM roles, JWT for dashboard
- **PII Protection**: Phone/chassis masking in logs
- **KVKK Compliance**:
  - Data retention: 365 days
  - Right to deletion
  - Audit logging
  - Explicit consent for recordings

## 🤝 Katkı Süreci & İletişim
- **Repo akışı**: Feature branch → PR → Code Review → main
- **Issue şablonları**: Feature request, bug, research
- **İletişim kanalları**: Slack `#coldcenter-ai`, haftalık sprint sync
- **Proje sahibi**: Halil Enes Dağhan – `halil@coldcenter.ai`

## 📝 Lisans & Uygulama
- Şirket içi kullanım (proprietary)
- KVKK, GDPR ve Opel kurumsal güvenlik yönergelerine uyum zorunludur

---

## 🐛 Sorun Giderme

### Ortak Sorunlar

**DynamoDB bağlanamıyor**
```bash
docker-compose restart dynamodb-local
docker ps | grep dynamodb
```

**Backend başlamıyor**
```bash
# API key'leri kontrol et
cat .env.local | grep API_KEY

# Logları incele
tail -f backend/logs/combined.log
```

**Port kullanımda**
```bash
# İşlemi bul ve kapat
lsof -i :3000
kill -9 <PID>
```

Daha fazla sorun giderme için: [DEPLOYMENT.md - Troubleshooting](./docs/DEPLOYMENT.md#troubleshooting)

---

## 📚 Ek Kaynaklar

- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [ElevenLabs API Docs](https://elevenlabs.io/docs)
- [AWS DynamoDB Best Practices](https://docs.aws.amazon.com/dynamodb/latest/developerguide/best-practices.html)
- [KVKK Law (Turkish)](https://www.kvkk.gov.tr/)

---

**Not**: En güncel gereksinimler Product Backlog dokümanında tutulacaktır; README, mühendislik ekibi için yüksek seviye referans niteliğindedir.

---

**Proje Durumu**: 🟢 Active Development (MVP Phase)
**Son Güncelleme**: 2025-11-13
**Versiyon**: 1.0.0
