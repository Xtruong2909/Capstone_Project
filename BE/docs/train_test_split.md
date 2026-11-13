# Train/Test Split – Backend

## Split đã lưu

Ba API này hiển thị trong nhóm Swagger riêng **Train/Test Split**:

- `POST /api/train-test-splits`: tạo hoặc lấy lại split đã lưu.
- `GET /api/train-test-splits/{split_id}`: xem cấu hình, số mẫu, ngày và sessions của hai tập.
- `GET /api/train-test-splits/{split_id}/preview`: xem bảng mẫu theo trang.

Request tạo split:

```json
{
  "feature_generation_id": "49344733-e6b7-4cfc-93c0-de3ab797013c",
  "split_strategy": "DAY_BASED",
  "train_ratio": 0.7,
  "shuffle": false,
  "forecast_horizons": [1, 3, 5]
}
```

`DAY_BASED` là mặc định: xếp ngày ghi hình tăng dần và giữ nguyên ngày trong
một tập; 4 ngày với tỷ lệ 0.7 sẽ chọn 3 ngày Train và ngày cuối làm Test.
`SESSION_BASED` xếp sessions theo timestamp đầu tiên và không chia session;
20 sessions với tỷ lệ 0.7 sẽ chọn 14 sessions Train và 6 Test. `shuffle=true`
bị từ chối. Tỷ lệ `train_ratio_actual` được tính từ số mẫu thực tế, không phải
tỷ lệ ngày hoặc sessions.

Split chỉ được tạo từ Feature Generation `COMPLETED`. Mỗi cấu hình trên cùng
Feature Generation có một `split_id` ổn định. API xác minh target muộn nhất
của Train đứng trước lịch sử đầu tiên của Test; nếu có chồng lấn, API trả lỗi
`TRAIN_TEST_DATA_LEAKAGE` và không lưu split. API không tạo lại Lag Features,
không thay đổi dữ liệu và không huấn luyện mô hình.

Preview hỗ trợ `subset=TRAIN|TEST`, `page`, `page_size`, và `session_id` tùy
chọn, ví dụ:

```text
/api/train-test-splits/{split_id}/preview?subset=TEST&page=1&page_size=20
```

Gửi `split_id` đã tạo đến `POST /api/model-training/lag-features` để huấn luyện
và đánh giá Random Forest riêng cho từng horizon. API huấn luyện không chia lại
dữ liệu.

## Split tương thích cho luồng Feature Engineering cũ

`POST /api/feature-engineering/training` và
`POST /api/feature-engineering/prediction` đã bị gỡ. API chia dữ liệu vẫn nhận
các mẫu đặc trưng đã chuẩn bị; API không tự tạo đặc trưng từ dataset ID. Gửi
payload mẫu cần thiết đến `POST /api/train-test-split/training`.

Mặc định chia 70/30 theo thứ tự thời gian. Có thể thêm `train_ratio` hoặc
`split_strategy: "purged_chronological"` để thay đổi cách chia.

Metadata vẫn được kiểm tra: cấu hình phải khớp 5 lag/60 giây/horizon 1,3,5;
sample_count phải bằng số samples. Không chấp nhận lẫn session khi suy ra ID.
Các request cũ có recording_session_id tường minh vẫn được hỗ trợ.

- Endpoint: `POST /api/train-test-split/training`.
- Feature Engineering không lưu samples. Gửi `samples` đã chuẩn bị cùng
  metadata tương ứng trực tiếp đến API chia dữ liệu.
- `samples` là bắt buộc. Gửi chỉ ID trả 422, không tự gọi lại FE, cleaning hay aggregation.
- Không tạo lại Lag Features, không shuffle và không huấn luyện mô hình.
- Dùng lại schema TrainingSample, repository get_version và phân quyền
  require_dataset_scientist. Bearer token bắt buộc; quyền admin/data_scientist
  và quyền truy cập dataset giống các API phân tích hiện tại.

## Hai chiến lược

1. `chronological` (mặc định): sort theo thời gian tuyệt đối, lấy
   floor(N * train_ratio) mẫu đầu làm Train, phần còn lại làm Test.
   Giữ đủ X/Y, không xáo trộn. Chồng lấn vẫn được trả để xem xét, nhưng
   `temporal_overlap_warning=true`, `official_evaluation_eligible=false`.
2. `purged_chronological`: giữ nguyên Test; loại mẫu Train có bất kỳ target
   nào không trước `min(test.history_start_time)`. Điều kiện nghiêm ngặt:
   `max(train.target_times) < min(test.history_start_time)`.
   Nếu Train rỗng sau khi loại, trả 422 với code `INSUFFICIENT_SAFE_SPLIT_DATA`.

Đây là chính sách bảo thủ cho đánh giá với các cửa sổ quan sát không giao nhau:
kiểm tra cả lịch sử t-4..t và nhãn t+1/t+3/t+5. Chồng lấn lịch sử không phải
luôn là nhìn trước trong mọi giao thức rolling forecast, nhưng API này không
đánh dấu nó đủ điều kiện cho chế độ đánh giá tách biệt nghiêm ngặt.

Với mẫu liên tiếp và tỷ lệ 0.7:
- 5 mẫu: 3 Train / 2 Test; chronological có cảnh báo, purged trả 422.
- 30 mẫu: ban đầu 21/9; purged bỏ 9 Train, còn 12/9.
- Tổng mẫu gốc = train_count + test_count + purged_count.
- Tỷ lệ sau purge có thể khác train_ratio; không lặng lẽ di chuyển ranh giới.

## Request để thử Swagger

Dùng token hợp lệ. Với dữ liệu thật, thay version/session và **copy nguyên samples
từ FE**, không tự chế giá trị. Dưới đây là fixture minh họa cho unit test, không
phải dữ liệu đã đọc từ DB. Version phải tồn tại và tài khoản phải có quyền thì
mới thử được qua Swagger.

```json
{
  "dataset_version_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
  "roi_identifier": "MAIN_ROI",
  "recording_session_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
  "train_ratio": 0.7,
  "split_strategy": "chronological",
  "feature_order": [
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_4",
    "lag_5"
  ],
  "target_order": [
    "target_h1",
    "target_h3",
    "target_h5"
  ],
  "samples": [
    {
      "dataset_version_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "roi_identifier": "MAIN_ROI",
      "recording_session_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "history_start_time": "2018-10-24T10:00:00Z",
      "time_bucket": "2018-10-24T10:04:00Z",
      "features": {
        "lag_1": 104,
        "lag_2": 103,
        "lag_3": 102,
        "lag_4": 101,
        "lag_5": 100
      },
      "targets": {
        "target_h1": 105,
        "target_h3": 107,
        "target_h5": 109
      },
      "target_times": {
        "target_h1": "2018-10-24T10:05:00Z",
        "target_h3": "2018-10-24T10:07:00Z",
        "target_h5": "2018-10-24T10:09:00Z"
      },
      "x": [
        104,
        103,
        102,
        101,
        100
      ],
      "y": [
        105,
        107,
        109
      ]
    },
    {
      "dataset_version_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "roi_identifier": "MAIN_ROI",
      "recording_session_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "history_start_time": "2018-10-24T10:01:00Z",
      "time_bucket": "2018-10-24T10:05:00Z",
      "features": {
        "lag_1": 105,
        "lag_2": 104,
        "lag_3": 103,
        "lag_4": 102,
        "lag_5": 101
      },
      "targets": {
        "target_h1": 106,
        "target_h3": 108,
        "target_h5": 110
      },
      "target_times": {
        "target_h1": "2018-10-24T10:06:00Z",
        "target_h3": "2018-10-24T10:08:00Z",
        "target_h5": "2018-10-24T10:10:00Z"
      },
      "x": [
        105,
        104,
        103,
        102,
        101
      ],
      "y": [
        106,
        108,
        110
      ]
    },
    {
      "dataset_version_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "roi_identifier": "MAIN_ROI",
      "recording_session_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "history_start_time": "2018-10-24T10:02:00Z",
      "time_bucket": "2018-10-24T10:06:00Z",
      "features": {
        "lag_1": 106,
        "lag_2": 105,
        "lag_3": 104,
        "lag_4": 103,
        "lag_5": 102
      },
      "targets": {
        "target_h1": 107,
        "target_h3": 109,
        "target_h5": 111
      },
      "target_times": {
        "target_h1": "2018-10-24T10:07:00Z",
        "target_h3": "2018-10-24T10:09:00Z",
        "target_h5": "2018-10-24T10:11:00Z"
      },
      "x": [
        106,
        105,
        104,
        103,
        102
      ],
      "y": [
        107,
        109,
        111
      ]
    },
    {
      "dataset_version_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "roi_identifier": "MAIN_ROI",
      "recording_session_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "history_start_time": "2018-10-24T10:03:00Z",
      "time_bucket": "2018-10-24T10:07:00Z",
      "features": {
        "lag_1": 107,
        "lag_2": 106,
        "lag_3": 105,
        "lag_4": 104,
        "lag_5": 103
      },
      "targets": {
        "target_h1": 108,
        "target_h3": 110,
        "target_h5": 112
      },
      "target_times": {
        "target_h1": "2018-10-24T10:08:00Z",
        "target_h3": "2018-10-24T10:10:00Z",
        "target_h5": "2018-10-24T10:12:00Z"
      },
      "x": [
        107,
        106,
        105,
        104,
        103
      ],
      "y": [
        108,
        110,
        112
      ]
    },
    {
      "dataset_version_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "roi_identifier": "MAIN_ROI",
      "recording_session_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
      "history_start_time": "2018-10-24T10:04:00Z",
      "time_bucket": "2018-10-24T10:08:00Z",
      "features": {
        "lag_1": 108,
        "lag_2": 107,
        "lag_3": 106,
        "lag_4": 105,
        "lag_5": 104
      },
      "targets": {
        "target_h1": 109,
        "target_h3": 111,
        "target_h5": 113
      },
      "target_times": {
        "target_h1": "2018-10-24T10:09:00Z",
        "target_h3": "2018-10-24T10:11:00Z",
        "target_h5": "2018-10-24T10:13:00Z"
      },
      "x": [
        108,
        107,
        106,
        105,
        104
      ],
      "y": [
        109,
        111,
        113
      ]
    }
  ]
}
```

Đổi `split_strategy` sang `purged_chronological` để thử lỗi không đủ dữ liệu
với 5 mẫu; để thử thành công, dùng nhiều mẫu thực hơn từ FE.

## Response minh họa (rút gọn)

```json
{
  "dataset_version_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
  "roi_identifier": "MAIN_ROI",
  "recording_session_id": "83e05de4-16f7-4e05-bbd6-f80a0bfc2fa4",
  "train_ratio": 0.7,
  "split_strategy": "chronological",
  "total_samples": 5,
  "initial_train_count": 3,
  "train_count": 3,
  "test_count": 2,
  "purged_count": 0,
  "purged_times": [],
  "feature_order": [
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_4",
    "lag_5"
  ],
  "target_order": [
    "target_h1",
    "target_h3",
    "target_h5"
  ],
  "X_train": [
    [
      104,
      103,
      102,
      101,
      100
    ],
    [
      105,
      104,
      103,
      102,
      101
    ],
    [
      106,
      105,
      104,
      103,
      102
    ]
  ],
  "y_train": [
    [
      105,
      107,
      109
    ],
    [
      106,
      108,
      110
    ],
    [
      107,
      109,
      111
    ]
  ],
  "X_test": [
    [
      107,
      106,
      105,
      104,
      103
    ],
    [
      108,
      107,
      106,
      105,
      104
    ]
  ],
  "y_test": [
    [
      108,
      110,
      112
    ],
    [
      109,
      111,
      113
    ]
  ],
  "train_times": [
    "2018-10-24T10:04:00Z",
    "2018-10-24T10:05:00Z",
    "2018-10-24T10:06:00Z"
  ],
  "test_times": [
    "2018-10-24T10:07:00Z",
    "2018-10-24T10:08:00Z"
  ],
  "temporal_overlap_warning": true,
  "official_evaluation_eligible": false
}
```

Response đầy đủ còn có `train_history_start_times`, `test_history_start_times`,
`train_target_times`, `test_target_times`, `warnings`, `overlap_policy`.
Mọi danh sách thời gian giữ đúng vị trí tương ứng với hàng X/Y.
Mỗi request chỉ chứa một version, ROI và session; metadata đó được giữ trong response.

## Validation và giới hạn

- 0 < train_ratio < 1; không NaN/Infinity; mỗi tập phải có ít nhất một mẫu.
- Mảng samples phải có tối thiểu 2 phần tử; thiếu feature/target hoặc timestamp bị từ chối.
- Đúng thứ tự 5 features và 3 targets; x/y phải khớp các trường có tên.
- Các giá trị phải hữu hạn, không âm; null không tự đổi thành 0.
- Timestamp có timezone; history_start_time=t-4 và target_times=t+1/t+3/t+5.
- Không chấp nhận duplicate time_bucket, kể cả cùng thời điểm ở offset khác.
- Không gộp session/version/ROI; gửi lẫn metadata trả 422.
- Không sửa samples đầu vào hoặc dữ liệu gốc.
- Cờ eligible chỉ xác nhận **tính tách biệt thời gian của payload đã kiểm tra**,
  không xác thực giá trị payload với DB, không đánh giá mô hình hay chất lượng dữ liệu.
  Client cần dùng samples nguyên gốc từ FE. API không lưu chứng nhận đánh giá.

## Mã lỗi

- 401: chưa xác thực.
- 403: không đúng vai trò hoặc không có quyền dataset.
- 404: version không tồn tại.
- 422: payload không hợp lệ, trộn scope, duplicate timestamp, tỷ lệ tạo tập rỗng,
  hoặc không đủ dữ liệu cho safe split.

## Mã triển khai

- [Schema](../app/schemas/train_test_split.py)
- [Service](../app/services/train_test_split_service.py)
- [Router](../app/api/v1/endpoints/train_test_split.py)
- [Đăng ký endpoint](../app/main.py)
- [Unit tests](../tests/test_train_test_split.py)

## Kiểm thử

```text
uv run pytest tests/test_train_test_split.py tests/test_feature_engineering.py -q
uv run ruff check .
```

Kết quả: 68 tests passed (split và hồi quy FE), lint các tệp thay đổi đạt.
Kiểm thử router/service dùng mock DB và kiểm tra OpenAPI; chưa chạy HTTP server
hay PostgreSQL integration. Không thay đổi dữ liệu thật để thử nghiệm.

