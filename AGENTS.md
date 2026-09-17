# 🤖 Capstone Project - AI Autonomous Execution Guidelines & Coding Standards

This document defines the strict coding rules and architecture standards that **ALL AI AGENTS** (Antigravity, Cursor, Claude Code, GitHub Copilot, Windsurf) and human developers **MUST FOLLOW** when creating or modifying code in this repository.

> [!IMPORTANT]
> **AUTONOMOUS INSTRUCTION FOR AI AGENTS**:
> Whenever a team member requests ANY feature, bug fix, or refactoring in natural language (even if simple), all AI Agents **MUST AUTOMATICALLY** decompose and implement the request following the strict layered architecture below without requiring explicit prompts:
> 1. **Backend (`BE/app/`)**: Automatically split into 4 layers: `schemas/` (validation), `crud/` (DB query), `services/` (business logic), `api/v1/endpoints/` (FastAPI router).
> 2. **Frontend (`FE/src/`)**: Automatically split into 3 layers: `services/` (Axios API calls), `hooks/` (React logic/state), `components/` / `features/` (UI presentation).

---

## 🏗️ 1. Project Tech Stack Overview

* **Frontend (`FE/`)**: ReactJS 18+ with Vite.
* **Backend (`BE/`)**: Python 3.11+ with FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, and `uv` Package Manager.
* **Database**: PostgreSQL 16+ with PostGIS extension (location & spatial data).
* **Maps Integration**: Goong Map API (Goong JS SDK for Frontend, Goong REST API for Backend).
* **DevOps**: Docker Compose (Local), GitHub Actions (CI/CD), AWS.

---

## 📏 2. Naming Conventions

### A. Python (Backend `BE/`)
* **Files & Directories**: `snake_case` (e.g., `location_service.py`, `traffic_router.py`).
* **Classes & Pydantic Schemas**: `PascalCase` (e.g., `UserCreate`, `LocationResponse`).
* **Functions & Methods**: `snake_case` (e.g., `get_user_by_id()`, `calculate_distance()`).
* **Variables & Arguments**: `snake_case` (e.g., `current_user`, `start_location`).
* **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_PAGE_SIZE`, `GOONG_API_BASE_URL`).

### B. ReactJS (Frontend `FE/`)
* **Component Files**: `PascalCase.jsx` / `PascalCase.tsx` (e.g., `MapContainer.jsx`, `NavigationBar.jsx`).
* **Non-Component Files / Hooks**: `camelCase.js` / `camelCase.ts` (e.g., `useGoongMap.js`, `apiClient.js`).
* **Components**: `PascalCase` (e.g., `function MapContainer()`).
* **Functions & Variables**: `camelCase` (e.g., `fetchLocationData`, `isSearching`).
* **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_ZOOM_LEVEL`, `DEFAULT_CENTER`).

### C. Database (PostgreSQL)
* **Table Names**: `snake_case`, Plural (e.g., `users`, `locations`, `routes`).
* **Column Names**: `snake_case` (e.g., `created_at`, `user_id`, `latitude`, `longitude`).
* **Foreign Keys**: `singular_table_name_id` (e.g., `user_id`, `location_id`).

---

## 🏛️ 3. Layer Separation Rules

### Backend (Python FastAPI)
1. **Schemas (`app/schemas/`)**: Pydantic models for request body validation & response serialization.
2. **CRUD / Repositories (`app/crud/`)**: Pure database queries using SQLAlchemy 2.0 & PostGIS spatial functions.
3. **Services (`app/services/`)**: Core business logic & third-party integrations (Goong Map, AWS S3).
4. **API Routers (`app/api/v1/endpoints/`)**: HTTP endpoints handling request/response. **NO raw SQL or DB logic inside routers!**

### Frontend (ReactJS)
1. **Services (`src/services/`)**: Axios API calls. **NEVER call raw `axios` or `fetch` inside UI Components!**
2. **Hooks (`src/hooks/`)**: Custom React hooks for state management & API caching.
3. **Components / Features (`src/components/`, `src/features/`)**: Pure reusable UI presentation. Must handle Loading, Error, and Success states.

---

## 🗺️ 4. Goong Map API & Geospatial Standards

* **Coordinate Order Warning**:
  * Goong JS SDK / GeoJSON format uses `[longitude, latitude]` (LNG first).
  * Goong REST API string parameters often use `latitude,longitude` (LAT first).
  * **ALWAYS explicitly comment and type coordinate arguments** (e.g., `{ lat: float, lng: float }`) to prevent Lat/Lng swap bugs!
* **API Key Protection**:
  * `GOONG_MAP_KEY` (Client Key) is for Frontend rendering ONLY.
  * `GOONG_REST_KEY` (Server Key) MUST remain hidden in Backend `.env`. Geocoding & Routing calls MUST go through Backend endpoints.

---

## 🛡️ 5. Code Quality & Security Rules

1. **NO Hardcoded Secrets**: Never commit passwords, JWT secrets, or API keys. Always use `.env`.
2. **Type Safety Mandatory**: Python functions MUST have type hints: `def get_user(user_id: int) -> UserResponse:`
3. **Error Handling**: Backend must return standardized JSON errors using FastAPI `HTTPException`.
4. **Code Quality Check**: After creating Backend Python code, suggest running `uv run ruff check .` in `BE/`.