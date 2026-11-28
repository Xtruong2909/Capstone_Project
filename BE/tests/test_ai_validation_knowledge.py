"""The assistant recognizes the current workflow and retrieves its formulas."""

import pytest

from app.services.ai_scope_service import classify_question, retrieve_knowledge


@pytest.mark.parametrize("question", [
    "Validation là gì?", "MSE tính thế nào?", "Chọn cấu hình tốt nhất",
    "Tập xác thực dùng làm gì?",
])
def test_validation_questions_are_in_scope(question: str) -> None:
    assert classify_question(question) == "in_scope"


@pytest.mark.parametrize(("question", "expected"), [
    ("Chia Train Validation Test theo ngày tỷ lệ bao nhiêu?", "75/25"),
    ("Gộp RMSE các phiên như thế nào?", "n phiên × RMSE phiên^2"),
    ("Một session có 7 mẫu tạo bao nhiêu dự báo?", "21 dự báo"),
    ("Nút Chọn cấu hình tốt nhất làm gì?", "chạy Test cuối"),
])
def test_validation_knowledge_is_retrievable(question: str, expected: str) -> None:
    chunks = retrieve_knowledge(question)
    assert any(chunk["source"] == "ai_validation_knowledge.md"
               and expected in chunk["content"] for chunk in chunks)
