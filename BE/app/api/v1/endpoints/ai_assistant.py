"""The single AI Assistant HTTP endpoint."""

import threading
import time
from collections import defaultdict, deque
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.ai_assistant import AssistantRequest, AssistantResponse
from app.services.ai_assistant_service import run_assistant

router = APIRouter(prefix="/ai", tags=["Trợ lý AI"])
_rate_lock = threading.Lock()
_recent_calls: dict[UUID, deque[float]] = defaultdict(deque)
_RATE_LIMIT = 10
_RATE_WINDOW_SEC = 60


def _check_rate_limit(user_id: UUID) -> None:
    """Bound Gemini use per process; the provider also enforces its own shared quota."""
    now = time.monotonic()
    with _rate_lock:
        calls = _recent_calls[user_id]
        while calls and now - calls[0] >= _RATE_WINDOW_SEC:
            calls.popleft()
        if len(calls) >= _RATE_LIMIT:
            raise HTTPException(429, "Bạn đã gửi quá nhiều yêu cầu AI; vui lòng thử lại sau")
        calls.append(now)


@router.post(
    "/assistant",
    response_model=AssistantResponse,
    response_model_exclude_none=True,
    summary="Trợ lý Data Scientist bằng Gemini",
)
def assistant(
    payload: AssistantRequest = Body(openapi_examples={
        "chat": {
            "summary": "Chat với AI (không cần ID)",
            "value": {"action": "CHAT", "message": "Random Forest dự báo lưu lượng như thế nào?"},
        },
        "experiment_analysis": {
            "summary": "Phân tích thí nghiệm (thay UUID theo dữ liệu của bạn)",
            "value": {"action": "EXPERIMENT_ANALYSIS", "experiment_ids": [
                "5af4e12e-0b70-4516-936f-2376f550f9fe",
            ]},
        },
        "model_recommendation": {
            "summary": "Gợi ý cấu hình (thay UUID theo dữ liệu của bạn)",
            "value": {"action": "MODEL_RECOMMENDATION", "experiment_ids": [
                "5af4e12e-0b70-4516-936f-2376f550f9fe",
            ]},
        },
        "experiment_comparison": {
            "summary": "So sánh thí nghiệm (thay UUID theo dữ liệu của bạn)",
            "value": {"action": "EXPERIMENT_COMPARISON", "experiment_ids": [
                "5af4e12e-0b70-4516-936f-2376f550f9fe",
                "de3bc3a9-c134-47fa-91f0-f40141c19232",
            ]},
        },
        "forecast_explanation": {
            "summary": "Giải thích dự báo (thay ID bằng kết quả đã lưu)",
            "value": {"action": "FORECAST_EXPLANATION", "prediction_id": 1},
        },
    }),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssistantResponse:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Chỉ Data Scientist hoặc Admin được dùng trợ lý AI")
    _check_rate_limit(user.id)
    return run_assistant(db, payload, user)
