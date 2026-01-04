# Aequitas-MVP

A real estate investment platform for analyzing multifamily properties, risk assessment, and deal management.

## Table of Contents
- [Local Development](#local-development)
- [Deployment to Render](#deployment-to-render)
- [Environment Variables](#environment-variables)

---

## Local Development

This guide explains how to run the backend (Flask) and frontend (Vite/React) locally.

### Prerequisites
- Python 3.10+ and pip
- Node.js & npm (install via Homebrew: `brew install node` or from https://nodejs.org)

### Backend
1. Install Python deps:
   ```bash
   cd backend
   python3 -m pip install -r requirements.txt
   ```
2. Start the backend (development):
   ```bash
   # dev server (foreground) — this repo often uses port 5002 in examples
   PORT=5002 python3 run.py
   # or in background (use gunicorn for production-like runs)
   gunicorn -b 0.0.0.0:5002 "app:create_app()" --workers 2 --log-file -
   ```

### Frontend
1. Install Node deps and start Vite dev server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. The frontend dev server runs on http://127.0.0.1:5173 by default.
   The dev Vite config proxies requests starting with `/api` to the
   backend. You can override the proxy target with the `BACKEND_URL`
   environment variable when starting the frontend. Example:

   ```bash
   # point Vite to a backend running on port 5002
   BACKEND_URL=http://localhost:5002 npm run dev
   ```

### Notes
- If port 5000 is in use by macOS services, the backend will fail to bind — use `PORT=5001` or another free port.
- If you run the Flask dev server in background (nohup) the reloader can crash due to TTY/termios; run without the reloader or use gunicorn for background runs.

---

## Deployment to Render

This application is configured for easy deployment to Render using Docker.

### Architecture
- **Single Docker container** serves both API and frontend static files
- **SQLite database** on Render persistent disk (1GB)
- **Free tier eligible**

### Quick Deploy

#### Option 1: Using render.yaml Blueprint (Recommended)
1. Create account at [render.com](https://render.com)
2. Click "New +" → "Blueprint"
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml` and configure the service
5. Set the required API keys in the environment variables (see below)
6. Click "Apply" to deploy

#### Option 2: Manual Setup
1. Create account at [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `aequitas-mvp`
   - **Runtime**: Docker
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: Free
5. Add Persistent Disk:
   - Click "Add Disk"
   - **Name**: `aequitas-data`
   - **Mount Path**: `/app/data`
   - **Size**: 1 GB
6. Set environment variables (see below)
7. Click "Create Web Service"

### Required Environment Variables

Set these in the Render dashboard under "Environment":

```bash
SECRET_KEY=<generate-with-python-c-import-secrets-print-secrets-token-hex-32>
FLASK_ENV=production
FLASK_DEBUG=0
CENSUS_API_KEY=<your-census-api-key>
FRED_API_KEY=<your-fred-api-key>
RENTCAST_API_KEY=<your-rentcast-api-key>
FRONTEND_URL=https://aequitas-mvp.onrender.com  # Update with your actual Render URL
DATABASE_URL=sqlite:////app/data/aequitas.db
```

To generate a secure `SECRET_KEY`:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Testing the Deployment

After deployment completes:

```bash
# Replace with your Render URL
RENDER_URL="https://aequitas-mvp.onrender.com"

# Test health check
curl $RENDER_URL/api/v1/ping

# Test frontend
curl $RENDER_URL

# Test API endpoint
curl $RENDER_URL/api/v1/deals
```

### Local Docker Testing (Optional)

If you have Docker installed, you can test the Docker build locally:

```bash
# Build image
docker build -t aequitas-mvp .

# Run locally
docker run -p 10000:10000 \
  -e SECRET_KEY=test-secret-key \
  -e CENSUS_API_KEY=your-key \
  -e FRED_API_KEY=your-key \
  -e RENTCAST_API_KEY=your-key \
  -v $(pwd)/data:/app/data \
  aequitas-mvp

# Test at http://localhost:10000
```

### Render Free Tier Limitations
- Sleeps after 15 minutes of inactivity (30-60s cold start on first request)
- 512 MB RAM (suitable for low-medium traffic)
- Shared CPU
- 1 GB persistent disk

To avoid cold starts, upgrade to Starter plan ($7/month).

---

## Environment Variables

### Development
Create a `.env` file in the `backend/` directory:

```bash
FLASK_DEBUG=1
FLASK_ENV=development
SECRET_KEY=dev-secret-key

# External API Keys
CENSUS_API_KEY=your-census-api-key
FRED_API_KEY=your-fred-api-key
RENTCAST_API_KEY=your-rentcast-api-key

# Frontend Configuration
FRONTEND_URL=http://localhost:5173
```

### Production
Set these in your hosting platform's environment variables dashboard:
- All the variables listed above
- Set `FLASK_DEBUG=0` and `FLASK_ENV=production`
- Use a strong `SECRET_KEY`
- Set `FRONTEND_URL` to your production domain

### API Keys
- **Census API**: Get a free key at https://api.census.gov/data/key_signup.html
- **FRED API**: Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html
- **RentCast API**: Sign up at https://www.rentcast.io/
