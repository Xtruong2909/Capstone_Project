# Upload trực tiếp từ trình duyệt lên S3

Khi `STORAGE_BACKEND=s3`, trang Engineer dùng multipart upload trực tiếp lên S3.
Mỗi phần 16 MiB, tối đa bốn phần đồng thời, mỗi phần thử lại tối đa ba lần.
Frontend xin URL theo nhóm tối đa 16 phần khi cần để giảm lượt gọi backend;
mỗi lần thử lại xin URL mới cho đúng phần bị lỗi. Các file vẫn được xử lý lần lượt.
Backend chỉ nhận metadata, cấp URL ký tạm thời (15 phút) và xác nhận ETag/kích thước.
AWS credentials không được gửi tới frontend. Bucket vẫn private.

## Triển khai

1. Áp dụng [migration multipart](../migrations/20261202_direct_s3_upload.sql) và
   [migration checksum tùy chọn](../migrations/20261203_optional_recording_checksum.sql)
   trước khi khởi động backend mới.
2. Trong S3 → bucket → Permissions → CORS, thêm quy tắc bên dưới. Giữ các quy tắc
   đang phục vụ chức năng khác và thêm đúng origin HTTPS nếu triển khai lên server.
3. Khởi động backend bằng [start_s3.ps1](../scripts/start_s3.ps1), chạy frontend như bình thường.

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

IAM của ứng dụng cần `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`,
`s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts` cho prefix dữ liệu.
Tài khoản cấu hình CORS cần quyền quản trị CORS của bucket; ứng dụng không cần quyền này.

## Luồng xử lý

- `GET /api/v1/datasets/direct-upload/capabilities`: chọn S3 hoặc upload local.
- `POST /api/v1/datasets/direct-upload`: cấp phiên multipart gắn với tài khoản đăng nhập.
- `POST /{job_id}/files/{file_id}/parts`: ký URL cho phần hợp lệ của đúng phiên.
- Trình duyệt PUT từng Blob lên S3 bằng Axios client riêng, không gắn JWT của ứng dụng.
- `POST /{job_id}/files/{file_id}/complete`: đối chiếu các phần và hoàn tất file trên S3.
- `POST /{job_id}/complete`: lưu catalog của các file đã xác nhận hoàn tất trong background.
- Theo dõi bằng `GET /api/v1/datasets/upload/jobs/{job_id}` như trước.
- `DELETE /{job_id}`: hủy phiên chưa gửi xử lý, abort multipart và dọn object chưa được tham chiếu.

Tiến độ đầu tiên là số byte trình duyệt gửi lên S3. Sau đó backend lưu thông tin
tập dữ liệu và phiên ghi hình vào DB. Backend đối chiếu ETag/kích thước của từng
part và HEAD của object khi hoàn tất file; không GET, download, đọc hoặc hash lại
nội dung file sau upload. Không tạo bản upload tạm trên ổ đĩa backend.

Checksum của recording mới là `null` vì chưa tính SHA-256. Các checksum đã có được
giữ nguyên. Hệ thống giữ bản ghi hiện có khi trùng tên file (`CONFLICT`), không
ghi đè và không khẳng định nội dung trùng khi chưa so sánh. Không phát hiện file
trùng nội dung nhưng khác tên trong luồng direct upload. CSV được phân tích khi
xem trước/chuẩn hóa; lỗi nội dung có thể xuất hiện ở bước đó. Các bước này vẫn có
thể đọc S3, dùng cache và file xử lý riêng theo yêu cầu của thao tác.

Riêng bước lấy cấu trúc cột của recording S3 chỉ đọc phần đầu qua Range request,
tối đa 1 MiB cộng một byte để nhận biết mẫu bị cắt, và suy luận kiểu từ các bản ghi
hoàn chỉnh trong mẫu. Không tải toàn bộ CSV về chỉ để tạo mapping. Nếu mẫu chưa có
bản ghi hoàn chỉnh, kiểu cột có thể là `unknown`. Studio chỉ gọi status/report dành
cho kết quả xuất khi workflow hoặc job xác nhận đã Export thành công.

## Lỗi khi đọc dữ liệu

- `404`: file/object không còn tồn tại hoặc thiếu đường dẫn dữ liệu.
- `503`: lỗi kết nối, credentials hoặc quyền đọc S3 của backend; không đổi thành lỗi CSV.
- `422`: nội dung CSV hoặc cấu trúc cột không hợp lệ, ví dụ header khác nhau giữa các session.
- `409`: trạng thái quy trình chưa đáp ứng, ví dụ chưa Export thành công.
- `403`: tài khoản ứng dụng chưa được phép xem dataset/phiên ghi hình.

Lần xem trước hoặc chuẩn hóa đầu tiên vẫn có thể tải toàn bộ file về cache để xử
lý bằng CSV/Parquet reader hiện tại. Bước chuẩn hóa tải tối đa hai file nguồn song
song (mỗi file tối đa hai phần đồng thời), giữ thứ tự session khi xử lý và dùng lại
cache. Số lượng kết nối tăng không bảo đảm tăng tốc nếu đường truyền đã đầy.
Đọc cấu trúc cột dùng mẫu Range riêng. Kiểm thử
`test_s3_pipeline_postgres.py` bật bằng `RUN_S3_PIPELINE_POSTGRES=1` kiểm tra router
DE/Admin/DS với S3 thật, gồm cache trống, thiếu object và kiểm tra grant. Dữ liệu thử
được tạo trong schema PostgreSQL và prefix S3 `.checks/` riêng rồi dọn sau khi chạy.

Metadata multipart được lưu trong DB với hạn 24 giờ. Khi mạng lỗi, frontend hủy các
request đang chạy trước khi gọi cleanup. Nếu đóng tab đột ngột, file chưa upload xong
không tự tiếp tục sau khi mở lại. Chọn lại file để tạo phiên mới.

Chạy hằng ngày (tối đa 100 phiên hết hạn/lần; chạy lại nếu còn nhiều):

```powershell
uv run python -m scripts.cleanup_s3_uploads
```

Có thể thêm Lifecycle rule của S3 để abort multipart chưa hoàn tất sau một ngày như
một lớp dọn dẹp bổ sung. Rule này không xóa các object đã hoàn tất.
Không chuyển về upload qua backend khi CORS/S3 lỗi; giao diện báo lỗi để sửa cấu hình.

Kiểm tra chất lượng backend: `uv run ruff check .`.
