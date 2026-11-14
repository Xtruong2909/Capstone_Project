# Trợ lý AI cho Data Scientist

`POST /api/ai/assistant` yêu cầu Bearer token của Data Scientist hoặc Admin. Backend giới hạn 10 lượt/phút/người dùng trong một process. Cấu hình `GEMINI_API_KEY`, `GEMINI_MODEL` và `GEMINI_TIMEOUT_MS` trong `BE/.env`.

Trợ lý nhận một trong năm `action`: `CHAT`, `EXPERIMENT_ANALYSIS`, `MODEL_RECOMMENDATION`, `EXPERIMENT_COMPARISON`, `FORECAST_EXPLANATION`. Response giữ `action`, `status`, `result`. Chỉ phần diễn giải được gửi đến Gemini; chỉ số, ID, lựa chọn thí nghiệm tốt nhất và dữ liệu dự báo lấy từ PostgreSQL sau kiểm tra quyền.

Ví dụ phân tích thí nghiệm hiện tại:

```json
{"action":"EXPERIMENT_ANALYSIS","experiment_ids":["EXPERIMENT_UUID"]}
```

Để so sánh, dùng `EXPERIMENT_COMPARISON` với ít nhất hai `experiment_ids`. Trợ lý chỉ chọn `best_experiment_id` khi các thí nghiệm cùng Split, chính sách đánh giá, horizon và tập Test. Các chỉ số Random Forest, Persistence và Historical Average được tính từ kết quả Test đã lưu, không lấy từ một hàng dự báo đơn lẻ.

Giải thích dự báo hiện tại dùng `FORECAST_EXPLANATION` với `forecast_id` là UUID trả về từ `POST /api/prediction/forecasts`:

```json
{"action":"FORECAST_EXPLANATION","forecast_id":"FORECAST_UUID"}
```

Trợ lý đọc các Session và horizon của lần dự báo đó. Thời gian trong ngữ cảnh dự báo là Europe/Athens, với offset đúng ngày ghi hình. Chỉ người tạo được hỏi về dự báo của mình; Admin có thể xem nếu có quyền đối với dữ liệu. `prediction_id` kiểu số và `dataset_version_id` vẫn được chấp nhận để tương thích API cũ.

Chat về nhóm và các thí nghiệm của nó bằng `group_id`:

```json
{"action":"CHAT","group_id":"GROUP_UUID","message":"Phân tích thí nghiệm mới nhất của nhóm này"}
```

Backend chọn lượt Aggregation đã hoàn thành mới nhất của nhóm. Có thể dùng `aggregation_id` để chỉ định một lượt cụ thể; nếu gửi cả hai ID, chúng phải thuộc cùng nhóm.

Nếu câu hỏi chỉ nêu khái niệm, `CHAT` chỉ cần `message`. Hệ thống giới hạn chủ đề, truy xuất tài liệu dự án theo từ khóa và không cho Gemini chạy truy vấn hoặc sửa dữ liệu. Nếu không có dữ liệu được lưu, trợ lý phải nói rõ không đủ thông tin thay vì tạo số liệu.
