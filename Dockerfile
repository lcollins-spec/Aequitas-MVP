# ============================================================================
# Stage 1: Build Frontend
# ============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Upgrade npm to version 11
RUN npm install -g npm@11

# Install dependencies
RUN npm ci 

# Copy frontend source
COPY frontend/ ./

# Build frontend for production
RUN npm run build

# ============================================================================
# Stage 2: Production Image
# ============================================================================
FROM python:3.10-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=10000

# Create app directory
WORKDIR /app

# Install system dependencies (PostgreSQL client libraries for psycopg2)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose port (Render will set PORT env var)
EXPOSE ${PORT}

# Change to backend directory
WORKDIR /app/backend

# Start gunicorn with production settings
CMD gunicorn \
    --bind 0.0.0.0:${PORT} \
    --workers 2 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    "app:create_app()"
