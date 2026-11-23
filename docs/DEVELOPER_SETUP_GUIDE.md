# 🚀 Developer Setup Guide

Hướng dẫn cho thành viên trong nhóm pull code về và chạy **FE + BE + PostgreSQL trên máy riêng**, sử dụng bucket S3 hiện có. Các lệnh dưới đây chạy trong PowerShell trên Windows.

Git chứa code và migrations. Cấu hình riêng, thông tin đăng nhập AWS, database và artifact mô hình không tự đi theo Git. Cùng bucket S3 cũng không tự làm xuất hiện batch trong database của máy khác.

---

## 🛠️ 1. Prerequisites

Ensure the following tools are installed on your machine:

1. **Git**: Version control system.
2. **VS Code**: Recommended Code Editor.
3. **Docker Desktop**: Container engine for Database. [Download here](https://www.docker.com/products/docker-desktop/).
4. **Node.js 22.12+** và npm để chạy frontend trên máy.
5. **AWS CLI v2** để cấu hình profile có quyền truy cập bucket của nhóm.
6. **`uv`**: Chỉ cần nếu chạy backend trực tiếp bằng Python thay vì Docker.
   * *Installation command on Windows (PowerShell):*
     ```powershell
     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
     ```

---

## 📋 2. Project Setup Steps

### 🔹 Step 1: Pull code của nhóm

Chuyển sang nhánh mà nhóm thống nhất, rồi pull code. Không bắt buộc dùng một tên nhánh cố định:

```powershell
git pull --ff-only
```

Các bước tiếp theo chạy từ thư mục gốc dự án.

### 🔹 Step 2: Cấu hình quyền S3 trên từng máy

Người quản lý AWS cấp quyền truy cập bucket cho từng thành viên. Với IAM access key riêng, tạo profile:

```powershell
aws configure --profile capstone
```

Nhập thông tin đăng nhập của chính thành viên đó, region `ap-southeast-1` và output `json`.
Kiểm tra đọc danh sách object:

```powershell
aws s3 ls s3://capstone-traffic-truong-2026 --profile capstone
```

Profile lưu trên máy người dùng, không nằm trong repository. Không gửi access key qua Git hoặc dùng chung access key cá nhân.
Nếu nhóm dùng SSO, cấu hình profile `capstone` theo phương thức SSO được cấp thay vì chạy `aws configure` với access key.
Xem [AWS CLI profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

### 🔹 Step 3: Tạo cấu hình ứng dụng

Tạo `BE/.env` trên máy mới. Ví dụ dưới đây chỉ chứa tên biến và placeholder, cần thay các giá trị trong dấu `<...>`:

```dotenv
POSTGRES_USER=admin
POSTGRES_PASSWORD=<mat-khau-PostgreSQL-local>
POSTGRES_DB=traffic_urban
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
SECRET_KEY=<chuoi-ngau-nhien-rieng-cho-may-nay>
STORAGE_BACKEND=s3
S3_BUCKET_NAME=capstone-traffic-truong-2026
AWS_DEFAULT_REGION=ap-southeast-1
AWS_PROFILE=capstone
S3_KEY_PREFIX=<prefix-dang-duoc-nhom-su-dung>
```

`POSTGRES_PASSWORD` phải khớp với PostgreSQL trong [docker-compose.yml](../docker-compose.yml).
Docker Compose đã ghi đè host/port backend thành `postgres:5432`; `localhost:5433` là địa chỉ dùng khi chạy backend trực tiếp trên máy.
`S3_KEY_PREFIX` phải khớp dữ liệu được khôi phục, vì backend chỉ cho phép đọc trong prefix được cấu hình.
Các biến SMTP/Gemini chỉ cần khi dùng chức năng email/trợ lý AI.

Tạo `FE/.env.local`:

```dotenv
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

Hai file cấu hình này đã được Git bỏ qua. Không copy AWS access key vào frontend.

### 🔹 Step 4: Chạy PostgreSQL và khôi phục dữ liệu

Mở Docker Desktop, sau đó chỉ khởi động PostgreSQL:

```powershell
docker compose up -d postgres
```

Database trên máy mới chưa có schema ứng dụng và dữ liệu. Để dùng cùng các batch/tài khoản hiện có, nhận bản backup PostgreSQL mới nhất qua kênh riêng của nhóm.

**Người có database chuẩn** tạo backup sau khi các tác vụ upload/chuẩn hóa/huấn luyện đã kết thúc:

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
docker compose exec -T postgres pg_dump -U admin -d traffic_urban -Fc -f /tmp/capstone-team.dump
docker cp capstone_postgres:/tmp/capstone-team.dump ./backups/capstone-team.dump
```

Chia sẻ file backup riêng, không commit lên Git: backup chứa dữ liệu người dùng và hash mật khẩu.

**Thành viên mới**, chỉ khôi phục vào database ứng dụng còn trống:

```powershell
docker cp ./backups/capstone-team.dump capstone_postgres:/tmp/capstone-team.dump
docker compose exec -T postgres pg_restore -U admin -d traffic_urban --no-owner --no-acl --single-transaction /tmp/capstone-team.dump
```

Không thêm `--clean`, không xóa volume, không restore đè database đang có dữ liệu cần giữ.
Nếu database đã có sẵn, backup trước và áp dụng các migrations còn thiếu theo schema thực tế; không chạy lại toàn bộ migrations hoặc `init_db.sql`.
Nếu nhận snapshot mới nhất từ máy đang chạy, các migrations đã áp dụng có sẵn trong snapshot, không chạy lại chúng.

File CSV/Parquet đã ở S3 được đọc từ bucket hiện có. File còn lưu local và artifact mô hình cần được chuyển kèm vào đúng nơi backend sử dụng nếu muốn dùng lại chúng; database backup không chứa các file đó.
Các máy có database độc lập nhưng cùng bucket sẽ tác động lên cùng file S3 khi upload/xóa. Dùng dữ liệu thử được nhóm thống nhất khi thử chức năng xóa.

### 🔹 Step 5: Chạy backend với S3

```powershell
.\BE\scripts\start_s3.ps1
```

[Script](../BE/scripts/start_s3.ps1) build backend, dùng profile AWS trên máy và mount thư mục profile chỉ đọc vào container.
Nếu PowerShell chặn script, chạy riêng lệnh sau (không đổi policy toàn máy):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\BE\scripts\start_s3.ps1
```

Backend: `http://localhost:8000/docs`.
Kiểm tra database: `http://localhost:8000/health/db` phải trả `status: connected`.

Nếu chọn chạy backend trực tiếp bằng Python thay vì Docker, dừng container backend trước để không trùng cổng 8000, rồi chạy từ thư mục gốc:

```powershell
uv --directory BE sync --frozen
uv --directory BE run uvicorn app.main:app --reload --port 8000
```

### 🔹 Step 6: Chạy frontend

Mở terminal khác:

```powershell
cd FE
npm.cmd ci
npm.cmd run dev
```

Mở `http://localhost:5173/`, đăng nhập bằng tài khoản nhóm đã cấp trong database được khôi phục.
Không cần tạo lại bucket S3. Nếu database kết nối được nhưng không thấy batch, kiểm tra bản backup và quyền dataset của tài khoản.
Nếu upload S3 bị lỗi CORS, bucket cần cho phép origin frontend local đang dùng (`http://localhost:5173` hoặc `http://localhost:5174`) và expose `ETag`; xem [hướng dẫn S3](../BE/docs/s3_direct_upload.md).

### Trước khi push code

- Commit đầy đủ code mới, `uv.lock`, `package-lock.json`, migrations, file Compose S3 và script khởi động.
- Không commit `.env`, thư mục `.aws`, access key, file `.pem`, backup database, CSV/Parquet và artifact mô hình.
- Chạy `git status` và xem lại `git diff --cached --stat` trước khi commit.
- Sau khi pull lần tiếp theo: cài dependencies theo lockfile nếu thay đổi, áp dụng migrations còn thiếu, rebuild backend bằng script S3 và khởi động lại frontend nếu đổi cấu hình môi trường.

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
