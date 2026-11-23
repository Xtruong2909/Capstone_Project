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

## EC2

Chạy cấu hình riêng [deploy/ec2/compose.yml](../deploy/ec2/compose.yml) để phục vụ frontend đã build, backend và PostgreSQL. Caddy phục vụ React và chuyển tiếp cả `/api/*`, `/health/*`, `/docs`; HTTPS được cấp tự động khi có domain trỏ đúng máy chủ. Cấu hình local vẫn dùng các file Compose ở thư mục gốc.

### 1. Tạo EC2 và quyền S3

- Dùng Ubuntu 24.04 LTS **x86_64** trong Singapore (`ap-southeast-1`), cùng region với bucket. Chọn RAM/disk theo dữ liệu thực tế; máy chạy cả PostgreSQL, build FE, chuẩn hóa và huấn luyện cần nhiều tài nguyên hơn máy chỉ chạy API. Kiểm tra giá dự kiến trong AWS trước khi launch.
- Tạo key pair và giữ file `.pem` trên máy quản trị.
- Security Group: SSH 22 chỉ từ IP quản trị; TCP 80/443 cho website. Không mở cổng 5432/5433/8000 ra Internet. Khi chỉ kiểm tra bằng HTTP với IP, giới hạn cổng 80 về IP của người kiểm tra; dùng HTTPS trước khi đăng nhập qua Internet.
- Gắn IAM role có quyền vào bucket `capstone-traffic-truong-2026`. Có thể tạo inline policy cho role với cùng quyền S3 đã cấp cho ứng dụng local; IAM user policy không tự chuyển sang EC2 role.
- Trong metadata options: bật IMDS, yêu cầu IMDSv2, **hop limit = 2** để backend Docker lấy được credentials của role. Xem [AWS IAM role](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/attach-iam-role.html) và [IMDS trong container](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html).
- Dùng domain trỏ A record đến địa chỉ máy chủ để bật HTTPS. Nếu địa chỉ public IP thay đổi khi stop/start, cần cập nhật DNS hoặc dùng địa chỉ cố định phù hợp.

### 2. Kết nối và cài Docker

Trên máy Windows, thay đường dẫn key và `PUBLIC_IP` bằng giá trị thật:

```powershell
ssh -i "C:\duong-dan\capstone.pem" ubuntu@PUBLIC_IP
```

Trên EC2 Ubuntu mới, cài Docker theo [Docker apt repository](https://docs.docker.com/engine/install/ubuntu/):

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker compose version
```

### 3. Pull code và tạo cấu hình EC2

Thay `REPO_URL` bằng URL repository, checkout đúng nhánh/commit nhóm đã push:

```bash
git clone REPO_URL Caspstone_Project
cd Caspstone_Project
```

Nếu đã clone thì chuyển vào repository và `git pull --ff-only`.
Tạo env server bằng [script](../deploy/ec2/setup-env.sh). Thay `traffic.example.com` bằng domain thật, giữ bucket và prefix khớp với dữ liệu trên máy local:

```bash
bash deploy/ec2/setup-env.sh traffic.example.com capstone-traffic-truong-2026 datasets
```

Script sinh mật khẩu PostgreSQL và JWT secret ngẫu nhiên, tạo `deploy/ec2/.env` với quyền chỉ chủ file đọc/ghi. Không copy `BE/.env` từ máy Windows lên; server dùng IAM role và không đặt `AWS_PROFILE=capstone`.
Script sẽ từ chối ghi đè env đã có để tránh đổi mật khẩu của database đang chạy. Các biến SMTP/Gemini có thể bổ sung bằng `nano deploy/ec2/.env` nếu cần.

Nếu chưa có domain, có thể đặt địa chỉ dạng `http://PUBLIC_IP` để kiểm tra kết nối HTTP. Dùng domain HTTPS trước khi dùng tài khoản qua Internet. Khi đổi địa chỉ, sửa đồng thời `SITE_ADDRESS` và origin tương ứng trong `CORS_ALLOWED_ORIGINS`, rồi recreate backend/web theo bước cập nhật bên dưới.

### 4. Chuyển database

Tạo backup trên máy Windows theo mục chạy local, lúc các tác vụ đã kết thúc. Từ Windows gửi file riêng qua SSH:

```powershell
scp -i "C:\duong-dan\capstone.pem" .\backups\capstone-team.dump ubuntu@PUBLIC_IP:/home/ubuntu/capstone-team.dump
```

Trên EC2, khởi động PostgreSQL rồi restore vào database ứng dụng trống:

```bash
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml up -d --wait postgres
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml cp /home/ubuntu/capstone-team.dump postgres:/tmp/capstone-team.dump
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml exec -T postgres sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --single-transaction /tmp/capstone-team.dump'
```

Không restore đè DB có dữ liệu cần giữ và không dùng `down -v`. Bản dump mới nhất mang theo schema/migrations đã áp dụng. Nếu code và snapshot không cùng phiên bản, kiểm tra các migrations còn thiếu trước khi chạy API.

File đang ở S3 dùng lại trực tiếp. File còn ở ổ đĩa local và artifact model không nằm trong dump PostgreSQL. Cần sao chép vào các volume tương ứng và kiểm tra lại đường dẫn đã lưu trong DB; model lưu đường dẫn máy cũ có thể cần huấn luyện lại. Compose EC2 giữ `/app/uploads/datasets` và toàn bộ `/app/artifacts` trong named volume.

### 5. Khởi động và kiểm tra

```bash
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml up -d --build --wait
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml ps
curl -fsS https://traffic.example.com/health/db
```

Thay domain mẫu bằng domain thật. Mở website, đăng nhập, kiểm tra danh mục và preview S3 trước khi chạy tác vụ lớn. Health check chỉ xác nhận backend/DB; kiểm tra thêm quyền bucket từ chính backend:

```bash
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml exec -T backend /app/.venv/bin/python -c 'from app.core import config; from app.services.storage_service import get_s3_client; result = get_s3_client().list_objects_v2(Bucket=config.S3_BUCKET_NAME, Prefix=config.S3_KEY_PREFIX, MaxKeys=1); print("S3 accessible:", result.get("KeyCount", 0), "sample object(s)")'
```

Trong S3 CORS, **thêm** origin website mới, giữ các origin local nhóm đang dùng và expose `ETag`; IAM role không thay thế CORS của browser upload. Xem [hướng dẫn S3](../BE/docs/s3_direct_upload.md).

Frontend đã build gọi API cùng website qua `/api/v1`, nên không cần ghi IP backend vào bundle. Thành viên dùng website HTTPS đã triển khai để làm việc chung; khi phát triển local, chạy cả FE và backend local theo hướng dẫn Browser session authentication bên dưới.

### 6. Cập nhật và sao lưu

Trước khi cập nhật, đợi upload/chuẩn hóa/huấn luyện hoàn tất và backup database. Không rebuild/recreate backend khi đang có tác vụ nền cần giữ.

```bash
git pull --ff-only
# Áp dụng các migrations còn thiếu tương ứng bản cập nhật, nếu có.
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml up -d --build --wait
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml logs --tail 100 backend web
```

Backup định kỳ PostgreSQL, volume model/artifact và cấu hình server. Named volume giữ dữ liệu qua recreate container, nhưng không phải backup khi mất máy/ổ đĩa.

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


## Browser session authentication

Website dùng cookie phiên opaque thay cho JWT trong Web Storage:

- API: POST `/api/v1/auth/session/login`, GET `/api/v1/auth/session`,
  POST `/api/v1/auth/session/logout`, POST `/api/v1/auth/session/change-password`.
- Cookie production: `__Host-capstone_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`,
  không đặt Domain. JavaScript không đọc được credential; chủ trình duyệt vẫn xem
  được cookie trong DevTools. Không trả credential trong JSON, không ghi vào Web Storage.
- Database chỉ giữ SHA-256 của cookie ngẫu nhiên. Đăng xuất thu hồi phiên trong DB;
  mật khẩu thay đổi làm mất hiệu lực các phiên cũ. Khóa tài khoản được kiểm tra mỗi request.
- Response phiên có `csrf_token` (không phải credential đăng nhập). Frontend giữ trong RAM
  và gửi `X-CSRF-Token` cho POST/PUT/PATCH/DELETE. Backend kiểm tra token gắn với phiên,
  Origin cho phép và chặn Sec-Fetch-Site cross-site.
- Không chọn ghi nhớ: cookie phiên, tối đa 60 phút. Chọn ghi nhớ: cookie có Max-Age,
  tối đa 7 ngày. Điều chỉnh `AUTH_SESSION_EXPIRE_MINUTES` / `AUTH_REMEMBER_EXPIRE_MINUTES`.
- Giới hạn 20 lần đăng nhập/IP/phút trong một worker, bộ nhớ có giới hạn. Nếu chạy nhiều
  worker/máy, cần rate limiter dùng chung hoặc giới hạn ở proxy/WAF.
- Compose EC2 bắt buộc `AUTH_COOKIE_SECURE=true` và `AUTH_ALLOW_BEARER_LOGIN=false`;
  JWT cũ và endpoint đăng nhập bearer cũ không dùng được trên production.
- Compose local đặt `AUTH_COOKIE_SECURE=false`. Chạy backend bằng uv ngoài Docker:
  thêm `AUTH_COOKIE_SECURE=false` vào env **chỉ trên máy local**. Giữ hostname giống nhau
  cho FE/API (cùng localhost hoặc cùng 127.0.0.1), không trộn hai hostname.
- Trên production truy cập frontend/API cùng origin HTTPS. FE localhost gọi API production
  là cross-site và không được hỗ trợ bởi cookie SameSite này; dùng website đã triển khai.

### Nâng cấp database hiện có

Trước khi chạy backend mới, áp dụng migration thêm bảng browser_sessions (không xóa
dữ liệu ứng dụng). Sao lưu DB trước, chạy từ thư mục repository trên EC2:

```bash
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml cp BE/migrations/20261205_browser_sessions.sql postgres:/tmp/browser_sessions.sql
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/browser_sessions.sql'
sudo docker compose --env-file deploy/ec2/.env -f deploy/ec2/compose.yml up -d --build --wait
```

Người dùng đang mở trang cần tải lại và đăng nhập lại sau cập nhật.

## GitHub Actions CI/CD

### Pipeline

- PR vào `main`: [CI](../.github/workflows/ci.yml) kiểm tra lỗi Python,
  chạy test backend/frontend, build frontend, kiểm tra Bash và Compose.
- Push `main`: [CI-CD EC2](../.github/workflows/cd-ec2.yml) gọi lại CI.
  Chỉ sau khi CI thành công mới triển khai bằng OIDC + AWS Systems Manager.
- Có thể chạy thủ công **Actions → CI-CD EC2 → Run workflow**, chọn `main`.
- GitHub runner đóng gói đúng commit đã test và gửi source archive vào prefix
  `deployments/` của bucket hiện có. Archive chỉ gồm file Git đang theo dõi.
- SSM gọi [deploy-release.sh](../deploy/ec2/deploy-release.sh) với user `ubuntu`.
  Script build image, sao lưu DB, áp dụng migration trong allowlist,
  khởi động dịch vụ và kiểm tra HTTPS.
- Ứng dụng giữ Compose project `capstone-ec2` và các volume hiện có.
  Bí mật được đọc từ `/home/ubuntu/Capstone_Project/deploy/ec2/.env` trên EC2.
  Workflow không cần SSH private key hoặc AWS access key lâu dài trong GitHub.

Repository hiện public. Pipeline dùng GitHub-hosted runner; không cài runner của
repository public lên server production. Xem [GitHub runner security](https://docs.github.com/en/actions/reference/security/secure-use).

### 1. Chuẩn bị EC2 (một lần)

Trong AWS IAM, gắn policy **AmazonSSMManagedInstanceCore** vào role
`truong-app-server-role` đang gắn EC2. Giữ quyền S3 của role.
Role cần `s3:GetObject` trên `capstone-traffic-truong-2026/deployments/*`;
policy `AmazonS3ReadOnlyAccess` hiện tại đã bao gồm quyền đó.

SSM Agent dạng Snap đã được kiểm tra đang chạy trên EC2 này. Kiểm tra lại:

```bash
sudo systemctl status snap.amazon-ssm-agent.amazon-ssm-agent.service
```

Vào **AWS Systems Manager → Fleet Manager / Managed nodes**, xác nhận instance
`i-00f58c4ef1a620884` hiện **Online**. EC2 cần truy cập HTTPS outbound tới SSM và S3;
giữ cổng SSH chỉ cho IP quản trị.

EC2 chưa có AWS CLI khi chuẩn bị pipeline. Cài AWS CLI v2 x86_64 theo
[hướng dẫn AWS](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html):

```bash
sudo apt-get update
sudo apt-get install -y unzip
curl -fsS https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/capstone-awscliv2.zip
unzip -q /tmp/capstone-awscliv2.zip -d /tmp/capstone-awscli
sudo /tmp/capstone-awscli/aws/install
aws --version
```

AWS CLI trên EC2 dùng IAM role; không chạy `aws configure` để lưu access key.

### 2. Tạo IAM role cho GitHub (một lần)

1. **IAM → Identity providers → Add provider → OpenID Connect**:
   Provider URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
   Nếu provider đã có trong account thì dùng lại.
2. Tạo role `capstone-github-deploy`, dùng trust policy trong
   [github-oidc-trust.json](../deploy/ec2/github-oidc-trust.json).
3. Gắn inline permission policy trong
   [github-deploy-policy.json](../deploy/ec2/github-deploy-policy.json).
   Policy chỉ cho upload artifact vào prefix `deployments/`, gửi lệnh tới đúng
   instance và đọc trạng thái lệnh. Quyền deploy này cho phép chạy code trên server;
   chỉ những người tin cậy được phép merge vào `main`.
4. Sao chép ARN role mới. Không thay role đang gắn EC2 bằng role GitHub này.

Trust policy dùng subject
`repo:Xtruong2909@141247165/Capstone_Project@1364492118:environment:production`.
Repository này tạo ngày 10/09/2026, sau mốc 15/07/2026 nên GitHub dùng immutable
subject có cả owner ID và repository ID. Các ID trên đã đối chiếu GitHub API.
Không dùng subject chỉ có tên repo theo định dạng cũ. Xem
[GitHub immutable subject claims](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims).
Xem [AWS OIDC trust](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html).

Nếu bước đăng nhập AWS báo `Not authorized to perform sts:AssumeRoleWithWebIdentity`:
mở IAM role `capstone-github-deploy` → **Trust relationships → Edit trust policy**,
thay bằng nội dung [github-oidc-trust.json](../deploy/ec2/github-oidc-trust.json) mới
và lưu. Đây là trust policy của role, khác với inline permissions policy.
Chỉ sửa file local không cập nhật IAM. Sau khi lưu trên AWS, rerun failed jobs
trong GitHub Actions; không cần push code để áp dụng thay đổi trust policy AWS.

### 3. Cấu hình GitHub (một lần)

Trong repository **Settings → Environments**, tạo environment **production**:

- **Deployment branches and tags**: chỉ cho phép branch `main` (đây là bước bắt buộc
  vì trust OIDC gắn với environment).
- Environment variable **AWS_DEPLOY_ROLE_ARN**:
  `arn:aws:iam::378595784342:role/capstone-github-deploy` (dùng ARN role thực tế vừa tạo).
- Có thể bật **Required reviewers** để duyệt mỗi lần deploy.
- Thiết lập ruleset/branch protection cho `main`: yêu cầu review và CI thành công trước merge.

Không đưa Gemini key, JWT secret, mật khẩu DB hoặc SSH key vào workflow.
Chúng tiếp tục nằm trong env riêng trên server.

### 4. Commit, push và xem lần chạy đầu

Commit/push toàn bộ thay đổi ứng dụng, migrations và workflow sau khi review.
Workflow chỉ thấy code đã commit; các file mới chưa theo dõi cũng phải được thêm.

Sau push `main`, xem **Actions → CI-CD EC2**. CI sẽ chạy trước. Nếu AWS chưa
được cấu hình, CD sẽ báo thiếu role/quyền/managed node; không thay đổi server.

### Releases, migrations và khôi phục

- Release source: `/home/ubuntu/capstone-deploy/releases/`.
- Symlink release thành công: `/home/ubuntu/capstone-deploy/current`.
- Backup DB và image IDs: `/home/ubuntu/capstone-deploy/backups/`.
- Code đang chạy không bị ghi đè bởi `git pull` vào checkout cũ.
- Script từ chối deploy khi có job dữ liệu đang chạy; chờ hoàn thành rồi rerun.
- Chỉ áp dụng file trong [ci-migrations.txt](../deploy/ec2/ci-migrations.txt).
  Chỉ thêm SQL đã review, idempotent, tương thích với code cũ; không thêm
  migration xóa/sửa dữ liệu mang tính phá hủy vào allowlist này.
- Nếu container mới/health check thất bại, script thử khởi động lại image và
  cấu hình của release trước. Không tự restore DB đè dữ liệu production.
- Nếu GitHub hủy job sau khi đã gửi SSM, lệnh trên EC2 có thể vẫn chạy.
  Kiểm tra **Systems Manager → Run Command** trước khi gửi deploy lại.
- Tự quản lý giữ/xóa backup, release cũ và artifact prefix `deployments/` theo nhu cầu;
  script không chạy `docker system prune` hoặc xóa volume ứng dụng.
