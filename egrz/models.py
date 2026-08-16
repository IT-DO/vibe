"""Нормализованная модель записи реестра ЕГРЗ.

Одна запись = одно заключение экспертизы, включённое в реестр.
Поля разделены на три группы:

* ``raw_*`` / исходные   — то, что пришло от источника без изменений;
* нормализованные        — приведённые к канону значения (регион, тип, дата);
* ``derived`` (см. :mod:`egrz.enrich`) — вычисляемые срезы для фильтров.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


#: Порядок колонок в плоских выгрузках (CSV/XLSX) и в таблице дашборда.
COLUMNS: tuple[str, ...] = (
    "id",
    "registry_number",
    "conclusion_number",
    "date_registered",
    "date_issued",
    "expertise_type",
    "result",
    "subject_matter",
    "is_repeat",
    "object_name",
    "object_category",
    "purpose",
    "address",
    "region",
    "region_code",
    "federal_district",
    "organization",
    "organization_inn",
    "developer",
    "developer_inn",
    "cost",
    "cost_bucket",
    "year",
    "quarter",
    "month",
    "source_url",
)


@dataclass(slots=True)
class Conclusion:
    """Одно заключение экспертизы в нормализованном виде."""

    # --- идентификация -------------------------------------------------
    id: str = ""
    registry_number: str = ""
    conclusion_number: str = ""

    # --- даты (ISO 8601, YYYY-MM-DD) -----------------------------------
    date_registered: str | None = None
    date_issued: str | None = None

    # --- классификация заключения --------------------------------------
    expertise_type: str = "Не указано"      # государственная / негосударственная
    result: str = "Не указано"              # положительное / отрицательное
    subject_matter: str = "Не указано"      # ПД / РИИ / ПД и РИИ / достоверность СС
    is_repeat: bool = False                 # повторная экспертиза

    # --- объект ---------------------------------------------------------
    object_name: str = ""
    object_category: str = "Прочее"         # вычисляется классификатором
    purpose: str = "Не определено"          # жилое / нежилое / линейный объект
    address: str = ""
    region: str = "Не указан"
    region_code: str | None = None
    federal_district: str = "Не определён"

    # --- участники ------------------------------------------------------
    organization: str = ""
    organization_inn: str | None = None
    developer: str = ""
    developer_inn: str | None = None

    # --- экономика ------------------------------------------------------
    cost: float | None = None               # сметная стоимость, руб.
    cost_bucket: str = "Не указана"

    # --- производные срезы времени --------------------------------------
    year: int | None = None
    quarter: str | None = None              # 2026-Q1
    month: str | None = None                # 2026-01

    # --- служебное -------------------------------------------------------
    source_url: str = ""
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    def to_dict(self, *, include_raw: bool = False) -> dict[str, Any]:
        data = dataclasses.asdict(self)
        if not include_raw:
            data.pop("raw", None)
        return data

    def to_row(self) -> list[Any]:
        """Плоская строка в порядке :data:`COLUMNS`."""
        data = self.to_dict()
        return [data.get(name) for name in COLUMNS]

    def fingerprint(self) -> str:
        """Хеш содержательных полей — для обнаружения изменений записи.

        В хеш не входят ``raw`` и производные поля: они пересчитываются из
        нормализованных, поэтому не могут измениться независимо.
        """
        payload = {
            name: getattr(self, name)
            for name in COLUMNS
            if name not in {"id", "year", "quarter", "month", "cost_bucket"}
        }
        blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:32]


def stable_id(*parts: Any) -> str:
    """Детерминированный идентификатор записи.

    Используется, когда источник не отдал собственный идентификатор:
    номер заключения + дата + объект дают устойчивый ключ, который не
    «поедет» между ежедневными запусками.
    """
    blob = "|".join("" if p is None else str(p).strip().lower() for p in parts)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:24]
