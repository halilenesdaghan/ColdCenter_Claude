#!/bin/bash

# ============================================
# ColdCenter V1.0 - Setup Script
# ============================================
# This script automates the local development setup
# Usage: ./scripts/setup.sh

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "============================================"
echo "  ColdCenter V1.0 - Setup Script"
echo "============================================"
echo -e "${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version is too old ($NODE_VERSION). Required: 18+${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm -v)${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker from https://www.docker.com/"
    exit 1
fi
echo -e "${GREEN}✅ Docker $(docker -v | cut -d' ' -f3 | cut -d',' -f1)${NC}"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    echo "Please install Docker Compose"
    exit 1
fi
echo -e "${GREEN}✅ Docker Compose $(docker-compose -v | cut -d' ' -f4 | cut -d',' -f1)${NC}"

# Install backend dependencies
echo -e "\n${YELLOW}Installing backend dependencies...${NC}"
cd backend
npm install
echo -e "${GREEN}✅ Backend dependencies installed${NC}"

# Install mock API dependencies
echo -e "\n${YELLOW}Installing mock API dependencies...${NC}"
cd mock-api
npm install
cd ../..
echo -e "${GREEN}✅ Mock API dependencies installed${NC}"

# Create .env.local if it doesn't exist
echo -e "\n${YELLOW}Setting up environment configuration...${NC}"
if [ ! -f .env.local ]; then
    echo "Creating .env.local from .env.example..."
    cp .env.example .env.local

    # Generate encryption key
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

    # Update .env.local with generated key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/ENCRYPTION_KEY=/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env.local
    else
        # Linux
        sed -i "s/ENCRYPTION_KEY=/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env.local
    fi

    echo -e "${GREEN}✅ Created .env.local${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env.local and add your API keys:${NC}"
    echo "   - OPENAI_API_KEY"
    echo "   - ELEVENLABS_API_KEY"
    echo "   - ELEVENLABS_VOICE_ID"
    echo ""
    read -p "Press Enter to continue after updating .env.local..."
else
    echo -e "${GREEN}✅ .env.local already exists${NC}"
fi

# Create data directories
echo -e "\n${YELLOW}Creating data directories...${NC}"
mkdir -p data/call-recordings
mkdir -p data/transcripts
mkdir -p data/temp
mkdir -p logs
mkdir -p secrets
echo -e "${GREEN}✅ Data directories created${NC}"

# Start Docker services
echo -e "\n${YELLOW}Starting Docker services...${NC}"
docker-compose up -d dynamodb-local redis mock-api

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check if services are running
if ! docker ps | grep -q coldcenter-dynamodb; then
    echo -e "${RED}❌ DynamoDB Local is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✅ DynamoDB Local is running${NC}"

if ! docker ps | grep -q coldcenter-redis; then
    echo -e "${RED}❌ Redis is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Redis is running${NC}"

if ! docker ps | grep -q coldcenter-mock-api; then
    echo -e "${RED}❌ Mock API is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Mock API is running${NC}"

# Initialize database
echo -e "\n${YELLOW}Initializing DynamoDB tables...${NC}"
cd backend
npm run db:init
echo -e "${GREEN}✅ Database initialized${NC}"

# Optional: Seed test data
echo -e "\n${YELLOW}Do you want to seed test data? (y/n)${NC}"
read -r SEED_DATA
if [ "$SEED_DATA" = "y" ] || [ "$SEED_DATA" = "Y" ]; then
    npm run db:seed
    echo -e "${GREEN}✅ Test data seeded${NC}"
fi

cd ..

# Setup complete
echo -e "\n${GREEN}"
echo "============================================"
echo "  ✅ Setup Complete!"
echo "============================================"
echo -e "${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Verify your .env.local has valid API keys:"
echo "   - OPENAI_API_KEY"
echo "   - ELEVENLABS_API_KEY"
echo ""
echo "2. Start the backend server:"
echo "   cd backend && npm run dev"
echo ""
echo "3. Test the API:"
echo "   curl http://localhost:3000/health"
echo ""
echo "4. Access services:"
echo "   - Backend API: http://localhost:3000"
echo "   - Mock Opel API: http://localhost:3001"
echo "   - DynamoDB Local: http://localhost:8000"
echo ""
echo "For more information, see docs/DEPLOYMENT.md"
echo ""
