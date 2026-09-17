# ⚡ Capstone Urban Traffic - Backend API

FastAPI backend service for Urban Traffic Pattern Analysis and Short-Term Congestion Forecasting.

For complete project documentation, architecture diagrams, and quick-start instructions, please refer to the [Root README](../README.md).

## Local Development
```powershell
# Start PostGIS Database
docker compose up -d

# Run FastAPI Development Server
uv run uvicorn app.main:app --reload --port 8000
```
API Documentation: `http://localhost:8000/docs`
