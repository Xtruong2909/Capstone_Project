# 🤖 Universal AI Prompt Templates

This document provides universal prompt templates for team members working with AI assistants (Antigravity, Cursor, GitHub Copilot, ChatGPT, Claude Code).

---

## 📌 Template 1: Full-Stack Feature Development

```text
Develop the feature: [FEATURE NAME]

REQUIREMENTS:
1. Follow all guidelines in AGENTS.md and .cursorrules.
2. Architecture breakdown:
   - Backend (`BE/app/`): Schemas (`app/schemas/`), CRUD (`app/crud/`), Services (`app/services/`), Routers (`app/api/v1/endpoints/`).
   - Frontend (`FE/src/`): Services (`src/services/`), Hooks (`src/hooks/`), Components (`src/components/`).
3. Backend: 100% Type Hints, HTTPException error handling.
4. Frontend: Handle Loading, Error, and Success states.
```

---

## 📌 Template 2: Backend Endpoint Development

```text
Create Backend API for: [REQUIREMENT]

RULES:
1. Refer to AGENTS.md.
2. Separate into Schemas, CRUD (SQLAlchemy 2.0 + PostGIS), Services, and Routers.
3. NO raw SQL inside Routers.
4. Explicitly type coordinates `{ lat: float, lng: float }`.
```

---

## 📌 Template 3: Bug Fixing & Debugging

```text
Fix the following error:
[PASTE LOGS HERE]

STEPS:
1. Identify Root Cause.
2. Provide a clean, robust solution.
3. Show exact file paths and updated code snippets.
```