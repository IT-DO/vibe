"""Чтение Excel-выгрузки ЕГРЗ (`PublicRegistrationBook/excelDataFile`).

Реестр умеет отдавать сам себя файлом .xlsx — это самый простой способ забрать
данные: ссылку можно открыть в браузере, без разбора JSON-контракта. Модуль
принимает такой файл (или прямую ссылку на него) и превращает в те же
нормализованные записи, что и API-источник.

Заголовки колонок в выгрузке русские и со временем меняются, поэтому они не
зашиты списком, а сопоставляются по ключевым словам: «Наименование экспертной
организации», «Экспертная организация» и «Организация, проводившая экспертизу»
попадут в одно поле. Колонки, которые сопоставить не удалось, не выбрасываются
молча — они попадают в отчёт :attr:`ExcelSource.report`.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

from .models import Conclusion
from .normalize import build_conclusion


def _norm_header(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass(frozen=True, slots=True)
class HeaderRule:
    """Правило сопоставления заголовка колонки с полем модели."""

    target: str
    require: tuple[str, ...]              # все слова должны встретиться
    exclude: tuple[str, ...] = ()         # ни одного из этих быть не должно

    def matches(self, header: str) -> bool:
        return (
            all(word in header for word in self.require)
            and not any(word in header for word in self.exclude)
        )


#: Порядок значим: узкие правила стоят выше широких, иначе «ИНН экспертной
#: организации» будет поглощено правилом для самой организации.
HEADER_RULES: tuple[HeaderRule, ...] = (
    HeaderRule("organization_inn", ("инн",), ("застройщик", "заказчик", "заявител")),
    HeaderRule("developer_inn", ("инн",)),

    HeaderRule("registry_number", ("номер", "реестр")),
    HeaderRule("registry_number", ("регистрационный", "номер")),
    HeaderRule("conclusion_number", ("номер", "заключен")),
    HeaderRule("conclusion_number", ("номер",), ("объект", "дело")),

    HeaderRule("date_registered", ("дата", "реестр")),
    HeaderRule("date_registered", ("дата", "включен")),
    HeaderRule("date_registered", ("дата", "регистрац")),
    HeaderRule("date_issued", ("дата", "заключен")),
    HeaderRule("date_issued", ("дата", "экспертиз")),
    HeaderRule("date_issued", ("дата",), ("объект",)),

    HeaderRule("expertise_type", ("вид", "экспертиз"), ("предмет", "объект", "результат")),
    HeaderRule("expertise_type", ("тип", "экспертиз")),
    HeaderRule("result", ("результат",)),
    HeaderRule("result", ("вид", "заключен")),
    HeaderRule("subject_matter", ("предмет",)),
    HeaderRule("subject_matter", ("объект", "экспертиз")),
    HeaderRule("is_repeat", ("повторн",)),

    HeaderRule("object_name", ("наименование", "объект")),
    HeaderRule("object_name", ("объект", "капитальн")),
    HeaderRule("purpose", ("назначение",)),
    HeaderRule("address", ("адрес",)),
    HeaderRule("address", ("место", "располож")),
    HeaderRule("region", ("субъект",)),
    HeaderRule("region", ("регион",)),

    HeaderRule("organization", ("экспертн", "организац")),
    HeaderRule("organization", ("организац", "проводивш")),
    HeaderRule("organization", ("организац",), ("застройщик", "заказчик")),
    HeaderRule("developer", ("застройщик",)),
    HeaderRule("developer", ("технический", "заказчик")),
    HeaderRule("developer", ("заявител",)),

    HeaderRule("cost", ("сметн", "стоимост")),
    HeaderRule("cost", ("стоимост",)),
)


def map_headers(headers: list[Any]) -> tuple[dict[int, str], list[str]]:
    """Сопоставляет заголовки с полями модели.

    Возвращает ``(индекс колонки -> поле, список нераспознанных заголовков)``.
    Поле занимает первая подошедшая колонка: в выгрузке встречаются похожие
    заголовки, и дубль не должен затирать уже найденное значение.
    """
    mapping: dict[int, str] = {}
    taken: set[str] = set()
    unmapped: list[str] = []

    for index, raw in enumerate(headers):
        header = _norm_header(raw)
        if not header:
            continue
        for rule in HEADER_RULES:
            if rule.target in taken or not rule.matches(header):
                continue
            mapping[index] = rule.target
            taken.add(rule.target)
            break
        else:
            unmapped.append(str(raw).strip())

    return mapping, unmapped


def _score_header_row(row: list[Any]) -> int:
    """Насколько строка похожа на строку заголовков."""
    mapping, _ = map_headers(row)
    return len(mapping)


def read_rows(path: str | Path, *, sheet: str | None = None, probe_rows: int = 12) -> tuple[list[dict[str, Any]], list[str]]:
    """Читает .xlsx и возвращает ``(записи, нераспознанные заголовки)``.

    Строка заголовков ищется среди первых строк: в выгрузке над таблицей
    попадаются заголовок отчёта и пустые строки.
    """
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - зависимость объявлена в pyproject
        raise RuntimeError(
            "Для чтения Excel нужен openpyxl: pip install openpyxl"
        ) from exc

    workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
    worksheet = workbook[sheet] if sheet else workbook.worksheets[0]

    try:
        rows = worksheet.iter_rows(values_only=True)
        head: list[list[Any]] = []
        for row in rows:
            head.append(list(row))
            if len(head) >= probe_rows:
                break

        if not head:
            return [], []

        best_index = max(range(len(head)), key=lambda i: _score_header_row(head[i]))
        mapping, unmapped = map_headers(head[best_index])
        if not mapping:
            raise RuntimeError(
                "В файле не найдено ни одной узнаваемой колонки. "
                "Проверьте, что это выгрузка реестра ЕГРЗ, а не другой отчёт."
            )

        records: list[dict[str, Any]] = []

        def emit(row: list[Any]) -> None:
            item = {
                field_name: row[index]
                for index, field_name in mapping.items()
                if index < len(row) and row[index] not in (None, "")
            }
            if item:
                records.append(item)

        for row in head[best_index + 1:]:
            emit(row)
        for row in rows:
            emit(list(row))

        return records, unmapped
    finally:
        workbook.close()


def download(url: str, target: str | Path, *, timeout: float = 180.0) -> Path:
    """Скачивает файл выгрузки по ссылке."""
    import httpx

    destination = Path(target)
    destination.parent.mkdir(parents=True, exist_ok=True)
    headers = {
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
        "User-Agent": "egrz-daily/0.1",
    }
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
        with client.stream("GET", url) as response:
            response.raise_for_status()
            with destination.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)
    return destination


@dataclass
class ExcelSource:
    """Источник поверх Excel-выгрузки реестра.

    ``source`` — путь к скачанному файлу или прямая ссылка на
    ``.../PublicRegistrationBook/excelDataFile?...``.
    """

    source: str
    sheet: str | None = None
    cache_dir: str | Path = "data/downloads"
    report: dict[str, Any] = field(default_factory=dict)

    def _resolve(self) -> Path:
        if str(self.source).startswith(("http://", "https://")):
            target = Path(self.cache_dir) / "egrz-registry.xlsx"
            return download(self.source, target)
        path = Path(self.source)
        if not path.exists():
            raise RuntimeError(f"Файл не найден: {path}")
        return path

    def iter_conclusions(
        self, *, since: str | None = None, limit: int | None = None
    ) -> Iterator[Conclusion]:
        path = self._resolve()
        raw_records, unmapped = read_rows(path, sheet=self.sheet)

        self.report = {
            "file": str(path),
            "rows": len(raw_records),
            "unmapped_columns": unmapped,
        }

        produced = 0
        for item in raw_records:
            record = build_conclusion(dict(item), raw={})
            # В Excel-выгрузке дата включения в реестр может отсутствовать —
            # тогда инкрементальность опирается на дату заключения.
            anchor = record.date_registered or record.date_issued
            if since and anchor and anchor < since:
                continue
            yield record
            produced += 1
            if limit is not None and produced >= limit:
                return
