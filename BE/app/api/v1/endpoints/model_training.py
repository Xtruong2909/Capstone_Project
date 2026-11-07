from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.model_training import (
    EvaluationMode,
    ExperimentComparisonRequest,
    ExperimentComparisonResponse,
    TrainingExperimentResponse,
)
from app.services import model_training_service as service
from app.services.audit_log_service import record_audit_event

router = APIRouter(prefix="/model-training", tags=["Huấn luyện mô hình"])


@router.post(
    "/experiment", response_model=TrainingExperimentResponse, status_code=201,
    summary="Tạo thí nghiệm — nhập cấu hình trong Parameters",
)
def create_experiment(
    request: Request = None,
    split_id: UUID = Query(description="Copy split_id từ response của POST /api/train-test-split/training."),
    n_estimators: int = Query(default=100, ge=1, le=1000, description="Số cây."),
    max_depth: int = Query(default=10, ge=0, le=100, description="Độ sâu tối đa; nhập 0 để không giới hạn."),
    min_samples_split: int = Query(default=2, ge=2),
    min_samples_leaf: int = Query(default=1, ge=1),
    max_features: str = Query(default="1.0", description="Tỷ lệ: 1.0; số feature: 1..5; hoặc sqrt, log2, null."),
    bootstrap: bool = Query(default=True),
    random_state: int = Query(default=42, ge=0, le=4294967295),
    evaluation_mode: EvaluationMode = Query(default="exploratory"),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> TrainingExperimentResponse:
    """Nhấn Try it out rồi nhập cấu hình vào từng ô trong Parameters.

    Chia train/test trước, copy split_id vào ô Parameters rồi chọn cấu hình.
    Backend tự lấy dataset và toàn bộ Train/Test đã lưu theo split_id.
    Không chia lại dữ liệu. Không upload file. Dữ liệu ngắn dùng exploratory.
    """
    try:
        result = service.create_from_saved_split(
            db, split_id,
            {"n_estimators": n_estimators, "max_depth": max_depth or None,
             "min_samples_split": min_samples_split, "min_samples_leaf": min_samples_leaf,
             "max_features": max_features, "bootstrap": bootstrap, "random_state": random_state},
            evaluation_mode, user,
        )
    except Exception as exc:
        record_audit_event(
            action="TRAIN_MODEL",
            module="Model Training",
            status="FAILED",
            description="Model training failed",
            user=user,
            resource_id=split_id,
            ip_address=request.client.host if request and request.client else None,
            details={"error_type": type(exc).__name__},
        )
        raise

    failed = result.status == "FAILED"
    record_audit_event(
        action="TRAIN_MODEL",
        module="Model Training",
        status="FAILED" if failed else "SUCCESS",
        description="Model training failed" if failed else "Model training completed",
        user=user,
        resource_id=result.experiment_id,
        ip_address=request.client.host if request and request.client else None,
        details={"split_id": str(result.split_id), "evaluation_mode": result.evaluation_mode},
    )
    return result


@router.get("/experiments", response_model=list[TrainingExperimentResponse], summary="Danh sách thí nghiệm")
def list_experiments(
    dataset_version_id: UUID | None = None,
    skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> list[TrainingExperimentResponse]:
    return service.list_results(db, user, dataset_version_id, skip, limit)


# Static compare route must precede the UUID route.
@router.post("/experiments/compare", response_model=ExperimentComparisonResponse, summary="So sánh các thí nghiệm")
def compare_experiments(
    payload: ExperimentComparisonRequest,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> dict:
    return service.compare_results(db, payload.experiment_ids, user)


@router.get("/experiments/{experiment_id}", response_model=TrainingExperimentResponse, summary="Xem chi tiết thí nghiệm")
def get_experiment(
    experiment_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> TrainingExperimentResponse:
    return service.get_detail(db, experiment_id, user)
