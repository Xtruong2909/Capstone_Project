import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

POSTGRES_USER = os.getenv("POSTGRES_USER", "admin")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB", "urban_traffic")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5433"))

if not POSTGRES_PASSWORD:
    raise RuntimeError("Missing POSTGRES_PASSWORD in .env")

PROJECT_NAME = "Urban Traffic Analytics Platform"
VERSION = "0.1.0"
API_V1_STR = "/api/v1"
SECRET_KEY = os.getenv("SECRET_KEY", "urban_traffic_super_secret_jwt_key_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_TIMEOUT_SECONDS = int(os.getenv("SMTP_TIMEOUT_SECONDS", "15"))

DATASET_UPLOAD_DIR = Path(
    os.getenv("DATASET_UPLOAD_DIR", str(BASE_DIR / "uploads" / "datasets"))
)
# Match the frontend's binary-size limit: 2.5 GiB (2,684,354,560 bytes).
MAX_DATASET_UPLOAD_BYTES = int(os.getenv("MAX_DATASET_UPLOAD_BYTES", str(5 * 1024**3 // 2)))
MAX_DATASET_UPLOAD_BATCH_BYTES = int(os.getenv("MAX_DATASET_UPLOAD_BATCH_BYTES", str(10 * 1024**3)))
ASYNC_DATASET_UPLOAD_THRESHOLD_BYTES = int(
    os.getenv("ASYNC_DATASET_UPLOAD_THRESHOLD_BYTES", str(512 * 1024**2))
)

# Gemini is optional until the AI Assistant endpoint is called.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_TIMEOUT_MS = int(os.getenv("GEMINI_TIMEOUT_MS", "30000"))
