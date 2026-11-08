"""Deterministic topic gate and small document-backed knowledge retrieval."""

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

OUT_OF_SCOPE_MESSAGE = (
    "Tôi chỉ hỗ trợ các câu hỏi liên quan đến phân tích dữ liệu, thí nghiệm "
    "và dự báo giao thông trong hệ thống."
)
CLARIFICATION_MESSAGE = (
    "Bạn vui lòng nêu rõ nội dung muốn hỏi về dataset pNEUMA, lag features, "
    "train/test, thí nghiệm, MAE/RMSE hoặc dự báo giao thông."
)

_PROJECT_TERMS = (
    "pneuma",
    "uav",
    "random forest",
    "lag feature",
    "lag features",
    "feature engineering",
    "experiment",
    "train test",
    "experiment id",
    "thí nghiệm",
    "mae",
    "rmse",
    "dự báo",
    "dự đoán",
    "traffic flow",
    "giao thông",
    "lưu lượng",
    "dữ liệu giao thông",
    "tập train",
    "tập test",
    "test set",
    "training set",
    "train set",
)
_AMBIGUOUS_PHRASES = (
    "cai nay",
    "cai do",
    "nay the nao",
    "do the nao",
    "the nao",
    "sao vay",
    "tai sao",
    "giai thich",
    "what about this",
    "how about it",
    "this one",
)
_DOCUMENT_ROOT = Path(__file__).resolve().parents[2] / "docs"
_KNOWLEDGE_FILES = (
    "ai_assistant_knowledge.md",
    "feature_engineering.md",
    "train_test_split.md",
    "model_training.md",
    "model_prediction.md",
)
_MAX_CHUNKS = 4
_MAX_CHUNK_CHARS = 1800
_MAX_CONTEXT_CHARS = 5000
_STOPWORDS = {
    "about", "and", "are", "cua", "cho", "gi", "how", "is", "la", "nao", "of",
    "the", "this", "toi", "trong", "ve", "what", "with",
}


class KnowledgeChunk(BaseModel):
    source: str
    title: str
    content: str


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.casefold())
    without_marks = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", without_marks).strip()


def _contains_phrase(text: str, phrase: str) -> bool:
    return f" {phrase} " in f" {text} "


def _is_ambiguous(text: str) -> bool:
    terms = text.split()
    return len(terms) <= 8 and any(
        _contains_phrase(text, phrase) for phrase in _AMBIGUOUS_PHRASES
    )


def is_in_project_scope(question: str) -> bool:
    normalized = _normalize(question)
    return any(_contains_phrase(normalized, _normalize(term)) for term in _PROJECT_TERMS)


def classify_question(question: str) -> str:
    if is_in_project_scope(question):
        return "in_scope"
    if _is_ambiguous(_normalize(question)):
        return "unclear"
    return "out_of_scope"


def _split_document(source: str, text: str) -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []
    title = source
    paragraphs: list[str] = []

    def add_chunk() -> None:
        content = "\n\n".join(paragraphs).strip()
        if content:
            chunks.append(KnowledgeChunk(source=source, title=title, content=content))

    for line in text.splitlines():
        if line.startswith("#"):
            add_chunk()
            title = line.lstrip("# ").strip() or source
            paragraphs.clear()
        elif line.strip():
            paragraphs.append(line.strip())
        else:
            add_chunk()
            paragraphs.clear()
    add_chunk()
    return chunks


@lru_cache(maxsize=1)
def _load_knowledge_chunks() -> tuple[KnowledgeChunk, ...]:
    chunks = []
    for filename in _KNOWLEDGE_FILES:
        path = _DOCUMENT_ROOT / filename
        chunks.extend(_split_document(filename, path.read_text(encoding="utf-8")))
    return tuple(chunks)


def retrieve_knowledge(question: str) -> list[dict[str, str]]:
    """Return a bounded set of relevant, allowlisted project-document excerpts."""
    normalized_question = _normalize(question)
    query_terms = {
        term
        for term in normalized_question.split()
        if len(term) > 1 and term not in _STOPWORDS
    }
    if not query_terms:
        return []

    scored: list[tuple[int, KnowledgeChunk]] = []
    for chunk in _load_knowledge_chunks():
        normalized_content = _normalize(f"{chunk.title} {chunk.content}")
        content_terms = set(normalized_content.split())
        score = len(query_terms & content_terms)
        if score:
            scored.append((score, chunk))

    scored.sort(key=lambda item: (-item[0], item[1].source, item[1].title))
    selected: list[dict[str, str]] = []
    remaining = _MAX_CONTEXT_CHARS
    for _, chunk in scored:
        excerpt = chunk.content[:_MAX_CHUNK_CHARS].strip()
        if len(excerpt) > remaining:
            excerpt = excerpt[:remaining].rsplit(" ", 1)[0].strip()
        if not excerpt:
            break
        selected.append({
            "source": chunk.source,
            "section": chunk.title,
            "content": excerpt,
        })
        remaining -= len(excerpt)
        if len(selected) >= _MAX_CHUNKS or remaining <= 0:
            break
    return selected
