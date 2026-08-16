"""Источник данных ЕГРЗ: конфигурируемый HTTP-клиент + офлайн-заглушка.

Контракт публичного API ЕГРЗ не опубликован и меняется вместе с сайтом,
поэтому endpoint, пагинация и сопоставление полей заданы в YAML
(``egrz/sources/egrz.yaml``), а не зашиты в код. Команда ``egrz discover``
проверяет кандидатов и подсказывает, как заполнить конфиг.
"""

from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator, Protocol

import yaml

from .models import Conclusion
from .normalize import build_conclusion

DEFAULT_CONFIG = Path(__file__).parent / "sources" / "egrz.yaml"


# --------------------------------------------------------------------------
# Конфиг
# --------------------------------------------------------------------------

@dataclass(slots=True)
class SourceConfig:
    name: str = "egrz"
    title: str = "ЕГРЗ"
    base_url: str = "https://egrz.ru"
    record_url_template: str = ""
    http: dict[str, Any] = field(default_factory=dict)
    request: dict[str, Any] = field(default_factory=dict)
    response: dict[str, Any] = field(default_factory=dict)
    paging: dict[str, Any] = field(default_factory=dict)
    field_map: dict[str, list[str]] = field(default_factory=dict)
    discovery_candidates: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def load(cls, path: str | Path | None = None) -> "SourceConfig":
        target = Path(path) if path else DEFAULT_CONFIG
        data = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
        known = {f.name for f in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in known})


# --------------------------------------------------------------------------
# Извлечение значений по путям
# --------------------------------------------------------------------------

def dig(payload: Any, path: str) -> Any:
    """Достаёт значение по пути вида ``a.b.0.c``. Нет — ``None``."""
    current = payload
    for part in path.split("."):
        if current is None:
            return None
        if isinstance(current, list):
            if not part.isdigit() or int(part) >= len(current):
                return None
            current = current[int(part)]
        elif isinstance(current, dict):
            if part in current:
                current = current[part]
            else:
                # Ключи API приходят то в camelCase, то в PascalCase.
                lowered = {k.lower(): k for k in current}
                key = lowered.get(part.lower())
                if key is None:
                    return None
                current = current[key]
        else:
            return None
    return current


def apply_field_map(item: dict[str, Any], field_map: dict[str, list[str]]) -> dict[str, Any]:
    """Применяет сопоставление: наше имя поля -> первое непустое значение."""
    mapped: dict[str, Any] = {}
    for target, candidates in field_map.items():
        paths = [candidates] if isinstance(candidates, str) else candidates
        for path in paths:
            value = dig(item, path)
            if value not in (None, "", [], {}):
                mapped[target] = value
                break
    return mapped


# --------------------------------------------------------------------------
# Протокол источника
# --------------------------------------------------------------------------

class Source(Protocol):
    """Всё, что умеет отдавать нормализованные записи, годится как источник."""

    def iter_conclusions(
        self, *, since: str | None = None, limit: int | None = None
    ) -> Iterator[Conclusion]: ...


# --------------------------------------------------------------------------
# HTTP-источник
# --------------------------------------------------------------------------

class EgrzApiSource:
    """Постраничный обход публичного реестра ЕГРЗ."""

    def __init__(self, config: SourceConfig | None = None, *, client: Any = None) -> None:
        self.config = config or SourceConfig.load()
        self._client = client
        self._owns_client = client is None

    # --- HTTP-механика ---------------------------------------------------

    def _get_client(self) -> Any:
        if self._client is None:
            import httpx  # импорт здесь, чтобы офлайн-режим не требовал зависимости

            http = self.config.http
            self._client = httpx.Client(
                timeout=http.get("timeout", 60),
                headers=http.get("headers", {}),
                follow_redirects=True,
            )
        return self._client

    def close(self) -> None:
        if self._client is not None and self._owns_client:
            self._client.close()
            self._client = None

    def __enter__(self) -> "EgrzApiSource":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        """Запрос с экспоненциальным откатом на сетевых ошибках и 5xx/429."""
        http = self.config.http
        retries = int(http.get("retries", 4))
        backoff = float(http.get("backoff", 2.0))
        client = self._get_client()

        last_error: Exception | None = None
        for attempt in range(retries + 1):
            try:
                response = client.request(method, url, **kwargs)
                if response.status_code in (429, 500, 502, 503, 504):
                    raise RuntimeError(f"HTTP {response.status_code} от {url}")
                response.raise_for_status()
                return response
            except Exception as exc:  # noqa: BLE001 — ретраим любую сетевую беду
                last_error = exc
                if attempt == retries:
                    break
                time.sleep(backoff * (2**attempt))
        raise RuntimeError(f"Запрос {method} {url} не удался: {last_error}") from last_error

    # --- Пагинация -------------------------------------------------------

    def _build_call(self, page: int, offset: int, since: str | None) -> dict[str, Any]:
        request = self.config.request
        paging = self.config.paging
        page_size = int(paging.get("page_size", 100))

        substitutions = {
            "page": page,
            "page_size": page_size,
            "offset": offset,
            "since": since or "",
        }

        def render(value: Any) -> Any:
            if isinstance(value, str):
                rendered = value.format(**substitutions)
                # "{page}" -> 3 (число), а не "3": API обычно ждёт число.
                return int(rendered) if rendered.lstrip("-").isdigit() else rendered
            if isinstance(value, dict):
                return {k: render(v) for k, v in value.items()}
            if isinstance(value, list):
                return [render(v) for v in value]
            return value

        base = request.get("base_url") or self.config.base_url
        call: dict[str, Any] = {
            "method": request.get("method", "GET").upper(),
            "url": base.rstrip("/") + "/" + str(request.get("path", "")).lstrip("/"),
            "kwargs": {},
        }
        if request.get("query"):
            call["kwargs"]["params"] = render(request["query"])
        if request.get("json_body"):
            call["kwargs"]["json"] = render(request["json_body"])
        return call

    def iter_raw_items(
        self, *, since: str | None = None, limit: int | None = None
    ) -> Iterator[dict[str, Any]]:
        """Сырые записи источника, страница за страницей."""
        paging = self.config.paging
        page_size = int(paging.get("page_size", 100))
        max_pages = int(paging.get("max_pages", 2000))
        page = int(paging.get("start_page", 1))
        rate_limit = float(self.config.http.get("rate_limit", 0.0))

        items_path = self.config.response.get("items_path", "value")
        total_path = self.config.response.get("total_path")

        seen = 0
        offset = 0
        total: int | None = None

        for _ in range(max_pages):
            call = self._build_call(page, offset, since)
            response = self._request(call["method"], call["url"], **call["kwargs"])
            try:
                payload = response.json()
            except (json.JSONDecodeError, ValueError) as exc:
                raise RuntimeError(
                    f"{call['url']} вернул не JSON. Проверьте конфиг источника "
                    f"или запустите `egrz discover`. ({exc})"
                ) from exc

            items = dig(payload, items_path) if items_path else payload
            if items is None and isinstance(payload, list):
                items = payload
            if not items:
                return

            if total is None and total_path:
                raw_total = dig(payload, total_path)
                total = int(raw_total) if isinstance(raw_total, (int, float, str)) and str(raw_total).isdigit() else None

            for item in items:
                if isinstance(item, dict):
                    yield item
                    seen += 1
                    if limit is not None and seen >= limit:
                        return

            if len(items) < page_size:
                return
            if total is not None and seen >= total:
                return

            page += 1
            offset += page_size
            if rate_limit:
                time.sleep(rate_limit)

    def iter_conclusions(
        self, *, since: str | None = None, limit: int | None = None
    ) -> Iterator[Conclusion]:
        template = self.config.record_url_template
        for item in self.iter_raw_items(since=since, limit=limit):
            mapped = apply_field_map(item, self.config.field_map)
            if template and mapped.get("id"):
                mapped.setdefault("source_url", template.format(id=mapped["id"]))
            record = build_conclusion(mapped, raw=item)
            # Если API не умеет фильтровать по дате, отсекаем на клиенте:
            # выгрузка всё равно должна оставаться инкрементальной.
            if since and record.date_registered and record.date_registered < since:
                continue
            yield record


# --------------------------------------------------------------------------
# Офлайн-источник
# --------------------------------------------------------------------------

class DemoSource:
    """Синтетические, но правдоподобные записи.

    Нужен, чтобы весь конвейер — нормализация, витрина, фильтры, инфографика —
    работал и проверялся там, где до egrz.ru нет доступа (CI, закрытый контур).
    Формой и распределениями данные повторяют реестр, но это НЕ реальные данные.
    """

    ORGS = [
        'ФАУ "Главгосэкспертиза России"',
        'ГАУ "Мосгосэкспертиза"',
        'ГАУ "Леноблгосэкспертиза"',
        'ООО "СтройЭкспертиза"',
        'ООО "Проектный Аудит"',
        'ГБУ "Центр государственной экспертизы"',
        'ООО "РегионЭксперт"',
        'АО "Институт Строительной Экспертизы"',
    ]
    DEVELOPERS = [
        'ООО "Специализированный застройщик Восток"',
        'АО "Домостроительный комбинат"',
        'ГКУ "Управление капитального строительства"',
        'ООО "ИнфраСтрой"',
        'МКУ "Служба заказчика"',
        'ПАО "Энергосеть"',
    ]
    OBJECTS = [
        ("Многоквартирный жилой дом со встроенными помещениями", "Жилое"),
        ("Жилой комплекс, корпус 3", "Жилое"),
        ("Общеобразовательная школа на 1100 мест", "Нежилое"),
        ("Детский сад на 240 мест", "Нежилое"),
        ("Поликлиника на 350 посещений в смену", "Нежилое"),
        ("Реконструкция автомобильной дороги регионального значения", "Линейный объект"),
        ("Строительство сетей водоснабжения и водоотведения", "Линейный объект"),
        ("Газопровод межпоселковый", "Линейный объект"),
        ("Производственный корпус завода металлоконструкций", "Нежилое"),
        ("Складской комплекс класса А", "Нежилое"),
        ("Физкультурно-оздоровительный комплекс с бассейном", "Нежилое"),
        ("Благоустройство набережной", "Нежилое"),
        ("Торгово-развлекательный центр", "Нежилое"),
        ("Котельная блочно-модульная", "Линейный объект"),
        ("Реконструкция здания администрации", "Нежилое"),
    ]
    REGIONS = [
        ("Москва", "77"), ("Московская область", "50"), ("Санкт-Петербург", "78"),
        ("Краснодарский край", "23"), ("Свердловская область", "66"),
        ("Республика Татарстан", "16"), ("Новосибирская область", "54"),
        ("Ростовская область", "61"), ("Тюменская область", "72"),
        ("Красноярский край", "24"), ("Республика Башкортостан", "02"),
        ("Самарская область", "63"), ("Челябинская область", "74"),
        ("Нижегородская область", "52"), ("Приморский край", "25"),
        ("Республика Саха (Якутия)", "14"), ("Воронежская область", "36"),
        ("Ханты-Мансийский автономный округ — Югра", "86"),
    ]
    # Веса регионов: реестр сильно смещён в сторону крупных агломераций.
    REGION_WEIGHTS = [18, 12, 10, 8, 6, 6, 5, 5, 4, 4, 4, 4, 3, 3, 3, 2, 2, 2]

    def __init__(self, *, count: int = 4000, seed: int = 20260816, days: int = 900) -> None:
        self.count = count
        self.seed = seed
        self.days = days

    def iter_conclusions(
        self, *, since: str | None = None, limit: int | None = None
    ) -> Iterator[Conclusion]:
        import datetime as dt

        rng = random.Random(self.seed)
        today = dt.date.today()
        produced = 0

        for index in range(self.count):
            registered = today - dt.timedelta(days=rng.randint(0, self.days))
            issued = registered - dt.timedelta(days=rng.randint(0, 21))
            region, code = rng.choices(self.REGIONS, weights=self.REGION_WEIGHTS, k=1)[0]
            name, purpose = rng.choice(self.OBJECTS)

            # Отрицательных заключений в реестре меньшинство.
            result = "Отрицательное заключение" if rng.random() < 0.12 else "Положительное заключение"
            expertise = "Государственная" if rng.random() < 0.62 else "Негосударственная"
            subject = rng.choices(
                [
                    "Проектная документация и результаты инженерных изысканий",
                    "Проектная документация",
                    "Результаты инженерных изысканий",
                    "Проверка достоверности определения сметной стоимости",
                ],
                weights=[55, 22, 13, 10],
                k=1,
            )[0]

            # Логнормальная стоимость: медиана ~120 млн, длинный правый хвост.
            cost = round(rng.lognormvariate(18.6, 1.5), 2)

            mapped = {
                "id": f"demo-{index:06d}",
                "registry_number": f"{code}-1-1-3-{rng.randint(100000, 999999)}-{registered.year}",
                "conclusion_number": f"{rng.randint(1, 9999):04d}-{registered.year}",
                "date_registered": registered.isoformat(),
                "date_issued": issued.isoformat(),
                "expertise_type": expertise,
                "result": result,
                "subject_matter": subject,
                "is_repeat": rng.random() < 0.18,
                "object_name": name,
                "address": f"{region}, {rng.choice(['г. ', 'пос. ', 'с. '])}"
                f"{rng.choice(['Северный', 'Заречный', 'Новый', 'Центральный'])}, "
                f"ул. {rng.choice(['Ленина', 'Мира', 'Строителей', 'Садовая'])}, "
                f"д. {rng.randint(1, 120)}",
                "region": region,
                "region_code": code,
                "purpose": purpose,
                "organization": rng.choice(self.ORGS),
                "organization_inn": str(rng.randint(1000000000, 9999999999)),
                "developer": rng.choice(self.DEVELOPERS),
                "developer_inn": str(rng.randint(1000000000, 9999999999)),
                "cost": cost,
                "source_url": f"https://egrz.ru/organisation/reestr/detail/demo-{index:06d}",
            }
            record = build_conclusion(mapped, raw={})
            if since and record.date_registered and record.date_registered < since:
                continue
            yield record
            produced += 1
            if limit is not None and produced >= limit:
                return


def get_source(kind: str, *, config_path: str | Path | None = None, **kwargs: Any) -> Source:
    """Фабрика источников: ``api`` — живой ЕГРЗ, ``demo`` — офлайн-данные."""
    if kind == "demo":
        return DemoSource(**kwargs)
    if kind == "api":
        return EgrzApiSource(SourceConfig.load(config_path))
    raise ValueError(f"Неизвестный источник: {kind!r} (доступны: api, demo)")


def load_jsonl(path: str | Path) -> Iterable[Conclusion]:
    """Читает ранее сохранённые сырые записи (для повторной нормализации)."""
    config = SourceConfig.load()
    with Path(path).open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            yield build_conclusion(apply_field_map(item, config.field_map), raw=item)
