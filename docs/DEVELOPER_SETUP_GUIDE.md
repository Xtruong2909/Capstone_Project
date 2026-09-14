# 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án Cho Thành Viên Mới (Developer Setup Guide)

Chào mừng bạn đến với dự án **Capstone Project**! Tài liệu này hướng dẫn chi tiết từng bước thiết lập môi trường để bạn có thể chạy được trọn bộ **Database PostgreSQL + PostGIS**, **Backend Python FastAPI (`uv`)** và **Frontend ReactJS (`FE`)** trên máy cá nhân một cách nhanh nhất.

---

## 🛠️ 1. Yêu Cầu Cài Đặt Ban Đầu (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài sẵn các công cụ sau:

1. **Git**: Trình quản lý mã nguồn.
2. **VS Code**: Trình biên soạn code (Khuyên dùng).
3. **Docker Desktop**: Công cụ chạy Database ngầm.
4. **`uv`**: Trình quản lý Python cực nhanh thế hệ mới.
   * *Lệnh cài đặt trên Windows (PowerShell):*
     ```powershell
     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
     ```

---

## 📋 2. Các Bước Khởi Chạy Dự Án (Từng Bước A-Z)

### 🔹 Bước 1: Pull Code Mới Nhất Về Máy
Mở Terminal tại thư mục `Capstone_Project`:
```powershell
git checkout dev
git pull origin dev
```

### 🔹 Bước 2: Tạo File Cấu Hình Môi Trường (.env)
Copy file mẫu `.env.example` thành file `.env` tại thư mục `Capstone_Project`:
```powershell
Copy-Item .env.example .env
```

### 🔹 Bước 3: Khởi Chạy Database PostgreSQL + PostGIS (Docker)
1. Mở ứng dụng **Docker Desktop** trên máy bạn.
2. Tại thư mục `Capstone_Project`, chạy câu lệnh:
```powershell
docker compose up -d
```
👉 *Kiểm tra:* Database PostgreSQL với Extension `PostGIS` sẽ được tạo và chạy tại `localhost:5432` với DB Name: `urban_traffic`, User: `admin`, Password: `123`.

### 🔹 Bước 4: Khởi Động Backend Python FastAPI (Thư mục `BE/`)
1. Di chuyển vào thư mục `BE`:
   ```powershell
   cd BE
   ```
2. Chạy lệnh tự động đồng bộ thư viện của `uv`:
   ```powershell
   uv sync
   ```
   *(Lệnh này sẽ tự động tải Python 3.11, tạo môi trường ảo `.venv` và cài trọn bộ thư viện FastAPI, SQLAlchemy, GeoAlchemy2... trong vài giây).*

3. Khởi chạy Server FastAPI Backend:
   ```powershell
   uv run uvicorn app.main:app --reload --port 8000
   ```
👉 *Kiểm tra:* 
* Mở trình duyệt xem Trang API: `http://localhost:8000/`
* Mở giao diện Swagger UI tương tác: **`http://localhost:8000/docs`**
* Kiểm tra trạng thái DB: `http://localhost:8000/api/v1/health`

### 🔹 Bước 5: Khởi Động Frontend ReactJS (Thư mục `FE/`)
1. Mở một cửa sổ Terminal mới, di chuyển vào thư mục `FE`:
   ```powershell
   cd FE
   ```
2. Cài đặt packages Node.js:
   ```powershell
   npm install
   ```
3. Chạy ứng dụng ReactJS:
   ```powershell
   npm run dev
   ```
👉 *Kiểm tra:* Mở trình duyệt xem giao diện Frontend tại: `http://localhost:5173/`

---

## 📏 3. Quy Chuẩn Lập Trình & Sử Dụng AI (Coding Standards)

Dự án đã tích hợp sẵn hệ thống quy chuẩn dành cho cả **Người** và các **Công cụ AI (Antigravity, Cursor, Copilot, ChatGPT...)**:

* **AI Standards**: File `AGENTS.md` và `.cursorrules` nằm ở thư mục gốc. Khi bạn dùng AI để sinh code, AI sẽ **tự động đọc và tuân thủ 100% quy chuẩn đặt tên, phân tầng architecture và bảo mật**.
* **Auto Format**: VS Code đã được cài đặt tự động format code khi nhấn `Ctrl + S`.

---

## 🤝 4. Quy Trình Push Code Lên Git (Git Workflow)

1. **Không commit trực tiếp lên `main`**. Luôn làm việc trên nhánh của bạn (ví dụ: `BE-nhuy`, `FE-dev`).
2. **Thêm thay đổi & Commit**:
   ```powershell
   git add .
   git commit -m "feat: mô tả ngắn gọn tính năng vừa làm"
   ```
3. **Push lên GitHub**:
   ```powershell
   git push origin <tên-nhánh-của-bạn>
   ```
