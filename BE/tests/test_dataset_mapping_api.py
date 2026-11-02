from app.api.v1.endpoints.dataset_mapping import router


def test_column_mapping_routes_use_new_contract_only() -> None:
    route_contract = {
        (route.path, method)
        for route in router.routes
        for method in route.methods
    }

    assert ("/{dataset_id}/columns", "GET") in route_contract
    assert ("/{dataset_id}/column-mappings", "PATCH") in route_contract
    assert ("/{dataset_id}/column-mappings", "GET") in route_contract
    assert not any("/mapping/preview" in path for path, _ in route_contract)
