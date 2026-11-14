"""Build bounded, authorized facts and enforce deterministic evaluation safeguards."""

import math
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_ai_assistant as repo
from app.models.data_quality import DataQualityCheck
from app.models.user import User
from app.schemas.ai_assistant import (
    AssistantAction,
    AssistantRequest,
    AssistantResponse,
    ChatResponseResult,
    ExperimentAnalysisResult,
    ExperimentComparisonItem,
    ExperimentComparisonResult,
    ForecastExplanationResult,
    ModelRecommendationResult,
)
from app.services.ai_intent_service import (
    asks_for_dataset_analysis,
    forecast_id_from_question,
    infer_action,
    prediction_id_from_question,
)
from app.services.ai_scope_service import (
    CLARIFICATION_MESSAGE,
    OUT_OF_SCOPE_MESSAGE,
    classify_question,
    retrieve_knowledge,
)
from app.services.dataset_access_service import check_dataset_version_access
from app.services.ds_temporal_aggregation_service import get_accessible_temporal_jobs
from app.services.gemini_service import generate_analysis
from app.services.train_test_splits_service import get_accessible_split

SMALL_TEST_THRESHOLD = 10  # Advice only; never blocks training or changes eligibility.


def _resolve_chat_action(db: Session, request: AssistantRequest, user: User) -> AssistantRequest:
    """Choose a supported action when the question and saved context identify one."""
    if request.action != AssistantAction.CHAT or not request.message:
        return request
    action = infer_action(request.message)
    if action == AssistantAction.CHAT:
        return request
    required = 2 if action == AssistantAction.EXPERIMENT_COMPARISON else 1
    if action == AssistantAction.FORECAST_EXPLANATION and (
        request.forecast_id is not None or request.prediction_id is not None
    ):
        return request.model_copy(update={"action": action})
    if action in (
        AssistantAction.EXPERIMENT_ANALYSIS,
        AssistantAction.EXPERIMENT_COMPARISON,
        AssistantAction.MODEL_RECOMMENDATION,
    ) and len(request.experiment_ids) >= required:
        selected = request.experiment_ids[:1] if action == AssistantAction.EXPERIMENT_ANALYSIS else request.experiment_ids
        return request.model_copy(update={"action": action, "experiment_ids": selected})
    if request.experiment_ids or request.model_id:
        return request
    if action == AssistantAction.FORECAST_EXPLANATION:
        forecast_id = forecast_id_from_question(request.message)
        if forecast_id is None and request.aggregation_id is not None:
            latest_run = repo.get_latest_prediction_run_for_aggregation(
                db, request.aggregation_id, None if user.role_id == "admin" else user.id,
            )
            forecast_id = latest_run.id if latest_run else None
        if forecast_id is not None:
            return request.model_copy(update={"action": action, "forecast_id": forecast_id})
        prediction_id = prediction_id_from_question(request.message)
        if prediction_id is None and request.dataset_version_id is not None:
            latest = repo.get_latest_forecast_for_version(db, request.dataset_version_id)
            prediction_id = latest.id if latest else None
        return (request.model_copy(update={"action": action, "prediction_id": prediction_id})
                if prediction_id is not None else request)

    if request.aggregation_id is not None:
        experiments = repo.list_recent_aggregation_experiments(db, request.aggregation_id)
    elif request.dataset_version_id is not None:
        experiments = repo.list_recent_experiments(db, request.dataset_version_id)
    else:
        return request
    if len(experiments) < required:
        return request
    return request.model_copy(update={
        "action": action,
        "experiment_ids": [experiment.id for experiment in experiments[:required]],
    })


def _quality_context(check: DataQualityCheck | None) -> dict | None:
    if check is None:
        return None
    report = check.report or {}
    return {
        "status": check.status,
        "detected_structure": report.get("detected_structure"),
        "total_rows": report.get("total_rows"),
        "valid_rows": report.get("valid_rows"),
        "invalid_rows": report.get("invalid_rows"),
        "total_errors": report.get("total_errors"),
        "total_warnings": report.get("total_warnings"),
        "missing_required_columns": (report.get("missing_required_columns") or [])[:12],
        "errors_by_type": dict(list((report.get("errors_by_type") or {}).items())[:12]),
        "missing_values_by_column": (report.get("missing_values_by_column") or [])[:12],
    }


def _experiment_fact(db: Session, experiment_id: UUID, user: User) -> dict:
    experiment = repo.get_experiment(db, experiment_id)
    if experiment is None:
        raise HTTPException(404, f"Không tìm thấy thí nghiệm {experiment_id}")
    if getattr(experiment, "lag_feature_split_id", None) is not None:
        return _lag_experiment_fact(db, experiment, user)
    split = repo.get_split(db, experiment.split_id)
    if split is None:
        raise HTTPException(409, "Bộ chia Train/Test của thí nghiệm không còn tồn tại")
    check_dataset_version_access(user, split.dataset_version_id, db)
    if experiment.status != "COMPLETED":
        raise HTTPException(409, f"Thí nghiệm {experiment.name} chưa hoàn thành")
    if experiment.configuration.get("model") != "RANDOM_FOREST":
        raise HTTPException(422, "Chỉ hỗ trợ thí nghiệm Random Forest")
    raw_metrics = experiment.performance_by_horizon or {}
    metrics = {}
    counts = []
    for horizon in (1, 3, 5):
        horizon_metrics = raw_metrics.get(str(horizon), {})
        models = {}
        for name in ("random_forest", "persistence", "historical_average"):
            item = horizon_metrics.get(name)
            if not isinstance(item, dict):
                raise HTTPException(422, f"Thiếu kết quả {name} tại horizon +{horizon}")
            mae, rmse = item.get("mae"), item.get("rmse")
            if (not isinstance(mae, (int, float)) or not isinstance(rmse, (int, float))
                    or not math.isfinite(mae) or not math.isfinite(rmse)
                    or mae < 0 or rmse < 0):
                raise HTTPException(422, "Chỉ số MAE/RMSE đã lưu không hợp lệ")
            models[name] = {"mae": mae, "rmse": rmse}
            if name == "random_forest":
                counts.append(item.get("sample_count", 0))
        metrics[str(horizon)] = models
    rows = [row for row in (experiment.prediction_rows or []) if row.get("model") == "RANDOM_FOREST"]
    test_signature = sorted(
        (row.get("horizon_minutes"), row.get("forecast_origin_time"),
         row.get("target_timestamp"), row.get("actual_traffic_flow"))
        for row in rows
    )
    complete_test = (
        len(test_signature) == len(set(test_signature))
        and all(sum(row.get("horizon_minutes") == h for row in rows) == counts[index]
                for index, h in enumerate((1, 3, 5)))
    )
    return {
        "experiment_id": str(experiment.id), "experiment_name": experiment.name,
        "dataset_version_id": str(split.dataset_version_id), "split_id": str(split.id),
        "status": experiment.status, "forecast_horizons": experiment.configuration.get("forecast_horizons"),
        "hyperparameters": experiment.configuration.get("hyperparameters", {}),
        "evaluation_mode": experiment.evaluation.get("evaluation_mode"),
        "official_evaluation_eligible": experiment.evaluation.get("official_evaluation_eligible", False),
        "evaluation_policy": experiment.evaluation.get("evaluation_policy"),
        "test_sample_count": min(counts) if counts else 0,
        "training_time_sec": experiment.training_time_sec,
        "prediction_time_sec": experiment.prediction_time_sec,
        "performance_by_horizon": metrics,
        "_test_signature": test_signature,
        "_complete_test": complete_test,
    }


def _lag_experiment_fact(db: Session, experiment: object, user: User) -> dict:
    split, generation = get_accessible_split(db, user, experiment.lag_feature_split_id)
    if experiment.status != "COMPLETED":
        raise HTTPException(409, f"Thí nghiệm {experiment.name} chưa hoàn thành")
    configuration = experiment.configuration or {}
    if configuration.get("model") != "RANDOM_FOREST":
        raise HTTPException(422, "Chỉ hỗ trợ thí nghiệm Random Forest")
    rows = repo.get_evaluation_metrics(db, experiment.id)
    metrics: dict[str, dict[str, dict[str, float]]] = {}
    counts: dict[tuple[str, int], int] = {}
    for model, horizon, count, mae, mse in rows:
        if model not in ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE") or horizon not in (1, 3, 5):
            continue
        if (not count or mae is None or mse is None or not math.isfinite(float(mae))
                or not math.isfinite(float(mse)) or mae < 0 or mse < 0):
            raise HTTPException(409, "Chỉ số đánh giá đã lưu không hợp lệ")
        metrics.setdefault(str(horizon), {})[model.lower()] = {
            "mae": float(mae), "rmse": math.sqrt(float(mse)),
        }
        counts[(model, horizon)] = count
    if any(set(metrics.get(str(h), {})) != {
        "random_forest", "persistence", "historical_average",
    } for h in (1, 3, 5)):
        raise HTTPException(409, "Thí nghiệm thiếu chỉ số đánh giá đã lưu")
    if any(len({counts[(model, horizon)] for model in (
        "RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE",
    )}) != 1 for horizon in (1, 3, 5)):
        raise HTTPException(409, "Các mô hình không cùng số mẫu Test")
    signature = [
        (str(dataset), str(session), horizon, origin.isoformat(),
         actual_time.isoformat(), float(actual))
        for dataset, session, horizon, origin, actual_time, actual
        in repo.get_test_signature(db, experiment.id)
    ]
    complete = (len(signature) == len(set(signature))
                and all(sum(row[2] == horizon for row in signature) == counts[("RANDOM_FOREST", horizon)]
                        for horizon in (1, 3, 5)))
    job = repo.get_aggregation_job(db, generation.aggregation_id)
    metadata = (job.job_metadata or {}) if job else {}
    evaluation = experiment.evaluation or {}
    return {
        "experiment_id": str(experiment.id), "experiment_name": experiment.name,
        "dataset_version_id": None, "split_id": str(split.id),
        "feature_generation_id": str(generation.id),
        "aggregation_id": str(generation.aggregation_id),
        "group_id": metadata.get("group_id"), "status": experiment.status,
        "forecast_horizons": configuration.get("forecast_horizons"),
        "hyperparameters": configuration.get("hyperparameters", {}),
        "evaluation_mode": evaluation.get("evaluation_mode"),
        "official_evaluation_eligible": evaluation.get("official_evaluation_eligible", False),
        "evaluation_policy": evaluation.get("evaluation_policy"),
        "test_sample_count": min(counts[("RANDOM_FOREST", h)] for h in (1, 3, 5)),
        "training_time_sec": experiment.training_time_sec,
        "prediction_time_sec": experiment.prediction_time_sec,
        "performance_by_horizon": metrics,
        "_test_signature": signature, "_complete_test": complete,
    }


def _forecast_fact(db: Session, prediction_id: int, user: User) -> dict:
    anchor = repo.get_forecast(db, prediction_id)
    if anchor is None:
        raise HTTPException(404, "Không tìm thấy kết quả dự báo")
    if anchor.model_id is None or anchor.last_observed_time is None:
        raise HTTPException(422, "Dự báo này không liên kết với Final Model")
    model = repo.get_final_model(db, anchor.model_id)
    if model is None:
        raise HTTPException(409, "Final Model của dự báo không còn tồn tại")
    check_dataset_version_access(user, model.dataset_version_id, db)
    points = repo.get_forecast_group(db, model.id, anchor.last_observed_time)
    if len(points) != 3 or {point.horizon_minutes for point in points} != {1, 3, 5}:
        raise HTTPException(409, "Dự báo chưa đủ các mốc +1, +3, +5 phút")
    return {
        "prediction_id": prediction_id, "model_id": str(model.id),
        "experiment_id": str(model.experiment_id),
        "dataset_version_id": str(model.dataset_version_id),
        "last_observed_time": anchor.last_observed_time.isoformat(),
        "forecasts": [
            {"horizon_minutes": point.horizon_minutes,
             "forecast_time": point.timestamp.isoformat(),
             "predicted_flow": float(point.predicted_value),
             "actual_flow": float(point.actual_value) if point.actual_value is not None else None}
            for point in points
        ],
    }


def _forecast_run_fact(db: Session, forecast_id: UUID, user: User) -> dict:
    run = repo.get_prediction_run(db, forecast_id)
    if run is None or (user.role_id != "admin" and run.created_by != user.id):
        raise HTTPException(404, "Không tìm thấy dự báo")
    experiment = _experiment_fact(db, run.experiment_id, user)
    if experiment.get("aggregation_id") is None:
        raise HTTPException(409, "Dự báo không thuộc quy trình Lag Features")
    if run.status not in ("COMPLETED", "PARTIAL"):
        raise HTTPException(409, "Dự báo chưa hoàn thành")
    points = repo.get_prediction_results(db, run.id)
    if not points:
        raise HTTPException(409, "Dự báo chưa có kết quả đã lưu")
    athens = ZoneInfo("Europe/Athens")
    return {
        "forecast_id": str(run.id), "experiment_id": str(run.experiment_id),
        "aggregation_id": experiment["aggregation_id"], "group_id": experiment["group_id"],
        "dataset_version_id": None, "status": run.status,
        "session_count": run.session_count, "timezone": "Europe/Athens",
        "session_errors": run.session_errors,
        "forecasts": [
            {
                "dataset_id": str(point.dataset_id), "session_id": str(point.session_id),
                "model_id": str(point.model_id), "horizon_minutes": point.horizon,
                "last_observed_time": point.forecast_origin_time.astimezone(athens).isoformat(),
                "forecast_time": point.forecast_timestamp.astimezone(athens).isoformat(),
                "predicted_vehicle_count": float(point.predicted_vehicle_count),
                "actual_vehicle_count": (
                    float(point.actual_vehicle_count)
                    if point.actual_vehicle_count is not None else None
                ),
                "lag_features": point.lag_features,
            }
            for point in points
        ],
    }


def _model_fact(db: Session, model_id: UUID, user: User) -> dict:
    model = repo.get_final_model(db, model_id)
    if model is None:
        trained = repo.get_trained_model(db, model_id)
        if trained is None:
            raise HTTPException(404, "Không tìm thấy mô hình")
        experiment = _experiment_fact(db, trained.experiment_id, user)
        return {
            "model_id": str(trained.model_id), "experiment_id": str(trained.experiment_id),
            "dataset_version_id": None, "aggregation_id": experiment["aggregation_id"],
            "group_id": experiment["group_id"], "split_id": experiment["split_id"],
            "forecast_horizons": [trained.horizon],
            "hyperparameters": trained.hyperparameters,
            "status": trained.status,
        }
    check_dataset_version_access(user, model.dataset_version_id, db)
    return {
        "model_id": str(model.id), "experiment_id": str(model.experiment_id),
        "dataset_version_id": str(model.dataset_version_id),
        "split_id": str(model.split_id),
        "forecast_horizons": model.forecast_horizons,
        "hyperparameters": model.hyperparameters,
        "trained_through": model.trained_through.isoformat(),
    }


def _quality_warnings(facts: list[dict]) -> list[str]:
    warnings = []
    for fact in facts:
        name = fact["experiment_name"]
        if fact["test_sample_count"] < SMALL_TEST_THRESHOLD:
            warnings.append(
                f"{name}: chỉ có {fact['test_sample_count']} mẫu Test; kết luận có thể thiếu ổn định."
            )
        if not fact["official_evaluation_eligible"]:
            warnings.append(f"{name}: chưa đủ điều kiện đánh giá chính thức.")
    return warnings


def _comparable(facts: list[dict]) -> bool:
    first = facts[0]
    keys = ("dataset_version_id", "split_id", "evaluation_policy", "evaluation_mode",
            "forecast_horizons", "_test_signature")
    return bool(first["_test_signature"]) and all(fact["_complete_test"] for fact in facts) and all(
        all(fact[key] == first[key] for key in keys) for fact in facts[1:]
    )


def _best_experiment(facts: list[dict]) -> UUID:
    # Equal weight for the three horizons; RMSE resolves equal mean MAE.
    def score(fact: dict) -> tuple[float, float, str]:
        scores = [fact["performance_by_horizon"][str(h)]["random_forest"] for h in (1, 3, 5)]
        return (math.fsum(item["mae"] for item in scores) / 3,
                math.fsum(item["rmse"] for item in scores) / 3,
                fact["experiment_id"])

    return UUID(min(facts, key=score)["experiment_id"])


def _scope_response(action: AssistantAction, message: str) -> AssistantResponse:
    if action == AssistantAction.CHAT:
        result = ChatResponseResult(message=message)
    elif action == AssistantAction.EXPERIMENT_ANALYSIS:
        result = ExperimentAnalysisResult(summary=message)
    elif action == AssistantAction.MODEL_RECOMMENDATION:
        result = ModelRecommendationResult(summary=message)
    elif action == AssistantAction.EXPERIMENT_COMPARISON:
        result = ExperimentComparisonResult(summary=message)
    else:
        result = ForecastExplanationResult(summary=message)
    return AssistantResponse(action=action, result=result)


def run_assistant(db: Session, request: AssistantRequest, user: User) -> AssistantResponse:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Chỉ Data Scientist hoặc Admin được dùng trợ lý AI")
    if request.message is not None:
        scope = classify_question(request.message)
        if scope == "out_of_scope":
            return _scope_response(request.action, OUT_OF_SCOPE_MESSAGE)
        if scope == "unclear":
            return _scope_response(request.action, CLARIFICATION_MESSAGE)

    if request.dataset_version_id is not None:
        check_dataset_version_access(user, request.dataset_version_id, db)
    if request.group_id is not None:
        if request.aggregation_id is None:
            latest_job = repo.get_latest_group_aggregation(db, request.group_id)
            if latest_job is None:
                raise HTTPException(404, "Nhóm chưa có lượt tổng hợp thời gian đã hoàn thành")
            request = request.model_copy(update={"aggregation_id": latest_job.id})
        else:
            selected_job = repo.get_aggregation_job(db, request.aggregation_id)
            if (selected_job is None or
                    (selected_job.job_metadata or {}).get("group_id") != str(request.group_id)):
                raise HTTPException(422, "aggregation_id không thuộc group_id được chọn")
    if request.aggregation_id is not None:
        get_accessible_temporal_jobs(db, user, request.aggregation_id)
    request = _resolve_chat_action(db, request, user)

    knowledge_query = request.message or {
        AssistantAction.EXPERIMENT_ANALYSIS: "thí nghiệm MAE RMSE",
        AssistantAction.MODEL_RECOMMENDATION: "Random Forest thí nghiệm",
        AssistantAction.EXPERIMENT_COMPARISON: "thí nghiệm train test MAE RMSE",
        AssistantAction.FORECAST_EXPLANATION: "dự báo prediction giao thông",
        AssistantAction.CHAT: "",
    }[request.action]
    knowledge = retrieve_knowledge(knowledge_query)
    facts = [_experiment_fact(db, experiment_id, user) for experiment_id in request.experiment_ids]
    if request.dataset_version_id is not None and any(
        fact["dataset_version_id"] != str(request.dataset_version_id) for fact in facts
    ):
        raise HTTPException(422, "Thí nghiệm không thuộc dataset_version_id được chọn")

    forecast = (
        _forecast_run_fact(db, request.forecast_id, user) if request.forecast_id else
        _forecast_fact(db, request.prediction_id, user) if request.prediction_id else None
    )
    model = _model_fact(db, request.model_id, user) if request.model_id else None
    if request.dataset_version_id is not None and any(
        item is not None and item["dataset_version_id"] != str(request.dataset_version_id)
        for item in (forecast, model)
    ):
        raise HTTPException(422, "Model hoặc dự báo không thuộc dataset_version_id được chọn")
    if request.aggregation_id is not None and any(
        item.get("aggregation_id") != str(request.aggregation_id)
        for item in (*facts, *[value for value in (forecast, model) if value is not None])
    ):
        raise HTTPException(422, "Thí nghiệm, mô hình hoặc dự báo không thuộc aggregation_id")
    if request.action == AssistantAction.CHAT and not facts and forecast is None and model is None:
        if request.aggregation_id is not None:
            jobs = get_accessible_temporal_jobs(db, user, request.aggregation_id)
            context = {
                "aggregation_id": str(request.aggregation_id),
                "group_id": (jobs[0].job_metadata or {}).get("group_id"),
                "datasets": len(jobs),
                "sessions": sum(job.total_sessions for job in jobs),
                "time_bins": sum(job.records_created for job in jobs),
                "recent_experiments": [
                    {"experiment_id": str(item.id), "name": item.name, "status": item.status}
                    for item in repo.list_recent_aggregation_experiments(db, request.aggregation_id)
                ],
            }
        elif request.dataset_version_id is None:
            context = {"note": "Chưa chọn dữ liệu dự án. Chỉ trả lời kiến thức chung; "
                               "không khẳng định số liệu của dự án."}
        else:
            version = repo.get_dataset_version(db, request.dataset_version_id)
            if version is None:
                raise HTTPException(404, "Không tìm thấy phiên bản dataset")
            recent = repo.list_recent_experiments(db, request.dataset_version_id)
            models = repo.list_final_models(db, request.dataset_version_id)
            dataset = getattr(version, "dataset", None)
            context = {"dataset_version_id": str(request.dataset_version_id),
                       "dataset": {"dataset_id": str(version.dataset_id),
                                   "name": dataset.name if dataset else None,
                                   "description": (dataset.description or "")[:400] if dataset else None,
                                   "location_name": dataset.location_name if dataset else None,
                                   "version_tag": version.version_tag,
                                   "file_format": version.file_format,
                                   "total_records": version.total_records,
                                   "approval_status": version.approval_status},
                       "recent_experiments": [{"experiment_id": str(item.id),
                                               "name": item.name, "status": item.status}
                                              for item in recent],
                       "final_models": [{"model_id": str(item.id),
                                         "experiment_id": str(item.experiment_id)}
                                        for item in models],
                       "note": "Các thí nghiệm và dự báo chỉ được phân tích chi tiết khi có dữ liệu đã lưu."}
            if request.message and asks_for_dataset_analysis(request.message):
                context["quality_check"] = _quality_context(
                    repo.get_latest_quality_check(db, request.dataset_version_id)
                )
                context["traffic_overview"] = repo.get_traffic_overview(
                    db, request.dataset_version_id
                )
                context["analysis_scope"] = (
                    "Phân tích phiên bản dataset hiện tại dựa trên metadata, báo cáo chất lượng "
                    "và dữ liệu tổng hợp đã lưu. Nếu phần nào chưa có, nói rõ; không suy diễn "
                    "kết quả của toàn bộ file từ thông tin thiếu."
                )
    else:
        context = {"experiments": [{k: v for k, v in fact.items() if not k.startswith("_")}
                                   for fact in facts]}
    context["knowledge_base"] = knowledge
    if forecast is not None:
        context["forecast"] = forecast
    if model is not None:
        context["model"] = model

    comparable = len(facts) > 1 and _comparable(facts)
    if request.action in (AssistantAction.EXPERIMENT_COMPARISON,
                          AssistantAction.MODEL_RECOMMENDATION) and len(facts) > 1:
        context["comparable"] = comparable
        context["comparison_rule"] = "Cùng dataset, split, chính sách đánh giá và tập Test"
    result = generate_analysis(request.action, context, request.message)
    if request.action == AssistantAction.CHAT:
        message = result.message
        if not message:
            raise HTTPException(502, "Gemini không trả về nội dung chat hợp lệ")
        response_result = ChatResponseResult(message=message)
    elif request.action == AssistantAction.EXPERIMENT_ANALYSIS:
        if not result.summary:
            raise HTTPException(502, "Gemini không trả về phần tóm tắt phân tích")
        response_result = ExperimentAnalysisResult(
            summary=result.summary,
            strengths=result.strengths or None,
            weaknesses=result.weaknesses or None,
            recommendations=result.recommendations or None,
        )
    elif request.action == AssistantAction.MODEL_RECOMMENDATION:
        if not result.summary or result.suggested_configuration is None or not result.reason:
            raise HTTPException(
                502,
                "Gemini không trả về đủ summary, suggested_configuration và reason",
            )
        response_result = ModelRecommendationResult(
            summary=result.summary,
            suggested_configuration=result.suggested_configuration,
            reason=result.reason,
        )
    elif request.action == AssistantAction.EXPERIMENT_COMPARISON:
        if not result.summary:
            raise HTTPException(502, "Gemini không trả về phần tóm tắt so sánh")
        response_result = ExperimentComparisonResult(
            summary=result.summary,
            best_experiment_id=_best_experiment(facts) if comparable else None,
            comparison=[
                ExperimentComparisonItem(
                    experiment_id=fact["experiment_id"],
                    experiment_name=fact["experiment_name"],
                    performance_by_horizon=fact["performance_by_horizon"],
                )
                for fact in facts
            ],
        )
    else:
        if not result.summary or not result.forecast_trends or not result.explanation:
            raise HTTPException(
                502,
                "Gemini không trả về đủ summary, forecast_trends và explanation",
            )
        response_result = ForecastExplanationResult(
            summary=result.summary,
            forecast_trends=result.forecast_trends,
            explanation=result.explanation,
        )
    return AssistantResponse(action=request.action, result=response_result)
