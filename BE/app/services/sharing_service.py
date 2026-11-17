"""Authorization and allowlisted read models for Result Sharing Management."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_sharing as repo
from app.models.sharing import (
    SHARE_STATUSES,
    VISIBLE_SECTIONS_BY_TYPE,
    SharedReport,
    SharedReportItem,
)
from app.models.user import User
from app.services.dataset_access_service import check_dataset_access
from app.services.train_test_splits_service import get_accessible_split

DETAIL_PAGE_SIZE = 20
PAGED_SECTIONS = {
    "DATASET": {"sessions", "traffic_flow_chart"},
    "EXPERIMENT": {"prediction_rows"},
    "PREDICTION": {"forecast_results", "forecast_chart"},
}


def _error(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(http_status, {"code": code, "message": message})


def _not_found() -> HTTPException:
    return _error("SHARE_NOT_FOUND", "Không tìm thấy kết quả đã chia sẻ", 404)


def require_owner(share: SharedReport, user: User) -> None:
    if user.role_id != "admin" and share.created_by != user.id:
        raise _error("SHARE_ACCESS_DENIED", "Bạn không sở hữu bản chia sẻ này", 403)


def validate_share_status(
    current: str | None, requested: str, item_count: int,
    has_visible_sections: bool,
) -> None:
    if requested not in SHARE_STATUSES:
        raise _error("INVALID_SHARE_STATUS", "Trạng thái chia sẻ không hợp lệ", 422)
    if current is None and requested == "REVOKED":
        raise _error("INVALID_SHARE_STATUS", "Chỉ có thể thu hồi bản chia sẻ đã tạo", 422)
    if current == "REVOKED":
        raise _error("SHARE_ALREADY_REVOKED", "Bản chia sẻ đã bị thu hồi", 409)
    if current == "PUBLISHED" and requested == "DRAFT":
        raise _error("INVALID_SHARE_STATUS", "Không thể chuyển bản đã công bố về nháp", 409)
    if requested == "PUBLISHED" and (item_count == 0 or not has_visible_sections):
        raise _error("INVALID_SHARE_STATUS", "Cần ít nhất một nội dung để công bố", 422)


def _require_resource(db: Session, user: User, item: dict[str, Any]) -> None:
    kind: str = item["resource_type"]
    resource_id: UUID = item["resource_id"]
    if kind == "DATASET":
        dataset = repo.get_dataset(db, resource_id)
        if dataset is None:
            raise _error("RESOURCE_NOT_FOUND", "Không tìm thấy Dataset", 404)
        try:
            check_dataset_access(user, dataset.id, db)
        except HTTPException as exc:
            raise _error("SHARE_ACCESS_DENIED", "Không có quyền chia sẻ Dataset", 403) from exc
        pinned_id = item.get("resource_version_id")
        version = (
            repo.get_version(db, pinned_id) if pinned_id else
            repo.get_latest_approved_version(db, dataset.id)
        )
        if version is None or version.dataset_id != dataset.id or version.approval_status != "APPROVED":
            raise _error("RESOURCE_NOT_SHAREABLE", "Dataset chưa có phiên bản đã duyệt", 422)
        item["resource_version_id"] = version.id
    elif kind == "TRAIN_TEST":
        split = repo.get_split(db, resource_id)
        if split is None:
            raise _error("RESOURCE_NOT_FOUND", "Không tìm thấy Train/Test Split", 404)
        if split.status != "COMPLETED":
            raise _error("RESOURCE_NOT_SHAREABLE", "Train/Test Split chưa hoàn thành", 422)
        try:
            get_accessible_split(db, user, resource_id)
        except HTTPException as exc:
            raise _error("SHARE_ACCESS_DENIED", "Không có quyền chia sẻ Train/Test Split", 403) from exc
    elif kind == "EXPERIMENT":
        experiment = repo.get_experiment(db, resource_id)
        if experiment is None:
            raise _error("RESOURCE_NOT_FOUND", "Không tìm thấy thí nghiệm", 404)
        if experiment.status != "COMPLETED":
            raise _error("RESOURCE_NOT_SHAREABLE", "Thí nghiệm chưa hoàn thành", 422)
        if user.role_id != "admin" and experiment.created_by != user.id:
            raise _error("SHARE_ACCESS_DENIED", "Không sở hữu thí nghiệm", 403)
        if experiment.lag_feature_split_id is not None:
            try:
                get_accessible_split(db, user, experiment.lag_feature_split_id)
            except HTTPException as exc:
                raise _error("SHARE_ACCESS_DENIED", "Không còn quyền với thí nghiệm", 403) from exc
        elif experiment.dataset_id is not None:
            try:
                check_dataset_access(user, experiment.dataset_id, db)
            except HTTPException as exc:
                raise _error("SHARE_ACCESS_DENIED", "Không còn quyền với Dataset thí nghiệm", 403) from exc
        else:
            raise _error("RESOURCE_NOT_SHAREABLE", "Không xác minh được Dataset thí nghiệm", 422)
    elif kind == "PREDICTION":
        prediction = repo.get_prediction(db, resource_id)
        if prediction is None:
            raise _error("RESOURCE_NOT_FOUND", "Không tìm thấy dự báo", 404)
        if prediction.status != "COMPLETED":
            raise _error("RESOURCE_NOT_SHAREABLE", "Dự báo chưa hoàn thành", 422)
        if user.role_id != "admin" and prediction.created_by != user.id:
            raise _error("SHARE_ACCESS_DENIED", "Không sở hữu dự báo", 403)
        experiment = repo.get_experiment(db, prediction.experiment_id)
        if experiment is None or experiment.status != "COMPLETED":
            raise _error("RESOURCE_NOT_SHAREABLE", "Thí nghiệm nguồn không còn hợp lệ", 422)
        if experiment.lag_feature_split_id is None:
            raise _error("RESOURCE_NOT_SHAREABLE", "Dự báo không có Train/Test Split", 422)
        try:
            get_accessible_split(db, user, experiment.lag_feature_split_id)
        except HTTPException as exc:
            raise _error("SHARE_ACCESS_DENIED", "Không còn quyền với dữ liệu dự báo", 403) from exc
    else:
        raise _error("INVALID_RESOURCE_TYPE", "Loại tài nguyên không hợp lệ", 422)


def validate_and_check_items(db: Session, items_data: list[dict[str, Any]], user: User) -> None:
    """Validate every resource before either transaction; pin the approved Dataset version."""
    seen: set[tuple[str, UUID]] = set()
    for item in items_data:
        kind = item["resource_type"]
        resource_id = item["resource_id"]
        key = (kind, resource_id)
        if key in seen:
            raise _error("DUPLICATE_SHARE_ITEM", "Tài nguyên xuất hiện nhiều lần", 409)
        seen.add(key)
        allowed = VISIBLE_SECTIONS_BY_TYPE.get(kind)
        if allowed is None:
            raise _error("INVALID_RESOURCE_TYPE", "Loại tài nguyên không hợp lệ", 422)
        if set(item["visible_sections"]) - allowed:
            raise _error("INVALID_VISIBLE_SECTION", "Nội dung hiển thị không hợp lệ", 422)
        item["visible_sections"] = list(dict.fromkeys(item["visible_sections"]))
        _require_resource(db, user, item)


def require_published_share(db: Session, share_id: UUID) -> SharedReport:
    share = repo.get_share_by_id(db, share_id)
    if share is None or share.status != "PUBLISHED" or share.visibility != "BUSINESS_USER":
        raise _not_found()
    owner = repo.get_user(db, share.created_by)
    if owner is None or not owner.is_active:
        raise _not_found()
    # Revoked Dataset grants, deleted resources and changed statuses take effect immediately.
    try:
        validate_and_check_items(db, [
            {
                "resource_type": item.resource_type,
                "resource_id": item.resource_id,
                "resource_version_id": item.resource_version_id,
                "visible_sections": item.visible_sections,
            }
            for item in share.items
        ], owner)
    except HTTPException as exc:
        raise _not_found() from exc
    return share


def resource_name(resource_type: str, resource: Any) -> str:
    if resource_type == "DATASET":
        return resource.name
    if resource_type == "EXPERIMENT":
        return resource.name
    stamp = getattr(resource, "created_at", None)
    label = "Train/Test" if resource_type == "TRAIN_TEST" else "Dự báo"
    return f"{label} · {stamp.strftime('%d/%m/%Y %H:%M') if stamp else str(resource.id)[:8]}"


def managed_resource_name(db: Session, item: SharedReportItem, fallback: str) -> str:
    resource = {
        "DATASET": repo.get_dataset, "TRAIN_TEST": repo.get_split,
        "EXPERIMENT": repo.get_experiment, "PREDICTION": repo.get_prediction,
    }[item.resource_type](db, item.resource_id)
    return resource_name(item.resource_type, resource) if resource is not None else fallback


def available_resources(
    db: Session, user: User, *, resource_type: str, search: str | None,
    page: int, page_size: int,
) -> tuple[list[dict[str, Any]], int]:
    """List only persisted resources the caller may share."""
    candidates: list[dict[str, Any]] = []
    for resource in repo.list_resource_candidates(db, resource_type):
        name = resource_name(resource_type, resource)
        if search and search.casefold() not in name.casefold():
            continue
        item = {"resource_type": resource_type, "resource_id": resource.id}
        try:
            _require_resource(db, user, item)
        except HTTPException:
            continue
        candidates.append({
            "resource_type": resource_type, "resource_id": resource.id,
            "name": name, "created_at": getattr(resource, "created_at", None),
        })
    total = len(candidates)
    selected = candidates[(page - 1) * page_size:page * page_size]
    shared = repo.active_share_ids(
        db, [(item["resource_type"], item["resource_id"]) for item in selected],
    )
    for item in selected:
        item["is_shared"] = (item["resource_type"], item["resource_id"]) in shared
    return selected, total


def prepare_resource_shares(
    db: Session, user: User, resources: list[tuple[str, UUID]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Validate each requested resource independently and retain per-item errors."""
    prepared: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    seen: set[tuple[str, UUID]] = set()
    for kind, resource_id in resources:
        key = (kind, resource_id)
        if key in seen:
            failures.append({"resource_type": kind, "resource_id": resource_id,
                             "success": False, "message": "Tài nguyên bị chọn trùng."})
            continue
        seen.add(key)
        if kind not in VISIBLE_SECTIONS_BY_TYPE:
            failures.append({"resource_type": kind, "resource_id": resource_id,
                             "success": False, "message": "Loại tài nguyên không hợp lệ."})
            continue
        item = {"resource_type": kind, "resource_id": resource_id,
                "visible_sections": sorted(VISIBLE_SECTIONS_BY_TYPE[kind])}
        try:
            _require_resource(db, user, item)
        except HTTPException as exc:
            detail = exc.detail
            failures.append({"resource_type": kind, "resource_id": resource_id,
                             "success": False,
                             "message": detail.get("message", "Không thể chia sẻ tài nguyên.")
                             if isinstance(detail, dict) else str(detail)})
            continue
        resource = {
            "DATASET": repo.get_dataset, "TRAIN_TEST": repo.get_split,
            "EXPERIMENT": repo.get_experiment, "PREDICTION": repo.get_prediction,
        }[kind](db, resource_id)
        item["name"] = resource_name(kind, resource)
        prepared.append(item)
    return prepared, failures


def count_unshared_resources(db: Session, user: User) -> int:
    total = 0
    for kind in VISIBLE_SECTIONS_BY_TYPE:
        rows, _ = available_resources(
            db, user, resource_type=kind, search=None, page=1, page_size=1000000,
        )
        total += sum(not row["is_shared"] for row in rows)
    return total


def _session_row(session: Any) -> dict[str, Any]:
    return {
        "session_id": str(session.id),
        "session_name": session.original_filename,
        "recording_date": session.recording_date.isoformat(),
        "scheduled_start": session.scheduled_start.isoformat(),
        "scheduled_end": session.scheduled_end.isoformat(),
    }


def _traffic_row(row: Any) -> dict[str, Any]:
    return {
        "session_id": str(row.recording_session_id),
        "timestamp": row.time_bucket.isoformat(),
        "vehicle_count": row.vehicle_count,
    }


def _experiment_row(row: Any) -> dict[str, Any]:
    return {
        "session_id": str(row.session_id),
        "model": row.model_type,
        "horizon": row.horizon,
        "input_timestamp": row.input_timestamp.isoformat(),
        "forecast_timestamp": row.forecast_timestamp.isoformat(),
        "actual_timestamp": row.actual_timestamp.isoformat(),
        "actual_vehicle_count": row.actual_vehicle_count,
        "predicted_vehicle_count": row.predicted_vehicle_count,
        "absolute_error": row.absolute_error,
        "squared_error": row.squared_error,
    }


def _forecast_row(row: Any) -> dict[str, Any]:
    return {
        "session_id": str(row.session_id),
        "horizon": row.horizon,
        "forecast_timestamp": row.forecast_timestamp.isoformat(),
        "predicted_vehicle_count": row.predicted_vehicle_count,
        "actual_vehicle_count": row.actual_vehicle_count,
    }


def page_item_section(
    db: Session, share: SharedReport | None, item: SharedReportItem,
    section: str, page: int, page_size: int,
) -> dict[str, Any]:
    allowed = PAGED_SECTIONS.get(item.resource_type, set())
    if section not in item.visible_sections or section not in allowed:
        raise _error("SHARE_ACCESS_DENIED", "Nội dung này chưa được chia sẻ", 403)
    if item.resource_type == "DATASET":
        if item.resource_version_id is None:
            raise _not_found()
        if section == "sessions":
            total, rows = repo.page_dataset_sessions(db, item.resource_version_id, page, page_size)
            data = [_session_row(row) for row in rows]
        else:
            total, rows = repo.page_traffic_bins(db, item.resource_version_id, page, page_size)
            data = [_traffic_row(row) for row in rows]
    elif item.resource_type == "EXPERIMENT":
        total, rows = repo.page_experiment_predictions(db, item.resource_id, page, page_size)
        data = [_experiment_row(row) for row in rows]
    else:
        total, rows = repo.page_forecast_results(db, item.resource_id, page, page_size)
        data = [_forecast_row(row) for row in rows]
    if section != "sessions":
        names = repo.get_session_names(db, {
            UUID(row["session_id"]) for row in data if row.get("session_id")
        })
        for row in data:
            row["session_name"] = names.get(row["session_id"])
    return {
        "share_id": share.id if share else item.share_id,
        "item_id": item.id, "section": section,
        "page": page, "page_size": page_size, "total_records": total, "data": data,
    }


def _dataset_sections(db: Session, item: SharedReportItem) -> dict[str, Any]:
    dataset = repo.get_dataset(db, item.resource_id)
    version = repo.get_version(db, item.resource_version_id)
    result: dict[str, Any] = {}
    if "metadata" in item.visible_sections:
        result["metadata"] = {
            "dataset_id": str(dataset.id), "dataset_name": dataset.name,
            "dataset_version_id": str(version.id), "version_tag": version.version_tag,
            "source": dataset.source, "recording_date": (
                dataset.recording_date.isoformat() if dataset.recording_date else None
            ),
        }
    if "statistics" in item.visible_sections:
        session_count, _ = repo.page_dataset_sessions(db, version.id, 1, 1)
        result["statistics"] = {
            "dataset_version_id": str(version.id), "total_records": version.total_records,
            "session_count": session_count,
        }
    for section in ("sessions", "traffic_flow_chart"):
        if section in item.visible_sections:
            result[section] = page_item_section(db, None, item, section, 1, DETAIL_PAGE_SIZE)
    return result


def _split_sections(db: Session, item: SharedReportItem) -> dict[str, Any]:
    split = repo.get_split(db, item.resource_id)
    result: dict[str, Any] = {}
    if "split_summary" in item.visible_sections:
        result["split_summary"] = {
            "split_id": str(split.id), "status": split.status,
            "feature_generation_id": str(split.feature_generation_id),
            "total_sessions": split.total_sessions, "total_samples": split.total_samples,
        }
    if "train_test_counts" in item.visible_sections:
        result["train_test_counts"] = {
            "train_sample_count": split.train_sample_count,
            "test_sample_count": split.test_sample_count,
            "samples_by_horizon": split.samples_by_horizon,
        }
    if "session_distribution" in item.visible_sections:
        names = repo.get_session_names(db, {
            UUID(row["session_id"])
            for row in [*split.train_sessions, *split.test_sessions]
        })
        result["session_distribution"] = {
            "train_sessions": [
                {**row, "session_name": names.get(row["session_id"])}
                for row in split.train_sessions
            ],
            "test_sessions": [
                {**row, "session_name": names.get(row["session_id"])}
                for row in split.test_sessions
            ],
        }
    if "split_configuration" in item.visible_sections:
        result["split_configuration"] = {
            "split_strategy": split.split_strategy,
            "train_ratio_requested": split.train_ratio_requested,
            "train_ratio_actual": split.train_ratio_actual,
            "shuffle": split.shuffle, "forecast_horizons": split.forecast_horizons,
        }
    return result


def _experiment_sections(db: Session, item: SharedReportItem) -> dict[str, Any]:
    exp = repo.get_experiment(db, item.resource_id)
    metrics = exp.performance_by_model_and_horizon or {}
    result: dict[str, Any] = {}
    if "experiment_summary" in item.visible_sections:
        result["experiment_summary"] = {
            "experiment_id": str(exp.id), "experiment_name": exp.name,
            "model": (exp.configuration or {}).get("model"), "status": exp.status,
        }
    if "hyperparameters" in item.visible_sections:
        result["hyperparameters"] = {
            str(model.horizon): model.hyperparameters for model in repo.get_models(db, exp.id)
        }
    if "evaluation_metrics" in item.visible_sections:
        result["evaluation_metrics"] = metrics
    if "baseline_comparison" in item.visible_sections:
        result["baseline_comparison"] = metrics
    if "horizon_comparison" in item.visible_sections:
        result["horizon_comparison"] = exp.performance_by_horizon or {}
    if "prediction_rows" in item.visible_sections:
        result["prediction_rows"] = page_item_section(db, None, item, "prediction_rows", 1, DETAIL_PAGE_SIZE)
    return result


def _prediction_sections(db: Session, item: SharedReportItem) -> dict[str, Any]:
    run = repo.get_prediction(db, item.resource_id)
    result: dict[str, Any] = {}
    snapshot_names = repo.get_session_names(db, {
        UUID(snapshot["session_id"]) for snapshot in run.session_snapshots
    }) if ("lag_features" in item.visible_sections or "forecast_chart" in item.visible_sections) else {}
    if "forecast_summary" in item.visible_sections:
        result["forecast_summary"] = {
            "forecast_id": str(run.id), "status": run.status,
            "session_count": run.session_count, "forecast_horizons": run.requested_horizons,
            "created_at": run.created_at.isoformat(),
        }
    if "model_information" in item.visible_sections:
        result["model_information"] = {
            "model_ids": {
                horizon: model["model_id"] for horizon, model in run.model_artifacts.items()
            },
        }
    if "lag_features" in item.visible_sections:
        result["lag_features"] = [
            {"session_id": snapshot["session_id"],
             "session_name": snapshot.get("original_filename") or snapshot_names.get(snapshot["session_id"]),
             "lag_features": snapshot["lag_features"]}
            for snapshot in run.session_snapshots
        ]
    if "forecast_results" in item.visible_sections:
        result["forecast_results"] = page_item_section(db, None, item, "forecast_results", 1, DETAIL_PAGE_SIZE)
    if "forecast_chart" in item.visible_sections:
        result["forecast_chart"] = {
            "historical": [
                {"session_id": snapshot["session_id"],
                 "session_name": snapshot.get("original_filename") or snapshot_names.get(snapshot["session_id"]),
                 "points": snapshot["historical"]}
                for snapshot in run.session_snapshots[:DETAIL_PAGE_SIZE]
            ],
            "forecast": page_item_section(db, None, item, "forecast_chart", 1, DETAIL_PAGE_SIZE),
        }
    return result


_ASSEMBLERS = {
    "DATASET": _dataset_sections,
    "TRAIN_TEST": _split_sections,
    "EXPERIMENT": _experiment_sections,
    "PREDICTION": _prediction_sections,
}


def assemble_shared_result_detail(db: Session, share: SharedReport) -> dict[str, Any]:
    return {
        "share_id": share.id, "title": share.title, "status": share.status,
        "resources": [
            {
                "item_id": item.id, "resource_type": item.resource_type,
                "resource_id": item.resource_id,
                "resource_version_id": item.resource_version_id,
                "visible_sections": item.visible_sections,
                "data": _ASSEMBLERS[item.resource_type](db, item),
            }
            for item in share.items
        ],
    }
