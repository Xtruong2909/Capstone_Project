# Tập dữ liệu không có phiên bản

Mỗi tập dữ liệu có một bản ghi trong `dataset_files`, được ràng buộc
`UNIQUE(dataset_id)`. Upload thêm session và export đều cập nhật bản ghi này,
giữ nguyên `file_id`. Không có tag, số phiên bản hay danh sách phiên bản.

Batch chứa các tập dữ liệu; tập dữ liệu chứa các recording session. Các session
gốc được giữ lại để chuẩn hóa lại. Export cập nhật tệp đã xử lý và đưa trạng thái
về `PENDING`; admin cần phê duyệt lại dữ liệu đã thay đổi.

## Database đã có dữ liệu

1. Dừng backend và sao lưu PostgreSQL bằng `pg_dump`.
2. Chạy [migration](../migrations/20261130_remove_dataset_versions.sql) với
   `psql -v ON_ERROR_STOP=1`.
3. Khởi động backend và frontend cùng mã nguồn mới.

Migration chọn bản ghi gần nhất của mỗi tập dữ liệu, gộp các liên kết recording
session, chuyển các khóa ngoại và JSON của job sang tệp hiện tại. ID và kết quả
thí nghiệm, lượt tổng hợp, chuỗi thời gian được giữ lại. Mapping cột dùng cấu hình
được xác nhận gần nhất. Nhật ký kiểm toán không bị viết lại. Các tệp vật lý cũ
không bị xóa.

Migration chạy trong một transaction và không thực hiện lại khi bảng cũ đã được
chuyển đổi. Không chạy lại các migration lịch sử trước nó trên schema mới.

Database mới dùng [init_db.sql](../init_db.sql), sau đó các migration bổ sung của
những phân hệ còn lại theo hướng dẫn triển khai dự án.

## API và frontend

- Catalog DE: `GET /api/v1/datasets/files`, mỗi tập dữ liệu một dòng.
- Xử lý batch: `/api/v1/datasets/groups/{group_id}/normalize`, `/export`,
  `/report`, `/status`, `/submit`, `/resubmit`.
- Các API sử dụng `file_id`/`dataset_file_id` để tham chiếu tệp hiện tại.
- Các URL `/versions`, trường `version_id`, `version_tag`, `version_number` và
  tham số `new_version_tag` đã được bỏ. Client phải cập nhật cùng backend.
- Cột, nhãn, danh sách chọn phiên bản và chức năng tạo phiên bản cũ đã được bỏ
  khỏi DE, admin và DS. Danh mục DE dùng batch → tập dữ liệu.

Kiểm tra chất lượng Python bằng `uv run ruff check .` trong thư mục backend.
