# 🚀 Developer Setup Guide

Welcome to the **Capstone Project**! This document provides a step-by-step onboarding guide to set up your local environment for **PostgreSQL + PostGIS**, **Backend Python FastAPI (`uv`)**, and **Frontend ReactJS (`FE`)**.

---

## 🛠️ 1. Prerequisites

Ensure the following tools are installed on your machine:

1. **Git**: Version control system.
2. **VS Code**: Recommended Code Editor.
3. **Docker Desktop**: Container engine for Database. [Download here](https://www.docker.com/products/docker-desktop/).
4. **`uv`**: Next-generation Python package manager.
   * *Installation command on Windows (PowerShell):*
     ```powershell
     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
     ```

---

## 📋 2. Project Setup Steps

### 🔹 Step 1: Pull Latest Repository Code
Open Terminal inside `Capstone_Project`:
```powershell
git checkout BE-nhuy
git pull origin BE-nhuy
```

### 🔹 Step 2: Create Environment Configuration (.env)
Copy the environment template file:
```powershell
Copy-Item .env.example .env
```

### 🔹 Step 3: Launch PostgreSQL + PostGIS Database (Docker)
1. Open **Docker Desktop**.
2. Run the following command inside `Capstone_Project`:
```powershell
docker compose up -d
```
👉 *Verification:* PostgreSQL Database with PostGIS extension will start at `localhost:5432` (DB Name: `urban_traffic`, User: `admin`, Password: `123`).

### 🔹 Step 4: Launch Python FastAPI Backend (`BE/`)
1. Navigate to the `BE` directory:
   ```powershell
   cd BE
   ```
2. Sync all Python dependencies automatically:
   ```powershell
   uv sync
   ```
3. Start the FastAPI Backend Server:
   * **Option A (Short command)**:
     ```powershell
     uv run dev
     ```
   * **Option B (Standard command)**:
     ```powershell
     uv run uvicorn app.main:app --reload --port 8000
     ```
👉 *Verification:* 
* API Root: `http://localhost:8000/`
* Swagger UI Docs: **`http://localhost:8000/docs`**
* Health Endpoint: `http://localhost:8000/api/v1/health`

### 🔹 Step 5: Launch ReactJS Frontend (`FE/`)
1. Open a new Terminal tab and navigate to `FE`:
   ```powershell
   cd FE
   ```
2. Install Node.js packages:
   ```powershell
   npm install
   ```
3. Start the React development server:
   ```powershell
   npm run dev
   ```
👉 *Verification:* Open browser at `http://localhost:5173/`

---

## 📏 3. Coding Standards & AI Guidelines

The project includes built-in guidelines for both developers and AI tools (Antigravity, Cursor, Copilot, ChatGPT):

* **AI Standards**: Located at `AGENTS.md` and `.cursorrules` in the root folder.
* **Auto Format**: VS Code is pre-configured to format code automatically on `Ctrl + S`.

---

## 🤝 4. Git Workflow

1. Never commit directly to `main`. Always work on your feature branch (e.g., `BE-nhuy`, `FE-dev`).
2. Stage and Commit:
   ```powershell
   git add .
   git commit -m "feat: short description of your changes"
   ```
3. Push to GitHub:
   ```powershell
   git push origin <your-branch-name>
   ```