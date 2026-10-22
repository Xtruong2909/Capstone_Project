from app.api.v1.endpoints import datasets
from app.api.v1.endpoints.data_quality import router


def test_submit_dataset_version_route_is_registered() -> None:
    routes = {
        (route.path, method)
        for route in datasets.router.routes
        for method in route.methods
    }

    assert ("/{dataset_id}/versions/{version_id}/submit", "POST") in routes


def test_data_quality_routes_are_registered() -> None:
    routes = {
        (route.path, method)
        for route in router.routes
        for method in route.methods
    }

    assert (
        "/{dataset_id}/quality-checks",
        "POST",
    ) in routes
    assert (
        "/{dataset_id}/quality-checks/{check_id}",
        "GET",
    ) in routes
    assert (
        "/{dataset_id}/quality-checks/{check_id}/report",
        "GET",
    ) in routes
    assert (
        "/{dataset_id}/quality-checks/{check_id}/issues",
        "GET",
    ) in routes
