# Mock Opel API Dockerfile

FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY src ./src

EXPOSE 3001

CMD ["npm", "run", "dev"]
