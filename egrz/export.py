"""Витрина данных: из SQLite в артефакты, которые читает дашборд.

Формат выгрузки — словарно сжатый (dictionary encoding): повторяющиеся
строковые значения (регион, организация, категория) заменяются индексами в
словаре. На реестре в сотни тысяч записей это уменьшает JSON в несколько раз
и позволяет дашборду фильтровать по целым числам, а не по строкам.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable, Sequence

from .models import COLUMNS
from .reference import COST_BUCKET_ORDER, FEDERAL_DISTRICTS, OBJECT_CATEGORIES
from .store import Store

#: Колонки, которые кодируются словарём: мало уникальных значений, много повторов.
DICTIONARY_COLUMNS: tuple[str, ...] = (
    "expertise_type", "result", "subject_matter", "object_category", "purpose",
    "region", "federal_district", "organization", "developer", "cost_bucket",
    "year", "quarter", "month", "region_code",
)

#: Колонки, по которым дашборд строит фасеты (в порядке отображения).
FACET_COLUMNS: tuple[str, ...] = (
    "federal_district", "region", "expertise_type", "result",
    "object_category", "purpose", "subject_matter", "organization", "cost_bucket",
)

#: Колонки полнотекстового поиска.
SEARCH_COLUMNS: tuple[str, ...] = (
    "object_name", "address", "organization", "developer",
    "conclusion_number", "registry_number",
)


def _iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------
# Кодирование
# --------------------------------------------------------------------------

def encode_dataset(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Кодирует записи в компактный формат ``{columns, dictionaries, rows}``."""
    dictionaries: dict[str, list[Any]] = {column: [] for column in DICTIONARY_COLUMNS}
    lookups: dict[str, dict[Any, int]] = {column: {} for column in DICTIONARY_COLUMNS}
    rows: list[list[Any]] = []

    for record in records:
        row: list[Any] = []
        for column in COLUMNS:
            value = record.get(column)
            if column in lookups:
                if value is None:
                    row.append(None)
                    continue
                index = lookups[column].get(value)
                if index is None:
                    index = len(dictionaries[column])
                    dictionaries[column].append(value)
                    lookups[column][value] = index
                row.append(index)
            elif column == "is_repeat":
                row.append(1 if value else 0)
            else:
                row.append(value)
        rows.append(row)

    return {
        "columns": list(COLUMNS),
        "dictionary_columns": list(DICTIONARY_COLUMNS),
        "dictionaries": dictionaries,
        "rows": rows,
    }


# --------------------------------------------------------------------------
# Агрегаты
# --------------------------------------------------------------------------

def build_aggregates(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Готовые срезы для потребителей, которым не нужен весь массив."""
    by_month: Counter[str] = Counter()
    by_month_negative: Counter[str] = Counter()
    by_region: Counter[str] = Counter()
    by_district: Counter[str] = Counter()
    by_category: Counter[str] = Counter()
    by_org: Counter[str] = Counter()
    by_cost_bucket: Counter[str] = Counter()
    by_expertise: Counter[str] = Counter()
    cost_by_district: defaultdict[str, float] = defaultdict(float)

    costs: list[float] = []
    positive = negative = repeats = 0

    for record in records:
        month = record.get("month")
        if month:
            by_month[month] += 1
        result = record.get("result")
        if result == "Положительное":
            positive += 1
        elif result == "Отрицательное":
            negative += 1
            if month:
                by_month_negative[month] += 1

        if record.get("is_repeat"):
            repeats += 1

        by_region[record.get("region") or "Не указан"] += 1
        district = record.get("federal_district") or "Не определён"
        by_district[district] += 1
        by_category[record.get("object_category") or "Прочее"] += 1
        by_expertise[record.get("expertise_type") or "Не указано"] += 1
        by_cost_bucket[record.get("cost_bucket") or "Не указана"] += 1

        organization = record.get("organization")
        if organization:
            by_org[organization] += 1

        cost = record.get("cost")
        if isinstance(cost, (int, float)) and cost > 0:
            costs.append(float(cost))
            cost_by_district[district] += float(cost)

    costs.sort()
    total = len(records)

    def percentile(fraction: float) -> float | None:
        if not costs:
            return None
        index = min(int(fraction * len(costs)), len(costs) - 1)
        return round(costs[index], 2)

    return {
        "totals": {
            "conclusions": total,
            "positive": positive,
            "negative": negative,
            "repeats": repeats,
            "positive_share": round(positive / total, 4) if total else None,
            "with_cost": len(costs),
            "cost_sum": round(sum(costs), 2) if costs else None,
            "cost_median": percentile(0.5),
            "cost_p90": percentile(0.9),
        },
        "by_month": [{"month": m, "count": c, "negative": by_month_negative.get(m, 0)}
                     for m, c in sorted(by_month.items())],
        "by_region": [{"region": r, "count": c} for r, c in by_region.most_common()],
        "by_federal_district": [
            {"district": d, "count": by_district.get(d, 0),
             "cost_sum": round(cost_by_district.get(d, 0.0), 2)}
            for d in FEDERAL_DISTRICTS
            if by_district.get(d)
        ],
        "by_object_category": [
            {"category": c, "count": by_category.get(c, 0)}
            for c in OBJECT_CATEGORIES if by_category.get(c)
        ],
        "by_expertise_type": [{"type": t, "count": c} for t, c in by_expertise.most_common()],
        "by_cost_bucket": [
            {"bucket": b, "count": by_cost_bucket.get(b, 0)}
            for b in COST_BUCKET_ORDER if by_cost_bucket.get(b)
        ],
        "top_organizations": [{"organization": o, "count": c} for o, c in by_org.most_common(25)],
    }


# --------------------------------------------------------------------------
# Запись артефактов
# --------------------------------------------------------------------------

def write_csv(records: Iterable[dict[str, Any]], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig: чтобы Excel открывал кириллицу без «крякозябр».
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(COLUMNS)
        for record in records:
            writer.writerow([record.get(column) for column in COLUMNS])
    return path


def write_json(payload: Any, path: Path, *, indent: int | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=indent, default=str),
        encoding="utf-8",
    )
    return path


def export_all(
    store: Store,
    out_dir: str | Path = "data/export",
    *,
    max_rows: int | None = None,
) -> dict[str, Any]:
    """Собирает полный комплект артефактов витрины.

    ``max_rows`` ограничивает датасет дашборда самыми свежими записями —
    CSV и агрегаты при этом остаются полными.
    """
    target = Path(out_dir)
    target.mkdir(parents=True, exist_ok=True)

    records = list(store.iter_records(order_by="date_registered DESC"))
    dashboard_records = records[:max_rows] if max_rows else records

    dataset = encode_dataset(dashboard_records)
    dataset.update(
        {
            "generated_at": _iso_now(),
            "facet_columns": list(FACET_COLUMNS),
            "search_columns": list(SEARCH_COLUMNS),
            "row_count": len(dashboard_records),
            "total_in_store": len(records),
            "truncated": bool(max_rows and len(records) > len(dashboard_records)),
        }
    )

    aggregates = build_aggregates(records)
    runs = store.recent_runs(60)

    meta = {
        "generated_at": _iso_now(),
        "source": "ЕГРЗ — egrz.ru",
        "last_sync_at": store.get_meta("last_sync_at"),
        "last_source_kind": store.get_meta("last_source_kind"),
        "records_total": len(records),
        "records_in_dashboard": len(dashboard_records),
        "date_min": min((r["date_registered"] for r in records if r.get("date_registered")), default=None),
        "date_max": max((r["date_registered"] for r in records if r.get("date_registered")), default=None),
        "runs": [
            {
                "run_id": run["run_id"],
                "started_at": run["started_at"],
                "status": run["status"],
                "fetched": run["fetched"],
                "inserted": run["inserted"],
                "updated": run["updated"],
            }
            for run in runs
        ],
    }

    write_json(dataset, target / "dataset.json")
    write_json(aggregates, target / "aggregates.json", indent=2)
    write_json(meta, target / "meta.json", indent=2)
    write_csv(records, target / "conclusions.csv")

    return {
        "dataset": str(target / "dataset.json"),
        "aggregates": str(target / "aggregates.json"),
        "meta": str(target / "meta.json"),
        "csv": str(target / "conclusions.csv"),
        "records": len(records),
        "dashboard_records": len(dashboard_records),
    }
