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

## Admin-created accounts

Set these variables in `BE/.env` to send temporary account credentials using Gmail SMTP:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-sender@gmail.com
SMTP_PASSWORD=your-16-character-google-app-password
SMTP_FROM_EMAIL=your-sender@gmail.com
```

Use a Google App Password, not the Gmail account password. Keep it private and do not commit
`BE/.env`. New accounts receive a generated temporary password by email and must call
`POST /api/v1/auth/change-password` after login before using regular authenticated endpoints.

For an existing database, apply the migration in `migrations/20261014_add_must_change_password.sql`.
