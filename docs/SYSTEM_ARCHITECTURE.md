# 🏛️ Tổng Quan Kiến Trúc Hệ Thống (System Architecture)

Document này mô tả sơ đồ kiến trúc tổng thể của dự án **Capstone Urban Traffic Pattern Analysis**.

## 📐 Sơ Đồ Khối Kỹ Thuật

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

## 🛠️ Tech Stack Chi Tiết

* **Frontend (`FE/`)**: ReactJS (Vite), Axios, TailwindCSS, `@goongmaps/goong-js`.
* **Backend (`BE/`)**: Python 3.11, FastAPI, Uvicorn, SQLAlchemy 2.0, Pydantic v2, GeoAlchemy2, `uv` Package Manager.
* **Database**: PostgreSQL 16 với PostGIS extension.
* **Quy chuẩn Code**: Xem chi tiết tại [AGENTS.md](../AGENTS.md).
