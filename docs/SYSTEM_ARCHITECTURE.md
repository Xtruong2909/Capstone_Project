# 🏛️ System Architecture Overview

This document describes the technical architecture for the **Capstone Urban Traffic Pattern Analysis** project.

## 📐 System Block Diagram

```mermaid
graph TD
    subgraph Client ["Client Layer (FE)"]
        React[ReactJS + Vite]
        GoongJS[Goong Map JS SDK]
    end

    subgraph Service ["Backend Layer (BE)"]
        FastAPI[Python FastAPI Server + uv]
        GoongAPI[Goong REST API]
    end

    subgraph Storage ["Database Layer"]
        Postgres[(PostgreSQL 16 + PostGIS 3.4)]
    end

    React -->|Render Maps| GoongJS
    React -->|REST API Requests| FastAPI
    FastAPI -->|Spatial & Data Queries| Postgres
    FastAPI -->|Geocoding / Routing| GoongAPI
```

## 🛠️ Detailed Tech Stack

* **Frontend (`FE/`)**: ReactJS (Vite), Axios, TailwindCSS, `@goongmaps/goong-js`.
* **Backend (`BE/`)**: Python 3.11, FastAPI, Uvicorn, SQLAlchemy 2.0, Pydantic v2, GeoAlchemy2, `uv` Package Manager.
* **Database**: PostgreSQL 16 with PostGIS extension.
* **Coding Standards**: Refer to [AGENTS.md](../AGENTS.md).