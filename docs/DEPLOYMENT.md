# ColdCenter V1.0 - Deployment Guide

## Document Information
- **Version**: 1.0.0
- **Last Updated**: 2025-11-13
- **Target Audience**: DevOps, Backend Engineers

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Environment Configuration](#environment-configuration)
4. [Docker Deployment](#docker-deployment)
5. [Database Initialization](#database-initialization)
6. [Testing the Setup](#testing-the-setup)
7. [AWS Production Deployment](#aws-production-deployment)
8. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

### Required Software
- **Node.js**: v18.0.0 or later ([Download](https://nodejs.org/))
- **npm**: v9.0.0 or later (comes with Node.js)
- **Docker**: v20.10+ and Docker Compose v2.0+ ([Download](https://www.docker.com/))
- **Git**: Latest version

### Required API Keys (for production)
- **OpenAI API Key**: Get from [OpenAI Platform](https://platform.openai.com/)
- **ElevenLabs API Key**: Get from [ElevenLabs](https://elevenlabs.io/)
- **AWS Account**: For production deployment (DynamoDB, S3)
- **Google Service Account**: For Google Calendar integration (optional for MVP)

### System Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 10GB free space
- **OS**: Linux, macOS, or Windows with WSL2

---

## 2. Local Development Setup

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd ColdCenter_Claude
```

### Step 2: Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install mock API dependencies
cd mock-api
npm install

cd ../..
```

### Step 3: Create Environment File

```bash
# Copy example environment file
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```bash
# Minimum required for local development
NODE_ENV=development
PORT=3000

# OpenAI (required)
OPENAI_API_KEY=sk-proj-your-key-here

# ElevenLabs (required for TTS/STT)
ELEVENLABS_API_KEY=your-elevenlabs-key-here
ELEVENLABS_VOICE_ID=your-voice-id

# Local DynamoDB
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_TABLE_PREFIX=coldcenter_dev_

# Local paths
LOCAL_S3_BASE_PATH=./data

# Mock Opel API (enabled by default)
USE_MOCK_OPEL_API=true
OPEL_API_URL=http://localhost:3001

# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=your-64-char-hex-key-here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Step 4: Start Infrastructure with Docker

```bash
# Start DynamoDB Local, Redis, and Mock API
docker-compose up -d dynamodb-local redis mock-api
```

Wait for services to be ready (~10 seconds):

```bash
# Check services are running
docker-compose ps
```

Expected output:
```
NAME                    STATUS      PORTS
coldcenter-dynamodb     Up          0.0.0.0:8000->8000/tcp
coldcenter-redis        Up          0.0.0.0:6379->6379/tcp
coldcenter-mock-api     Up          0.0.0.0:3001->3001/tcp
```

### Step 5: Initialize Database

```bash
cd backend
npm run db:init
```

Expected output:
```
✅ Created table: coldcenter_dev_call_sessions
✅ Created table: coldcenter_dev_call_transcripts
✅ Created table: coldcenter_dev_appointments
✅ Created table: coldcenter_dev_follow_up_queue
✅ Created table: coldcenter_dev_customers
✅ Created table: coldcenter_dev_analytics_daily
✅ All tables initialized successfully
```

### Step 6: (Optional) Seed Test Data

```bash
npm run db:seed
```

### Step 7: Start Backend Development Server

```bash
npm run dev
```

Expected output:
```
🚀 ColdCenter backend started on port 3000
📊 Environment: development
🔧 Mock Opel API: Enabled
📞 WebSocket server ready for real-time communication
🧪 Development mode - API available at http://localhost:3000
```

---

## 3. Environment Configuration

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | development | Environment (development/staging/production) |
| `PORT` | No | 3000 | Server port |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key |
| `ELEVENLABS_API_KEY` | Yes | - | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | Yes | - | ElevenLabs voice ID |
| `DYNAMODB_ENDPOINT` | No (local) | - | DynamoDB endpoint (omit for AWS) |
| `DYNAMODB_TABLE_PREFIX` | No | coldcenter_ | Table name prefix |
| `AWS_REGION` | Yes (prod) | eu-central-1 | AWS region |
| `AWS_ACCESS_KEY_ID` | Yes (prod) | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Yes (prod) | - | AWS secret key |
| `S3_BUCKET_NAME` | Yes (prod) | - | S3 bucket for recordings |
| `REDIS_HOST` | Yes | localhost | Redis host |
| `REDIS_PORT` | No | 6379 | Redis port |
| `USE_MOCK_OPEL_API` | No | true | Use mock API (development) |
| `OPEL_API_URL` | No | - | Real Opel API URL |
| `ENCRYPTION_KEY` | Yes | - | 64-char hex encryption key |
| `JWT_SECRET` | Yes | - | JWT secret for dashboard auth |

### Generating Secrets

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 4. Docker Deployment

### Full Stack with Docker Compose

```bash
# Start all services (backend + infrastructure)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down

# Stop and remove volumes (data will be lost)
docker-compose down -v
```

### Individual Services

```bash
# Start only infrastructure
docker-compose up -d dynamodb-local redis mock-api

# Start only backend (without Docker)
cd backend && npm run dev

# Rebuild backend container
docker-compose build backend
docker-compose up -d backend
```

---

## 5. Database Initialization

### Initialize Tables

```bash
cd backend
npm run db:init
```

This script creates all required DynamoDB tables with proper indexes.

### Seed Test Data

```bash
npm run db:seed
```

This creates:
- 5 sample call sessions
- 3 appointments
- 2 customers
- Sample analytics data

### Verify Tables

```bash
# List tables (DynamoDB Local)
aws dynamodb list-tables --endpoint-url http://localhost:8000 --region eu-central-1

# Describe table
aws dynamodb describe-table \
  --table-name coldcenter_dev_call_sessions \
  --endpoint-url http://localhost:8000 \
  --region eu-central-1
```

---

## 6. Testing the Setup

### Health Check

```bash
# Check backend health
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "service": "coldcenter-backend",
#   "version": "1.0.0",
#   "dependencies": {
#     "opel_api": "ok"
#   }
# }
```

### Test Mock API

```bash
# Get vehicle pricing
curl http://localhost:3001/vehicles/Corsa/pricing

# Check stock
curl "http://localhost:3001/inventory/availability?model=Corsa&color=red"
```

### Test Backend API

```bash
# Get vehicle pricing via backend
curl http://localhost:3000/api/vehicles/Corsa/pricing

# Start a test call
curl -X POST http://localhost:3000/api/calls/start \
  -H "Content-Type: application/json" \
  -d '{"customer_phone": "+905551234567", "direction": "inbound"}'
```

### Run Unit Tests

```bash
cd backend
npm test
```

### Run Integration Tests

```bash
npm run test:integration
```

---

## 7. AWS Production Deployment

### Prerequisites

1. **AWS CLI configured**:
```bash
aws configure
```

2. **Terraform installed**: [Download](https://www.terraform.io/downloads)

3. **Create S3 bucket for recordings**:
```bash
aws s3 mb s3://coldcenter-production --region eu-central-1
```

### Step 1: Create DynamoDB Tables (Production)

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -var="environment=production"

# Apply infrastructure
terraform apply -var="environment=production"
```

### Step 2: Configure Production Environment

Create `.env.production`:

```bash
NODE_ENV=production
PORT=3000

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4-turbo-preview

# ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...

# AWS
AWS_REGION=eu-central-1
DYNAMODB_TABLE_PREFIX=coldcenter_prod_
S3_BUCKET_NAME=coldcenter-production

# Real Opel API
USE_MOCK_OPEL_API=false
OPEL_API_URL=https://api.opel.com.tr/v1
OPEL_API_KEY=...
OPEL_API_SECRET=...

# Redis (AWS ElastiCache)
REDIS_HOST=your-redis-endpoint.cache.amazonaws.com
REDIS_PORT=6379

# Security
ENCRYPTION_KEY=...
JWT_SECRET=...

# Features
ENABLE_CALL_RECORDING=true
ENABLE_TRANSCRIPT_STORAGE=true
ENABLE_SENTIMENT_ANALYSIS=true

# KVKK Compliance
DATA_RETENTION_DAYS=365
PII_MASKING_ENABLED=true
AUDIT_LOG_ENABLED=true
```

### Step 3: Build Production Docker Image

```bash
# Build image
docker build -t coldcenter-backend:latest \
  --target production \
  -f backend/Dockerfile \
  backend/

# Tag for ECR
aws ecr get-login-password --region eu-central-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-central-1.amazonaws.com

docker tag coldcenter-backend:latest \
  <account-id>.dkr.ecr.eu-central-1.amazonaws.com/coldcenter-backend:latest

# Push to ECR
docker push <account-id>.dkr.ecr.eu-central-1.amazonaws.com/coldcenter-backend:latest
```

### Step 4: Deploy to ECS/Fargate

```bash
cd infrastructure/terraform

# Deploy ECS service
terraform apply -target=aws_ecs_service.backend
```

### Step 5: Initialize Production Database

```bash
# Run from EC2 instance or locally with AWS credentials
NODE_ENV=production npm run db:init
```

### Step 6: Configure Route 53 & ALB

Update DNS to point to Application Load Balancer:

```bash
# Get ALB DNS name
aws elbv2 describe-load-balancers \
  --names coldcenter-production-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text
```

### Step 7: Enable CloudWatch Monitoring

```bash
# View logs
aws logs tail /ecs/coldcenter-backend --follow

# Create alarms (via Terraform)
terraform apply -target=aws_cloudwatch_metric_alarm.high_cpu
```

---

## 8. Troubleshooting

### DynamoDB Connection Issues

**Problem**: Cannot connect to DynamoDB Local

**Solution**:
```bash
# Check if DynamoDB container is running
docker ps | grep dynamodb

# Restart DynamoDB
docker-compose restart dynamodb-local

# Check logs
docker-compose logs dynamodb-local
```

### Backend Fails to Start

**Problem**: Backend crashes on startup

**Solutions**:
1. **Check environment variables**:
```bash
cat .env.local
```

2. **Verify OpenAI API key**:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

3. **Check logs**:
```bash
tail -f backend/logs/combined.log
```

### Mock API Not Responding

**Problem**: Mock API returns errors

**Solution**:
```bash
# Restart mock API
docker-compose restart mock-api

# Check logs
docker-compose logs mock-api

# Test health
curl http://localhost:3001/health
```

### Redis Connection Errors

**Problem**: Cannot connect to Redis

**Solution**:
```bash
# Verify Redis is running
docker ps | grep redis

# Test Redis connection
docker exec -it coldcenter-redis redis-cli ping
# Expected: PONG

# Restart Redis
docker-compose restart redis
```

### Port Already in Use

**Problem**: Port 3000/3001/8000 already in use

**Solution**:
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in .env.local
PORT=3002
```

### TypeScript Compilation Errors

**Problem**: TypeScript errors during build

**Solution**:
```bash
# Clean build
rm -rf backend/dist backend/node_modules

# Reinstall dependencies
cd backend && npm install

# Build
npm run build
```

---

## 9. Performance Tuning

### DynamoDB On-Demand Scaling

For production, DynamoDB uses on-demand billing which automatically scales. Monitor costs in CloudWatch.

### Redis Memory Configuration

```bash
# Check Redis memory usage
docker exec -it coldcenter-redis redis-cli INFO memory

# Set max memory (if needed)
docker exec -it coldcenter-redis redis-cli CONFIG SET maxmemory 2gb
docker exec -it coldcenter-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Node.js Performance

```bash
# Increase heap size for large loads
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

---

## 10. Backup & Recovery

### Backup DynamoDB Data

```bash
# Local backup
npm run db:backup

# AWS backup (automated via Terraform)
aws dynamodb create-backup \
  --table-name coldcenter_prod_call_sessions \
  --backup-name call_sessions_backup_$(date +%Y%m%d)
```

### Restore from Backup

```bash
# Restore table
aws dynamodb restore-table-from-backup \
  --target-table-name coldcenter_prod_call_sessions_restored \
  --backup-arn arn:aws:dynamodb:...
```

---

## 11. Maintenance

### Update Dependencies

```bash
# Check outdated packages
npm outdated

# Update packages
npm update

# Update to latest (caution!)
npx npm-check-updates -u
npm install
```

### Rotate Secrets

```bash
# Generate new encryption key
NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Update in AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id coldcenter/encryption-key \
  --secret-string "$NEW_KEY"

# Restart services
docker-compose restart backend
```

---

## 12. Monitoring & Alerts

### CloudWatch Metrics

- API Error Rate
- Call Success Rate
- Average Latency
- DynamoDB Throttling
- Redis Memory Usage

### Log Aggregation

```bash
# View recent errors
aws logs filter-log-events \
  --log-group-name /ecs/coldcenter-backend \
  --filter-pattern "ERROR"
```

---

## 13. Scaling Guidelines

### Vertical Scaling (EC2/Fargate)
- MVP: t3.small (2 vCPU, 2GB RAM)
- Pilot: t3.medium (2 vCPU, 4GB RAM)
- Production: t3.large or c5.large (2-4 vCPU, 4-8GB RAM)

### Horizontal Scaling (ECS)
- MVP: 1-2 tasks
- Pilot: 2-4 tasks
- Production: 4-10 tasks with auto-scaling

### Database Scaling
- DynamoDB: Automatic with on-demand mode
- Redis: Upgrade to Redis Cluster for >10GB data

---

## 14. Security Checklist

- [ ] API keys stored in AWS Secrets Manager (not .env files)
- [ ] IAM roles with least privilege
- [ ] VPC security groups configured
- [ ] TLS 1.2+ enforced
- [ ] PII masking enabled in logs
- [ ] Audit logging enabled
- [ ] Regular security patches applied
- [ ] Penetration testing completed (before production)

---

## 15. Support & Contact

For deployment issues:
- **Technical Lead**: Halil Enes Dağhan
- **Email**: halil@coldcenter.ai
- **Slack**: #coldcenter-ai

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-13
**Next Review**: 2025-12-13
