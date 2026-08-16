"""Тесты хранилища (инкрементальность) и витрины (кодирование, агрегаты)."""

import json

import pytest

from egrz.export import DICTIONARY_COLUMNS, FACET_COLUMNS, build_aggregates, encode_dataset, export_all
from egrz.models import COLUMNS
from egrz.normalize import build_conclusion
from egrz.source import DemoSource
from egrz.store import Store


@pytest.fixture()
def store(tmp_path):
    with Store(tmp_path / "test.sqlite3") as instance:
        yield instance


def record(**overrides):
    payload = {
        "id": "r1",
        "conclusion_number": "0001-2026",
        "date_registered": "2026-05-10",
        "object_name": "Детский сад",
        "region": "Москва",
        "expertise_type": "Государственная экспертиза",
        "result": "Положительное заключение",
        "organization": 'ООО "Эксперт"',
        "cost": 120_000_000,
    }
    payload.update(overrides)
    return build_conclusion(payload)


# ------------------------------------------------------------------ хранилище

def test_upsert_inserts_then_recognises_unchanged(store):
    stats = store.upsert_many([record()])
    assert (stats.inserted, stats.updated, stats.unchanged) == (1, 0, 0)

    stats = store.upsert_many([record()])
    assert (stats.inserted, stats.updated, stats.unchanged) == (0, 0, 1)
    assert store.count() == 1


def test_upsert_detects_change(store):
    store.upsert_many([record()])
    stats = store.upsert_many([record(result="Отрицательное заключение")])
    assert (stats.inserted, stats.updated, stats.unchanged) == (0, 1, 0)

    stored = next(store.iter_records())
    assert stored["result"] == "Отрицательное"
    assert store.count() == 1


def test_repeated_sync_is_idempotent(store):
    """Повторный запуск того же дня не должен плодить записи."""
    batch = list(DemoSource(count=120).iter_conclusions())
    store.upsert_many(batch)
    store.upsert_many(batch)
    assert store.count() == 120


def test_run_journal_records_success(store):
    with store.run(source="demo", since=None) as stats:
        store.upsert_many([record()], stats=stats)

    runs = store.recent_runs()
    assert runs[0]["status"] == "ok"
    assert runs[0]["inserted"] == 1
    assert store.get_meta("last_sync_at")


def test_run_journal_records_failure(store):
    with pytest.raises(RuntimeError):
        with store.run(source="api", since=None):
            raise RuntimeError("сеть недоступна")

    run = store.recent_runs()[0]
    assert run["status"] == "failed"
    assert "сеть недоступна" in run["error"]


def test_suggest_since_backs_off(store):
    """Записи попадают в реестр задним числом — «хвост» перечитываем заново."""
    store.upsert_many([record(date_registered="2026-05-10")])
    assert store.suggest_since(overlap_days=3) == "2026-05-07"
    assert store.suggest_since(overlap_days=0) == "2026-05-10"


def test_suggest_since_on_empty_store(store):
    assert store.suggest_since() is None


def test_iter_records_rejects_bad_sort(store):
    with pytest.raises(ValueError):
        list(store.iter_records(order_by="id; DROP TABLE conclusions"))


def test_is_repeat_roundtrips_as_bool(store):
    store.upsert_many([record(is_repeat=True)])
    assert next(store.iter_records())["is_repeat"] is True


# --------------------------------------------------------------------- витрина

def test_encode_dataset_roundtrip():
    records = [r.to_dict() for r in DemoSource(count=50).iter_conclusions()]
    dataset = encode_dataset(records)

    assert dataset["columns"] == list(COLUMNS)
    assert len(dataset["rows"]) == 50

    region_pos = dataset["columns"].index("region")
    regions = dataset["dictionaries"]["region"]
    for original, row in zip(records, dataset["rows"]):
        assert regions[row[region_pos]] == original["region"]


def test_encode_dataset_compresses_repeats():
    """Словарь должен быть заметно короче колонки — ради этого он и нужен."""
    records = [r.to_dict() for r in DemoSource(count=800).iter_conclusions()]
    dataset = encode_dataset(records)
    assert len(dataset["dictionaries"]["region"]) < 40
    assert len(dataset["dictionaries"]["organization"]) < 20


def test_encode_dataset_handles_none():
    dataset = encode_dataset([build_conclusion({"id": "x"}).to_dict()])
    assert dataset["rows"][0][dataset["columns"].index("cost")] is None


def test_dictionary_columns_exist_in_schema():
    assert set(DICTIONARY_COLUMNS) <= set(COLUMNS)


def test_build_aggregates_totals():
    records = [
        record(id="a", result="Положительное заключение", cost=100).to_dict(),
        record(id="b", result="Отрицательное заключение", cost=300).to_dict(),
        record(id="c", result="Положительное заключение", cost=200).to_dict(),
    ]
    aggregates = build_aggregates(records)
    totals = aggregates["totals"]

    assert totals["conclusions"] == 3
    assert totals["positive"] == 2
    assert totals["negative"] == 1
    assert totals["positive_share"] == pytest.approx(2 / 3, abs=1e-4)
    assert totals["cost_sum"] == 600
    assert totals["cost_median"] == 200


def test_build_aggregates_top_developers():
    """Застройщик — отдельный срез от экспертной организации: заказчик
    экспертизы и тот, кто её проводил, — разные компании."""
    records = [
        record(id="a", developer="ООО Стройка-1").to_dict(),
        record(id="b", developer="ООО Стройка-1").to_dict(),
        record(id="c", developer="ООО Стройка-2").to_dict(),
        record(id="d", developer="").to_dict(),  # без застройщика — не считается
    ]
    aggregates = build_aggregates(records)
    top = {item["developer"]: item["count"] for item in aggregates["top_developers"]}
    assert top == {"ООО Стройка-1": 2, "ООО Стройка-2": 1}


def test_facet_columns_include_developer():
    assert "developer" in FACET_COLUMNS


def test_build_aggregates_groups_sum_to_total():
    records = [r.to_dict() for r in DemoSource(count=300).iter_conclusions()]
    aggregates = build_aggregates(records)
    total = aggregates["totals"]["conclusions"]

    assert sum(item["count"] for item in aggregates["by_region"]) == total
    assert sum(item["count"] for item in aggregates["by_federal_district"]) == total
    assert sum(item["count"] for item in aggregates["by_object_category"]) == total
    assert sum(item["count"] for item in aggregates["by_month"]) == total


def test_build_aggregates_on_empty():
    aggregates = build_aggregates([])
    assert aggregates["totals"]["conclusions"] == 0
    assert aggregates["totals"]["positive_share"] is None
    assert aggregates["by_month"] == []


def test_export_all_writes_artifacts(store, tmp_path):
    store.upsert_many(DemoSource(count=150).iter_conclusions())
    out = tmp_path / "export"
    result = export_all(store, out)

    for name in ("dataset.json", "aggregates.json", "meta.json", "conclusions.csv"):
        assert (out / name).exists(), name

    dataset = json.loads((out / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["row_count"] == 150
    assert dataset["facet_columns"]
    assert result["records"] == 150

    csv_text = (out / "conclusions.csv").read_text(encoding="utf-8-sig")
    assert csv_text.splitlines()[0].split(";")[0] == "id"
    assert len(csv_text.strip().splitlines()) == 151


def test_export_max_rows_truncates_dashboard_only(store, tmp_path):
    store.upsert_many(DemoSource(count=200).iter_conclusions())
    out = tmp_path / "export"
    export_all(store, out, max_rows=50)

    dataset = json.loads((out / "dataset.json").read_text(encoding="utf-8"))
    aggregates = json.loads((out / "aggregates.json").read_text(encoding="utf-8"))

    assert dataset["row_count"] == 50
    assert dataset["truncated"] is True
    # Агрегаты и CSV остаются полными — усечение касается только дашборда.
    assert aggregates["totals"]["conclusions"] == 200


def test_export_dashboard_keeps_freshest_records(store, tmp_path):
    store.upsert_many(DemoSource(count=200).iter_conclusions())
    out = tmp_path / "export"
    export_all(store, out, max_rows=20)

    dataset = json.loads((out / "dataset.json").read_text(encoding="utf-8"))
    date_pos = dataset["columns"].index("date_registered")
    exported = [row[date_pos] for row in dataset["rows"]]
    newest = sorted((r["date_registered"] for r in store.iter_records()), reverse=True)[:20]
    assert sorted(exported, reverse=True) == newest
