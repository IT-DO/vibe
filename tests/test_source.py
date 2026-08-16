"""Тесты источника: разбор путей, сопоставление полей, пагинация, разведка."""

import json

import pytest

from egrz.discover import find_items_path, flatten_keys, suggest_field_map
from egrz.source import DemoSource, EgrzApiSource, SourceConfig, apply_field_map, dig


# ------------------------------------------------------------------ dig / map

def test_dig_nested_and_indexed():
    payload = {"a": {"b": [{"c": 42}]}}
    assert dig(payload, "a.b.0.c") == 42
    assert dig(payload, "a.b.5.c") is None
    assert dig(payload, "a.missing") is None
    assert dig(payload, "") is None


def test_dig_is_case_insensitive():
    """API отдаёт ключи то в camelCase, то в PascalCase."""
    assert dig({"ObjectName": "Школа"}, "objectName") == "Школа"
    assert dig({"objectname": "Школа"}, "ObjectName") == "Школа"


def test_apply_field_map_takes_first_non_empty():
    item = {"name": "", "objectName": "Школа", "id": "x1"}
    mapped = apply_field_map(item, {"object_name": ["name", "objectName"], "id": ["id"]})
    assert mapped == {"object_name": "Школа", "id": "x1"}


def test_apply_field_map_skips_absent():
    assert apply_field_map({}, {"cost": ["cost", "estimatedCost"]}) == {}


# --------------------------------------------------------------------- конфиг

def test_default_config_loads():
    config = SourceConfig.load()
    assert config.base_url.startswith("https://")
    assert "object_name" in config.field_map
    assert config.discovery_candidates


# ------------------------------------------------------------------ пагинация

class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.headers = {"content-type": "application/json"}
        self.text = json.dumps(payload, ensure_ascii=False)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeClient:
    """Отдаёт заранее заданные страницы и запоминает вызовы."""

    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        index = len(self.calls) - 1
        payload = self.pages[index] if index < len(self.pages) else {"value": []}
        return FakeResponse(payload)

    def close(self):
        pass


def make_item(n):
    return {
        "id": f"id-{n}",
        "objectName": f"Объект {n}",
        "dateRegistration": "2026-05-0{}".format((n % 9) + 1),
        "regionName": "Москва",
        "expertiseType": "Государственная экспертиза",
        "conclusionResult": "Положительное заключение",
        "estimatedCost": 100_000_000 + n,
    }


def build_source(pages, page_size=3):
    config = SourceConfig.load()
    config.paging = {"mode": "page", "page_size": page_size, "start_page": 1, "max_pages": 50}
    config.http = {**config.http, "rate_limit": 0, "retries": 0}
    client = FakeClient(pages)
    return EgrzApiSource(config, client=client), client


def test_pagination_walks_until_short_page():
    pages = [
        {"value": [make_item(1), make_item(2), make_item(3)]},
        {"value": [make_item(4), make_item(5), make_item(6)]},
        {"value": [make_item(7)]},          # неполная страница — обход завершается
    ]
    source, client = build_source(pages)
    items = list(source.iter_raw_items())
    assert len(items) == 7
    assert len(client.calls) == 3


def test_pagination_stops_on_empty_page():
    source, client = build_source([{"value": [make_item(1), make_item(2), make_item(3)]},
                                   {"value": []}])
    assert len(list(source.iter_raw_items())) == 3
    assert len(client.calls) == 2


def test_pagination_respects_limit():
    pages = [{"value": [make_item(i) for i in range(3)]} for _ in range(5)]
    source, _ = build_source(pages)
    assert len(list(source.iter_raw_items(limit=4))) == 4


def test_odata_placeholders_render_as_numbers():
    """$top/$skip должны уходить числами, а не строками «3»/«0»."""
    source, client = build_source([{"value": [make_item(1)]}])
    list(source.iter_raw_items())
    params = client.calls[0][2]["params"]
    assert params["$top"] == 3 and isinstance(params["$top"], int)
    assert params["$skip"] == 0 and isinstance(params["$skip"], int)
    assert params["$count"] == "true"


def test_odata_skip_advances_between_pages():
    pages = [
        {"value": [make_item(1), make_item(2), make_item(3)]},
        {"value": [make_item(4), make_item(5), make_item(6)]},
        {"value": [make_item(7)]},
    ]
    source, client = build_source(pages)
    list(source.iter_raw_items())
    assert [call[2]["params"]["$skip"] for call in client.calls] == [0, 3, 6]


def test_request_targets_open_api_odata_endpoint():
    """Конфиг должен указывать на тот же контроллер, что и ссылка на выгрузку."""
    config = SourceConfig.load()
    assert config.base_url == "https://open-api.egrz.ru"
    assert config.request["path"] == "/api/PublicRegistrationBook"
    assert config.response["items_path"] == "value"
    assert config.response["total_path"] == "@odata.count"


def test_iter_conclusions_normalizes():
    source, _ = build_source([{"value": [make_item(1)]}])
    records = list(source.iter_conclusions())
    assert len(records) == 1
    record = records[0]
    assert record.object_name == "Объект 1"
    assert record.region == "Москва"
    assert record.federal_district == "Центральный"
    assert record.expertise_type == "Государственная"
    assert record.source_url.endswith("id-1")


def test_since_filters_client_side():
    """Если API не умеет фильтровать по дате, отсекаем сами."""
    pages = [{"value": [
        {**make_item(1), "dateRegistration": "2026-01-10"},
        {**make_item(2), "dateRegistration": "2026-06-10"},
    ]}]
    source, _ = build_source(pages, page_size=2)
    records = list(source.iter_conclusions(since="2026-05-01"))
    assert [r.date_registered for r in records] == ["2026-06-10"]


def test_non_json_response_raises_helpful_error():
    class HtmlClient(FakeClient):
        def request(self, method, url, **kwargs):
            self.calls.append((method, url, kwargs))
            response = FakeResponse({})
            response.json = lambda: (_ for _ in ()).throw(ValueError("no json"))
            return response

    config = SourceConfig.load()
    config.http = {**config.http, "retries": 0, "rate_limit": 0}
    source = EgrzApiSource(config, client=HtmlClient([]))
    with pytest.raises(RuntimeError, match="discover"):
        list(source.iter_raw_items())


# --------------------------------------------------------------- demo-источник

def test_demo_source_is_deterministic():
    first = [r.id for r in DemoSource(count=50).iter_conclusions()]
    second = [r.id for r in DemoSource(count=50).iter_conclusions()]
    assert first == second


def test_demo_source_produces_valid_records():
    records = list(DemoSource(count=200).iter_conclusions())
    assert len(records) == 200
    assert all(r.date_registered for r in records)
    assert all(r.federal_district != "Не определён" for r in records)
    assert all(r.cost and r.cost > 0 for r in records)
    assert {r.result for r in records} <= {"Положительное", "Отрицательное"}


def test_demo_source_respects_since_and_limit():
    assert len(list(DemoSource(count=500).iter_conclusions(limit=10))) == 10
    records = list(DemoSource(count=500).iter_conclusions(since="2030-01-01"))
    assert records == []


# ------------------------------------------------------------------- разведка

def test_find_items_path():
    assert find_items_path({"value": [{"a": 1}]}) == "value"
    assert find_items_path({"items": [{"a": 1}]}) == "items"
    assert find_items_path([{"a": 1}]) == ""
    assert find_items_path({"payload": {"data": [{"a": 1}]}}) == "payload.data"
    assert find_items_path({"count": 5}) is None


def test_flatten_keys():
    flat = flatten_keys({"a": 1, "b": {"c": 2}, "d": [{"e": 3}]})
    assert flat["a"] == 1
    assert flat["b.c"] == 2
    assert flat["d.0.e"] == 3


def test_suggest_field_map_recognises_real_keys():
    sample = {
        "id": "guid",
        "objectName": "Школа",
        "dateRegistration": "2026-01-01",
        "expertOrganizationName": 'ООО "Эксперт"',
        "estimatedCost": 1000,
        "regionName": "Москва",
    }
    suggestion = suggest_field_map(sample)
    assert suggestion["object_name"][0] == "objectName"
    assert suggestion["date_registered"][0] == "dateRegistration"
    assert suggestion["organization"][0] == "expertOrganizationName"
    assert suggestion["cost"][0] == "estimatedCost"
    assert suggestion["region"][0] == "regionName"
