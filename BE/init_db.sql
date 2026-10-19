-- ====================================================================
-- CAPSTONE PROJECT FA26SE155: URBAN TRAFFIC ANALYTICS PLATFORM
-- DATABASE INITIALIZATION SCRIPT (POSTGRESQL 16 + POSTGIS 3.4)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. DROP TABLES IN REVERSE ORDER OF DEPENDENCY (FOR CLEAN RESET IF NEEDED)
DROP TABLE IF EXISTS ai_assistant_logs CASCADE;
DROP TABLE IF EXISTS traffic_reports CASCADE;
DROP TABLE IF EXISTS evaluation_metrics CASCADE;
DROP TABLE IF EXISTS forecast_results CASCADE;
DROP TABLE IF EXISTS model_parameters CASCADE;
DROP TABLE IF EXISTS experiments CASCADE;
DROP TABLE IF EXISTS traffic_time_series CASCADE;
DROP TABLE IF EXISTS dataset_access_grants CASCADE;
DROP TABLE IF EXISTS data_cleaning_histories CASCADE;
DROP TABLE IF EXISTS data_quality_issues CASCADE;
DROP TABLE IF EXISTS data_quality_checks CASCADE;
DROP TABLE IF EXISTS data_quality_reports CASCADE;
DROP TABLE IF EXISTS dataset_column_mappings CASCADE;
DROP TABLE IF EXISTS dataset_versions CASCADE;
DROP TABLE IF EXISTS datasets CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ====================================================================
-- PHÂN HỆ 1: NGƯỜI DÙNG, PHÂN QUYỀN (RBAC) & KIỂM TOÁN (AUDIT TRAIL)
-- ====================================================================

CREATE TABLE roles (
    id VARCHAR(32) PRIMARY KEY CHECK (id ~ '^[a-z0-9_]+$'),
    name VARCHAR(64) NOT NULL UNIQUE CHECK (length(trim(name)) >= 2),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(128) NOT NULL CHECK (length(trim(full_name)) >= 2),
    role_id VARCHAR(32) NOT NULL REFERENCES roles(id) ON UPDATE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role_id);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64),
    details JSONB,
    ip_address VARCHAR(45) CHECK (ip_address IS NULL OR ip_address ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$'),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ====================================================================
-- PHÂN HỆ 2: QUẢN LÝ BỘ DỮ LIỆU UAV & KIỂM ĐỊNH CHẤT LƯỢNG
-- ====================================================================

CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL UNIQUE CHECK (length(trim(name)) >= 3),
    code VARCHAR(64) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]+$'),
    source VARCHAR(255) NOT NULL,
    description TEXT,
    capture_date DATE,
    location_name VARCHAR(255) NOT NULL,
    roi_geometry GEOMETRY(Polygon, 4326),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_datasets_roi ON datasets USING GIST(roi_geometry);

CREATE TABLE dataset_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    version_tag VARCHAR(32) NOT NULL CHECK (version_tag ~ '^v[0-9]+(\.[0-9]+)*(-[a-zA-Z0-9_-]+)?$'),
    data_file_path VARCHAR(512),
    original_filename VARCHAR(255),
    csv_file_path VARCHAR(512),
    parquet_file_path VARCHAR(512),
    geojson_file_path VARCHAR(512),
    file_format VARCHAR(16) NOT NULL DEFAULT 'CSV',
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    total_records BIGINT NOT NULL DEFAULT 0,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approval_note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dataset_version UNIQUE(dataset_id, version_tag)
);
CREATE INDEX idx_dataset_versions_status ON dataset_versions(approval_status);

CREATE TABLE dataset_column_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    mappings JSONB NOT NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dataset_column_mapping_version
        UNIQUE(dataset_id, dataset_version_id)
);

CREATE TABLE data_quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    started_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    progress_percent INTEGER NOT NULL DEFAULT 0
        CHECK (progress_percent BETWEEN 0 AND 100),
    processed_rows BIGINT NOT NULL DEFAULT 0,
    total_rows BIGINT,
    report JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX ix_data_quality_checks_dataset_id ON data_quality_checks(dataset_id);
CREATE INDEX ix_data_quality_checks_dataset_version_id
    ON data_quality_checks(dataset_version_id);
CREATE INDEX ix_data_quality_checks_status ON data_quality_checks(status);
CREATE UNIQUE INDEX uq_data_quality_active_version
    ON data_quality_checks(dataset_version_id)
    WHERE status IN ('queued', 'running');

CREATE TABLE data_quality_issues (
    id BIGSERIAL PRIMARY KEY,
    check_id UUID NOT NULL REFERENCES data_quality_checks(id) ON DELETE CASCADE,
    row_number BIGINT,
    issue_type VARCHAR(32) NOT NULL,
    column_name VARCHAR(512),
    message VARCHAR(512) NOT NULL,
    observed_value VARCHAR(256)
);
CREATE INDEX ix_data_quality_issues_check_id ON data_quality_issues(check_id);
CREATE INDEX ix_data_quality_issues_issue_type ON data_quality_issues(issue_type);
CREATE INDEX ix_data_quality_issue_check_row
    ON data_quality_issues(check_id, row_number);

CREATE TABLE data_quality_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_version_id UUID NOT NULL UNIQUE REFERENCES dataset_versions(id) ON DELETE CASCADE,
    missing_coordinates_count INTEGER DEFAULT 0,
    negative_speed_count INTEGER DEFAULT 0,
    invalid_timestamp_count INTEGER DEFAULT 0,
    out_of_bounds_count INTEGER DEFAULT 0,
    duplicate_records_count INTEGER DEFAULT 0,
    error_rate_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    quality_flag VARCHAR(16) NOT NULL,
    summary_details JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE data_cleaning_histories (
    id BIGSERIAL PRIMARY KEY,
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    cleaning_operation VARCHAR(64) NOT NULL,
    parameters JSONB,
    records_before BIGINT NOT NULL,
    records_after BIGINT NOT NULL,
    executed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dataset_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_dataset_grant UNIQUE(dataset_version_id, user_id)
);

-- ====================================================================
-- PHÂN HỆ 3: CHUỖI THỜI GIAN KHÔNG - THỜI GIAN (SPATIAL-TEMPORAL TIME SERIES)
-- ====================================================================

CREATE TABLE traffic_time_series (
    id BIGSERIAL PRIMARY KEY,
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    time_bucket TIMESTAMPTZ NOT NULL,
    aggregation_interval INTEGER NOT NULL, -- 60 (1m), 180 (3m), 300 (5m), 900 (15m)
    roi_identifier VARCHAR(64) NOT NULL DEFAULT 'MAIN_ROI' CHECK (roi_identifier ~ '^[A-Za-z0-9_-]+$'),
    vehicle_count INTEGER NOT NULL DEFAULT 0,
    traffic_flow DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- Target chính: xe/phút
    traffic_density DECIMAL(10, 4) NOT NULL DEFAULT 0.0000, -- xe/m2
    mean_speed DECIMAL(6, 2) NOT NULL DEFAULT 0.00, -- km/h
    congestion_level VARCHAR(32) NOT NULL DEFAULT 'FREE_FLOW',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tts_composite ON traffic_time_series(dataset_version_id, aggregation_interval, time_bucket);
CREATE INDEX idx_tts_time ON traffic_time_series(time_bucket);

-- ====================================================================
-- PHÂN HỆ 4: THÍ NGHIỆM KHOA HỌC & DỰ BÁO AI (REPRODUCIBILITY ENGINE)
-- ====================================================================

CREATE TABLE experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL CHECK (length(trim(name)) >= 2),
    description TEXT,
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE RESTRICT,
    model_type VARCHAR(32) NOT NULL, -- BASELINE, RANDOM_FOREST, ARIMA, PROPHET, LSTM
    target_variable VARCHAR(32) NOT NULL DEFAULT 'traffic_flow',
    temporal_aggregation_sec INTEGER NOT NULL DEFAULT 60,
    forecast_horizon_steps INTEGER NOT NULL DEFAULT 1, -- t+1, t+3, t+5
    train_split_ratio DECIMAL(3, 2) NOT NULL DEFAULT 0.80,
    random_seed INTEGER NOT NULL DEFAULT 42,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT, RUNNING, COMPLETED, FAILED
    execution_time_sec DECIMAL(8, 2),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_experiments_model ON experiments(model_type);
CREATE INDEX idx_experiments_status ON experiments(status);

CREATE TABLE model_parameters (
    id BIGSERIAL PRIMARY KEY,
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    parameter_name VARCHAR(64) NOT NULL CHECK (parameter_name ~ '^[a-zA-Z0-9_]+$'),
    parameter_value VARCHAR(255) NOT NULL,
    parameter_type VARCHAR(16) NOT NULL DEFAULT 'string'
);
CREATE INDEX idx_model_params_exp ON model_parameters(experiment_id);

CREATE TABLE forecast_results (
    id BIGSERIAL PRIMARY KEY,
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    step_ahead INTEGER NOT NULL, -- 1, 3, 5
    predicted_value DECIMAL(10, 2) NOT NULL,
    actual_value DECIMAL(10, 2),
    lower_bound DECIMAL(10, 2),
    upper_bound DECIMAL(10, 2)
);
CREATE INDEX idx_forecast_exp_time ON forecast_results(experiment_id, timestamp);

CREATE TABLE evaluation_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL UNIQUE REFERENCES experiments(id) ON DELETE CASCADE,
    mae DECIMAL(10, 4) NOT NULL,
    rmse DECIMAL(10, 4) NOT NULL,
    mape DECIMAL(8, 4) NOT NULL,
    r2_score DECIMAL(6, 4) NOT NULL,
    evaluated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- PHÂN HỆ 5: BÁO CÁO & TRỢ LÝ AI (REPORTING & GENAI ASSISTANT)
-- ====================================================================

CREATE TABLE traffic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL CHECK (length(trim(title)) >= 3),
    report_type VARCHAR(32) NOT NULL, -- TRAFFIC_PATTERN, FORECAST_BENCHMARK, EXPERIMENT_SUMMARY
    file_format VARCHAR(16) NOT NULL DEFAULT 'PDF', -- PDF, EXCEL
    file_path VARCHAR(512) NOT NULL,
    experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_assistant_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL,
    context_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_logs_user ON ai_assistant_logs(user_id);

-- ====================================================================
-- SEED MASTER DATA
-- ====================================================================

-- 1. Insert 4 Roles
INSERT INTO roles (id, name, description) VALUES
('admin', 'Administrator', 'Quản trị viên toàn quyền hệ thống, phê duyệt dataset và giám sát audit log'),
('data_engineer', 'Data Engineer', 'Kỹ sư tiếp nhận, kiểm định, làm sạch và tạo phiên bản dữ liệu UAV'),
('data_scientist', 'Data Scientist', 'Nhà nghiên cứu xây dựng mô hình dự báo, thiết lập thí nghiệm và đánh giá metrics'),
('business_user', 'Business User', 'Người dùng nghiệp vụ khai thác dashboard, xem bản đồ nhiệt và tương tác trợ lý AI');

-- 2. Insert Default Users (Admin, Data Scientist, Business User)
-- Password: 123
INSERT INTO users (id, email, hashed_password, full_name, role_id, is_active) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@gmail.com', '123', 'System Administrator', 'admin', TRUE),
('00000000-0000-0000-0000-000000000002', 'scientist@gmail.com', '123', 'Dr. Le Minh (Data Scientist)', 'data_scientist', TRUE),
('00000000-0000-0000-0000-000000000003', 'business@gmail.com', '123', 'Tran Thi Lan (Business User)', 'business_user', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Primary Benchmark Dataset (pNEUMA)
INSERT INTO datasets (id, name, code, source, description, capture_date, location_name, created_by) VALUES
('11111111-1111-1111-1111-111111111111', 'pNEUMA Athens CBD Dataset', 'PNEUMA_ATHENS', 'EPFL (Barmpounakis & Geroliminis, 2020)', 'Large-scale naturalistic traffic dataset captured by a swarm of 10 drones in central Athens, Greece', '2018-10-24', 'Athens Central Business District, Greece', '00000000-0000-0000-0000-000000000001');
