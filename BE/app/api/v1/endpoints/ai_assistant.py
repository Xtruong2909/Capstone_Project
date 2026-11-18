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
    summary="Trợ lý AI phân tích Aggregation, thí nghiệm và dự báo",
)
def assistant(
    payload: AssistantRequest = Body(openapi_examples={
        "chat": {
            "summary": "Chat với AI (không cần ID)",
            "value": {"action": "CHAT", "message": "Random Forest dự báo lưu lượng như thế nào?"},
        },
        "experiment_analysis": {
            "summary": "Phân tích thí nghiệm Lag Features đã hoàn thành",
            "value": {"action": "EXPERIMENT_ANALYSIS", "experiment_ids": [
                "6706af09-6335-41b0-a5d1-7831763538fc",
            ]},
        },
        "model_recommendation": {
            "summary": "Gợi ý cấu hình (thay UUID theo dữ liệu của bạn)",
            "value": {"action": "MODEL_RECOMMENDATION", "experiment_ids": [
                "6706af09-6335-41b0-a5d1-7831763538fc",
            ]},
        },
        "experiment_comparison": {
            "summary": "So sánh thí nghiệm (thay UUID theo dữ liệu của bạn)",
            "value": {"action": "EXPERIMENT_COMPARISON", "experiment_ids": [
                "6706af09-6335-41b0-a5d1-7831763538fc",
                "a1bce81f-7f36-450e-afef-c6ea6694afb7",
            ]},
        },
        "forecast_explanation": {
            "summary": "Giải thích dự báo (lấy forecast_id từ API dự báo)",
            "value": {"action": "FORECAST_EXPLANATION",
                      "forecast_id": "6328fdae-47bd-4b8d-81a7-8b30ec50eddb"},
        },
        "aggregation_chat": {
            "summary": "Hỏi về nhóm tổng hợp và thí nghiệm mới nhất",
            "value": {"action": "CHAT", "group_id":
                      "ad8714dc-c786-49ce-8ee6-ce6e351863cb",
                      "message": "Phân tích thí nghiệm mới nhất của nhóm này"},
        },
    }),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssistantResponse:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Chỉ Data Scientist hoặc Admin được dùng trợ lý AI")
    _check_rate_limit(user.id)
    return run_assistant(db, payload, user)
