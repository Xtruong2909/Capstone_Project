# 🤖 Capstone Project - AI Coding Guidelines & Standards

This document defines the strict coding rules and architecture standards that **ALL AI Agents** (Antigravity, Cursor, Claude Code, GitHub Copilot) and human developers **MUST FOLLOW** when creating or modifying code in this repository.

---

## 🏗️ 1. Project Tech Stack & Architecture Overview

* **Frontend**: ReactJS 18+ with Vite and TypeScript (Strict Mode).
* **Backend**: Python 3.11+ with FastAPI, SQLAlchemy 2.0 (Async), Alembic, and Pydantic v2.
* **Database**: PostgreSQL 16+ with PostGIS extension (for location & geospatial data).
* **Maps Integration**: Goong Map API (Goong JS SDK for Frontend, Goong REST API for Backend).
* **DevOps**: Docker Compose (Local), GitHub Actions (CI/CD), AWS.

---

## 📏 2. Naming Conventions (Quy chuẩn đặt tên)

### A. Python (Backend)
* **Files & Directories**: `snake_case` (e.g., `user_service.py`, `location_router.py`).
* **Classes & Pydantic Schemas**: `PascalCase` (e.g., `UserCreate`, `LocationResponse`, `BaseRepository`).
* **Functions & Methods**: `snake_case` (e.g., `get_user_by_id()`, `calculate_distance()`).
* **Variables & Arguments**: `snake_case` (e.g., `current_user`, `start_location`).
* **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_PAGE_SIZE`, `GOONG_API_BASE_URL`).

### B. React & TypeScript (Frontend)
* **Component Files**: `PascalCase.tsx` (e.g., `MapContainer.tsx`, `NavigationBar.tsx`).
* **Non-Component Files / Hooks**: `camelCase.ts` (e.g., `useGoongMap.ts`, `apiClient.ts`).
* **Components**: `PascalCase` (e.g., `function MapContainer()`).
* **Functions & Variables**: `camelCase` (e.g., `fetchLocationData`, `isSearching`).
* **TypeScript Types & Interfaces**: `PascalCase` with prefix `I` for Interface if needed (e.g., `User`, `ILocationPoint`).
* **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_ZOOM_LEVEL`, `DEFAULT_CENTER`).

### C. Database (PostgreSQL)
* **Table Names**: `snake_case`, Plural (e.g., `users`, `locations`, `routes`).
* **Column Names**: `snake_case` (e.g., `created_at`, `user_id`, `latitude`, `longitude`).
* **Foreign Keys**: `singular_table_name_id` (e.g., `user_id`, `location_id`).

---

## 🏛️ 3. Layer Separation Rules (Phân tầng kiến trúc)

### Backend (Python FastAPI)
1. **API Routers (`app/api/`)**: Handle HTTP requests/responses, route validation, and call Services. **NO raw SQL or DB logic inside routers!**
2. **Services (`app/services/`)**: Business logic & third-party integrations (Goong Map, AWS S3).
3. **CRUD / Repositories (`app/crud/`)**: Pure database queries using SQLAlchemy.
4. **Schemas (`app/schemas/`)**: Pydantic models for request body validation and response serialization.
5. **Models (`app/models/`)**: SQLAlchemy DB ORM models.

### Frontend (ReactJS)
1. **Components (`src/components/`)**: Pure, reusable UI components (Buttons, Modals, Inputs).
2. **Features (`src/features/`)**: Feature-specific views and logic (e.g., `features/search/`, `features/navigation/`).
3. **Hooks (`src/hooks/`)**: Custom React hooks for encapsulation (e.g., `useGoongMap`).
4. **Services (`src/services/`)**: Axios/Fetch API calls. **NEVER call raw `fetch()` or `axios()` inside UI components!**

---

## 🗺️ 4. Goong Map API & Geospatial Standards

* **Coordinate Order Warning**:
  * Goong JS SDK / GeoJSON format uses `[longitude, latitude]` (LNG first).
  * Goong REST API string parameters often use `latitude,longitude` (LAT first).
  * **ALWAYS explicitly comment and type coordinate arguments** (e.g., `{ lat: number, lng: number }`) to prevent Lat/Lng swap bugs!
* **API Key Protection**:
  * `GOONG_MAP_KEY` (Client Key) is for Frontend rendering ONLY.
  * `GOONG_REST_KEY` (Server Key) MUST remain hidden in Backend `.env`. Geocoding & Routing calls MUST go through Backend endpoints.

---

## 🛡️ 5. Code Quality & Security Rules

1. **NO Hardcoded Secrets**: Never commit passwords, JWT secrets, or API keys. Always use `os.getenv()` or `import.meta.env`.
2. **Type Safety Mandatory**:
   * Python functions MUST have type hints: `def get_user(user_id: int) -> UserResponse:`
   * TypeScript MUST be in strict mode. **NO `any` type allowed!**
3. **Error Handling**:
   * Backend must return standardized JSON errors: `{"status": "error", "message": "...", "code": 404}` using FastAPI `HTTPException`.
   * Frontend must gracefully handle network errors using Try/Catch or React Query error boundaries.
4. **Clean Code**: Keep functions small (< 50 lines), single-responsibility, and write clear docstrings for complex functions.

