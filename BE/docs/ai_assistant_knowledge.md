# Kiến thức hệ thống cho Trợ lý AI

Tài liệu này mô tả quy trình hiện tại. Số liệu của một nhóm, thí nghiệm hoặc lần dự báo cụ thể chỉ được lấy từ PostgreSQL sau khi kiểm tra quyền truy cập; các ví dụ trong tài liệu không phải kết quả thực nghiệm.

## Temporal Aggregation và Lag Features

Dữ liệu pNEUMA được tổng hợp thành `vehicle_count` theo từng phút và từng Recording Session. Một `aggregation_id` có thể bao gồm nhiều Dataset trong cùng nhóm. Năm Lag Features dùng thứ tự `lag_1` là phút quan sát gần nhất đến `lag_5` là phút cách đó bốn phút. Cửa sổ không nối qua ranh giới Session hoặc thời điểm thiếu/trùng. Các horizon mục tiêu là +1, +3, +5 phút. Giá trị xe và outlier không bị tự ý sửa.

## Train/Test và thí nghiệm Random Forest

Train/Test Split được lưu trước thí nghiệm. Thí nghiệm dùng cùng Split và Lag Features đã tạo, huấn luyện Random Forest riêng cho từng horizon. Persistence lấy `lag_1` của từng mẫu Test. Historical Average là trung bình target tương ứng chỉ từ Train. Ba phương pháp được đánh giá trên cùng các mẫu Test của từng horizon, tạo chín bộ chỉ số. MAE là trung bình sai số tuyệt đối, MSE là trung bình sai số bình phương, RMSE là căn bậc hai của MSE. Khi so sánh thí nghiệm, cần cùng nguồn Aggregation, Split, chính sách đánh giá, horizon và tập Test thực tế.

## Dự báo thủ công

API dự báo hiện tại dùng một thí nghiệm đã hoàn thành và năm time bins liên tục mới nhất của từng Session được chọn. Nó tải ba mô hình Random Forest đã lưu và không huấn luyện lại. Một yêu cầu có thể tạo dự báo cho nhiều Session. `forecast_id` là UUID của lần dự báo; mỗi kết quả có `session_id`, horizon, thời điểm quan sát và thời điểm dự báo. Dữ liệu lưu theo UTC, API hiển thị thời gian theo Europe/Athens với offset phù hợp ngày ghi hình. Giá trị thực tế và sai số có thể chưa có; không được suy đoán chúng từ số dự báo. Nếu dự báo trên Session từng nằm trong Train, không coi đó là đánh giá độc lập.
