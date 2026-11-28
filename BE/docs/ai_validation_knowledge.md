# Validation trong Data Science

Tài liệu mô tả quy trình của ứng dụng local. Không coi ví dụ là số liệu thực nghiệm của batch hiện tại. Nếu context không có lượt validation, chỉ giải thích quy trình; không khẳng định đã đọc bảng C1 đến C20, cấu hình thắng hay số mẫu của lượt đó.

## Chia Train Validation Test theo ngày

Validation mặc định chia nguyên nhóm ngày theo thời gian thành Train 50%, Validation 25%, Test 25%, không xáo trộn. Train huấn luyện từng cấu hình; Validation so sánh cấu hình; Test chỉ đánh giá cuối. Train/Test hiện dùng 75/25 theo ngày, tương ứng gộp Train và Validation làm dữ liệu phát triển. Tỷ lệ số mẫu thực tế có thể khác tỷ lệ nhóm ngày. Không nối cửa sổ qua session hoặc ranh giới các tập. Khi cần cùng Test với một lượt cụ thể phải đối chiếu chính xác các mẫu và ngày, không chỉ nhìn tỷ lệ.

## Chọn cấu hình tốt nhất bằng validation

Mỗi cấu hình Random Forest học trên Train và được đo trên Validation ở +1, +3, +5 phút. Chọn RMSE TB thấp nhất, trong đó RMSE TB là trung bình cộng ba RMSE horizon của toàn tập validation. Nếu bằng nhau, xét MAE TB rồi thứ tự cấu hình, dùng số chưa làm tròn. RMSE bình phương sai số nên nhạy với sai lệch lớn; MAE cho biết mức lệch tuyệt đối trung bình. Cấu hình tốt nhất chỉ tốt nhất trong các cấu hình đã thử trên lượt validation đó, không phải luôn là C11. Không dùng điểm Test để chọn hay tinh chỉnh lại cấu hình.

## Các nút thao tác validation

Thiết lập mới mở form; Chốt cấu hình và chia dữ liệu tạo lượt, chưa huấn luyện. Chạy các cấu hình validation huấn luyện và đo Validation. Thông tin chỉ xem kết quả đã lưu. Cập nhật tải trạng thái. Chọn cấu hình tốt nhất thực tế còn cố định cấu hình, train lại bằng Train + Validation và chạy Test cuối. Dùng cấu hình cho train/test chỉ xuất hiện sau khi chốt; chuyển sang Test/train rồi Thí nghiệm sẽ điền form, chưa chạy. Tạo và chạy thí nghiệm mới bắt đầu chạy lượt Train/Test riêng. Không cần chạy lượt riêng để lấy lại kết quả Test đã có.

## Session mẫu và dự báo

Session là phiên ghi hình. Một mẫu gồm 5 giá trị theo phút q(t), q(t-1), q(t-2), q(t-3), q(t-4) và các mục tiêu q(t+1), q(t+3), q(t+5). Ví dụ tại 08:10 dùng 08:06 đến 08:10 và mục tiêu 08:11, 08:13, 08:15. Một session có 7 mẫu hợp lệ thì tạo 21 dự báo: 7 cho mỗi horizon. Không phải mọi session đều có 7 mẫu; phải đếm dữ liệu hợp lệ. Số mẫu không phải số xe, số session hay số cây. Tổng số mẫu là tổng số mẫu hợp lệ của các session. Ví dụ 5 session đều 7 mẫu thì có 35 mẫu, không phải luôn mặc định 35.

## MAE MSE RMSE theo phiên và toàn tập

Với n cặp thực tế y và dự báo p ở cùng horizon: MAE = tổng |p-y| / n; MSE = tổng (p-y)^2 / n; RMSE = căn MSE. Một cặp riêng: thực tế 320, dự báo 337 thì sai số tuyệt đối 17, sai số bình phương 289; nếu n=1 thì MAE=RMSE=17, MSE=289. Đây là ví dụ minh họa. Bảng dự báo chi tiết hiện chỉ có thực tế và dự báo; chỉ số chung ở bảng tổng hợp. Dự báo hiển thị làm tròn nhưng các chỉ số đánh giá dùng số gốc, nên không lấy số nguyên hiển thị để tái tính chính xác chỉ số gốc.

## Gộp RMSE các phiên

Với mỗi horizon, RMSE toàn tập = căn[tổng(n phiên × RMSE phiên^2) / tổng n phiên]; MAE toàn tập = tổng(n phiên × MAE phiên) / tổng n phiên. Nếu các phiên có cùng số mẫu, RMSE toàn tập là căn trung bình bình phương các RMSE phiên, còn MAE toàn tập là trung bình MAE phiên. Không lấy trung bình cộng RMSE phiên để thay cho RMSE toàn tập. RMSE TB trong bảng cấu hình lại là trung bình ba RMSE toàn tập ở +1,+3,+5. Đây là hai phép tổng hợp khác nhau.

## Test đã từng được sử dụng

Sau khi chọn bằng Validation, train lại bằng Train + Validation rồi đánh giá Test giữ riêng. Nếu Test đã từng được xem hoặc dùng để điều chỉnh, kết quả mang tính mô tả trên dữ liệu đã xem; không khẳng định độc lập tuyệt đối. So sánh các thí nghiệm chỉ hợp lệ khi cùng mẫu Train, mẫu Test, đặc trưng, horizon và cách tính chỉ số. Ẩn baseline trên giao diện không có nghĩa xóa baseline khỏi dữ liệu đã lưu.
