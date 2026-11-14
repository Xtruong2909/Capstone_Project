# Result Sharing Management

Data Scientist tạo một bản chia sẻ chứa các đối tượng cụ thể. Mỗi item chỉ trả về những `visible_sections` đã bật. Business User chỉ đọc nội dung đã công bố qua `/api/shared-results`; các API nội bộ đọc Dataset và Experiment từ chối role này.

## Cài đặt PostgreSQL

Migration SQL nằm tại [20261114_result_sharing.sql](../migrations/20261114_result_sharing.sql). Với database hiện có, từ thư mục `BE` chạy:

```powershell
uv run --no-sync python -m scripts.apply_result_sharing_migration
```

Migration tạo `shared_reports` và `shared_report_items`. Dataset được ghim vào `resource_version_id` của phiên bản `APPROVED` tại thời điểm tạo hoặc thay item. Các resource khác tham chiếu bằng UUID cố định. Không tạo dữ liệu chia sẻ mặc định.

## API

| Method | Path | Role | Chức năng |
| --- | --- | --- | --- |
| POST | `/api/shares` | Data Scientist, Admin | Tạo DRAFT hoặc PUBLISHED |
| PATCH | `/api/shares/{share_id}` | Chủ sở hữu, Admin | Sửa metadata, thay toàn bộ items, công bố hoặc thu hồi |
| GET | `/api/shares/mine` | Data Scientist, Admin | Danh sách của người đang đăng nhập, có lọc và phân trang |
| GET | `/api/shared-results` | Business User, Admin | Danh sách PUBLISHED |
| GET | `/api/shared-results/{share_id}` | Business User, Admin | Nội dung theo section được bật |
| GET | `/api/shared-results/{share_id}/items/{item_id}/rows` | Business User, Admin | Phân trang section lớn |

`POST /api/shares` nhận `title`, `description`, `status` và `items`. Mỗi item cần `resource_type` (`DATASET`, `TRAIN_TEST`, `EXPERIMENT`, `PREDICTION`), `resource_id` và danh sách `visible_sections`. `created_by` lấy từ JWT. `PUBLISHED` phải có ít nhất một section được bật. Resource phải tồn tại, hoàn thành/đã duyệt và thuộc phạm vi Data Scientist. Response trả `share_id`; item Dataset trả thêm `resource_version_id` đã ghim.

`PATCH` có `items` sẽ **thay toàn bộ danh sách**, gồm cả các section đang bật. Bỏ `items` để giữ danh sách cũ. Đặt `description: null` để xóa mô tả. `REVOKED` là trạng thái cuối; request tiếp theo của BU trả 404. Thu hồi không xóa dữ liệu gốc.

Các section có nhiều dòng gồm `sessions`, `traffic_flow_chart`, `prediction_rows`, `forecast_results` và `forecast_chart`. Response chi tiết chỉ chứa tối đa 20 dòng đầu cùng `total_records`; dùng endpoint `/rows?section=...&page=1&page_size=20` để đọc tiếp. Endpoint này kiểm tra lại quyền theo từng item và từng section, giới hạn `page_size` là 100.

Ví dụ tạo bản chia sẻ chỉ có metrics của một Experiment:

```json
{
  "title": "Kết quả nghiên cứu lưu lượng",
  "status": "PUBLISHED",
  "items": [
    {
      "resource_type": "EXPERIMENT",
      "resource_id": "00000000-0000-0000-0000-000000000001",
      "visible_sections": ["experiment_summary", "evaluation_metrics", "baseline_comparison"]
    }
  ]
}
```

ID trên chỉ minh họa; dùng ID Experiment `COMPLETED` mà tài khoản hiện tại sở hữu. Khi không bật `hyperparameters`, trường đó không có trong JSON Business User. Chia sẻ Experiment không tự mở quyền Dataset hoặc Prediction liên quan.

Các bản ghi hiển thị chỉ dùng dữ liệu đã lưu trong PostgreSQL. API không trả đường dẫn file CSV, model artifact hoặc token. Mã lỗi nghiệp vụ gồm `SHARE_NOT_FOUND`, `SHARE_ACCESS_DENIED`, `RESOURCE_NOT_FOUND`, `RESOURCE_NOT_SHAREABLE`, `INVALID_RESOURCE_TYPE`, `INVALID_VISIBLE_SECTION`, `SHARE_ALREADY_REVOKED`, `INVALID_SHARE_STATUS`, `DUPLICATE_SHARE_ITEM`.
