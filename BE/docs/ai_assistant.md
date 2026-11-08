# Trợ lý AI cho Data Scientist

Backend dùng thư viện `google-genai`. Scope guard chạy trước truy vấn dữ liệu
và trước Gemini. Câu ngoài phạm vi trả về câu từ chối cố định; câu thiếu ngữ
cảnh được yêu cầu làm rõ. Với yêu cầu hợp lệ, backend lấy tối đa bốn trích
đoạn từ `ai_assistant_knowledge.md` và tài liệu mô hình/feature/split/prediction
liên quan bằng truy xuất từ khóa. Không gửi prompt vượt phạm vi sang Gemini.

System prompt cố định chỉ cho phép hỗ trợ đồ án UAV/pNEUMA, phân tích dữ liệu,
lag features, train/test, Random Forest, thí nghiệm, MAE/RMSE và dự báo giao
thông. Câu hỏi, dữ liệu database và tài liệu truy xuất luôn được coi là dữ liệu
tham khảo không đáng tin cậy, không thể ghi đè quy tắc. Không có kết quả cụ thể
thì trợ lý phải nói rõ thiếu dữ liệu; không được tự tạo số liệu hoặc kết quả
thí nghiệm. Gemini được yêu cầu trả lời bằng tiếng Việt Unicode có đầy đủ dấu;
các thuật ngữ kỹ thuật tiếng Anh có thể giữ nguyên.

Backend dùng thư viện `google-genai`. Thêm các biến sau vào `BE/.env` (không đưa API key lên Frontend hoặc Git), rồi khởi động lại Backend:

```dotenv
GEMINI_API_KEY=<api-key-của-bạn>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=30000
```

Endpoint duy nhất: `POST /api/ai/assistant`, yêu cầu Bearer token của Data Scientist hoặc Admin. Mỗi người dùng tối đa 10 lượt/phút trong một process Backend; giới hạn của Google vẫn áp dụng riêng.

Ví dụ phân tích một thí nghiệm đã hoàn thành:

```json
{
  "action": "EXPERIMENT_ANALYSIS",
  "experiment_ids": ["5af4e12e-0b70-4516-936f-2376f550f9fe"]
}
```

Đổi `action` thành `MODEL_RECOMMENDATION` để nhận cấu hình Random Forest hợp lệ; dùng một hoặc nhiều `experiment_ids`. Để so sánh, dùng `EXPERIMENT_COMPARISON` và ít nhất hai ID. Backend chỉ chọn thí nghiệm có MAE trung bình nhỏ nhất (RMSE trung bình phân xử) khi cùng dataset version, split, chính sách đánh giá và tập Test. Kết quả không đạt điều kiện chính thức vẫn được cảnh báo.

Để giải thích dự báo, dùng `FORECAST_EXPLANATION` với `prediction_id` là ID của một dòng trong `forecast_results`. Backend đọc cả ba horizon thuộc cùng Final Model và thời điểm quan sát. Chat thông thường chỉ cần `{"action":"CHAT","message":"Random Forest hoạt động như thế nào?"}`. Muốn hỏi về số liệu của dự án, thêm `experiment_ids`, `prediction_id`, `model_id` hoặc `dataset_version_id` để giới hạn phạm vi dữ liệu được truy xuất. Mọi truy vấn đều là truy vấn cố định trong repository và kiểm tra quyền dataset; không có SQL do Gemini tạo.

Response giữ envelope `action`, `status`, `result`; trường trong `result` phụ thuộc action:

- `CHAT`: chỉ `message`.
- `EXPERIMENT_ANALYSIS`: `summary`, `strengths`, `weaknesses`, `recommendations`.
- `MODEL_RECOMMENDATION`: `summary`, `suggested_configuration`, `reason`.
- `EXPERIMENT_COMPARISON`: `summary`, `best_experiment_id`, `comparison`. Mỗi mục comparison lấy từ số liệu đã lưu; `best_experiment_id` bị lược bỏ nếu các thí nghiệm không đủ điều kiện so sánh.
- `FORECAST_EXPLANATION`: `summary`, `forecast_trends`, `explanation`.

Trường không có dữ liệu hoặc không áp dụng được lược bỏ, không trả `null`. Gemini chỉ tạo phần diễn giải; số liệu comparison và forecast lấy từ PostgreSQL. Backend yêu cầu Gemini trả JSON theo schema riêng của action rồi xác thực bằng Pydantic.
