"""Infer a bounded assistant task from a natural-language question."""

import re
import unicodedata

from app.schemas.ai_assistant import AssistantAction


def normalize_question(question: str) -> str:
    """Fold Vietnamese accents while keeping word boundaries for intent matching."""
    decomposed = unicodedata.normalize("NFD", question.casefold()).replace("đ", "d")
    without_marks = "".join(
        char for char in decomposed if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"[^a-z0-9#]+", " ", without_marks).strip()


def infer_action(question: str) -> AssistantAction:
    """Use explicit task words; ambiguous questions stay in general chat."""
    normalized = normalize_question(question)
    if ("so sanh" in normalized and
            any(term in normalized for term in ("thi nghiem", "experiment"))):
        return AssistantAction.EXPERIMENT_COMPARISON
    if (any(term in normalized for term in ("goi y", "de xuat", "toi uu")) and
            any(term in normalized for term in ("cau hinh", "random forest", "mo hinh"))):
        return AssistantAction.MODEL_RECOMMENDATION
    if (any(term in normalized for term in ("phan tich", "danh gia", "nhan xet")) and
            any(term in normalized for term in ("thi nghiem", "experiment"))):
        return AssistantAction.EXPERIMENT_ANALYSIS
    if (any(term in normalized for term in ("giai thich", "phan tich", "nhan xet")) and
            any(term in normalized for term in ("du bao", "prediction"))):
        return AssistantAction.FORECAST_EXPLANATION
    return AssistantAction.CHAT


def asks_for_dataset_analysis(question: str) -> bool:
    normalized = normalize_question(question)
    return (
        any(term in normalized for term in ("dataset", "du lieu"))
        and any(term in normalized for term in (
            "phan tich", "danh gia", "tong quan", "chat luong", "kiem tra",
        ))
    )


def prediction_id_from_question(question: str) -> int | None:
    """Only treat an explicitly labeled ID as a forecast record ID."""
    normalized = normalize_question(question)
    match = re.search(r"(?:prediction id|du bao id|id du bao|#)\s*#?\s*(\d+)\b", normalized)
    return int(match.group(1)) if match else None
