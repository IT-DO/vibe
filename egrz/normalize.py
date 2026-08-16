"""Нормализация: сырой ответ источника -> :class:`~egrz.models.Conclusion`.

Источник отдаёт данные неровно: даты в трёх форматах, стоимость строкой с
неразрывными пробелами, названия организаций в разных кавычках. Здесь всё это
приводится к одному виду, чтобы фильтры и агрегаты не разъезжались.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

from .models import Conclusion, stable_id
from .reference import classify_object, cost_bucket, resolve_region

# --------------------------------------------------------------------------
# Скаляры
# --------------------------------------------------------------------------

_DATE_PATTERNS = (
    "%Y-%m-%d",
    "%d.%m.%Y",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%d-%m-%Y",
)

#: Пробелы, которые источник вставляет как разделители разрядов.
_SPACES = "     "


def parse_date(value: Any) -> str | None:
    """Любой разумный формат даты -> ``YYYY-MM-DD``. Иначе ``None``."""
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()

    text = str(value).strip()
    if not text:
        return None

    # ISO с временем/зоной: 2026-01-15T00:00:00+03:00
    iso_head = text.replace("Z", "+00:00")
    try:
        return dt.datetime.fromisoformat(iso_head).date().isoformat()
    except ValueError:
        pass

    head = re.split(r"[T ]", text, maxsplit=1)[0]
    for pattern in _DATE_PATTERNS:
        try:
            return dt.datetime.strptime(head, pattern).date().isoformat()
        except ValueError:
            continue
    return None


def parse_cost(value: Any) -> float | None:
    """Стоимость в рублях. Понимает ``"1 234 567,89"`` и ``"1234567.89"``."""
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if value > 0 else None

    text = str(value)
    for space in _SPACES:
        text = text.replace(space, "")
    text = re.sub(r"[^\d,.\-]", "", text)
    if not text:
        return None

    # Разделитель дробной части: запятая, либо точка, если она последняя
    # и за ней не больше двух цифр. Иначе точки — разряды.
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    elif text.count(".") > 1:
        text = text.replace(".", "")
    elif "." in text:
        integer, _, fraction = text.partition(".")
        if len(fraction) == 3:  # 1.234 — это разряды, а не 1 руб. 234 коп.
            text = integer + fraction

    try:
        number = float(text)
    except ValueError:
        return None
    return number if number > 0 else None


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "да", "yes", "y", "истина"}


def parse_inn(value: Any) -> str | None:
    """ИНН — 10 (юрлицо) или 12 (ИП) цифр."""
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    return digits if len(digits) in (10, 12) else None


_QUOTES = {"«": '"', "»": '"', "“": '"', "”": '"', "„": '"', "‟": '"', "`": "'"}

_LEGAL_FORMS = (
    (r"\bобщество с ограниченной ответственностью\b", "ООО"),
    (r"\bакционерное общество\b", "АО"),
    (r"\bпубличное акционерное общество\b", "ПАО"),
    (r"\bзакрытое акционерное общество\b", "ЗАО"),
    (r"\bоткрытое акционерное общество\b", "ОАО"),
    (r"\bиндивидуальный предприниматель\b", "ИП"),
    (r"\bгосударственн\w+ автономн\w+ учреждени\w*\b", "ГАУ"),
    (r"\bгосударственн\w+ бюджетн\w+ учреждени\w*\b", "ГБУ"),
    (r"\bмуниципальн\w+ бюджетн\w+ учреждени\w*\b", "МБУ"),
    (r"\bфедеральн\w+ автономн\w+ учреждени\w*\b", "ФАУ"),
)


def _detitle(match: re.Match[str]) -> str:
    """Приводит «кричащее» имя в кавычках к обычному регистру.

    ``"ЭКСПЕРТ"`` и ``"Эксперт"`` — одна организация, но как строки они разные,
    и в рейтинге организаций разъезжаются на две строки. Регистр меняем только
    у имён, набранных целиком в одном регистре (ВЕРХНЕМ или нижнем); имя со
    смешанным регистром автор написал осознанно, и трогать его не нужно.
    """
    inner = match.group(1)
    letters = [ch for ch in inner if ch.isalpha()]
    if letters and (all(ch.isupper() for ch in letters) or all(ch.islower() for ch in letters)):
        inner = " ".join(word.capitalize() for word in inner.split(" "))
    return f'"{inner}"'


def canonical_org(value: Any) -> str:
    """Каноническое имя организации.

    Одна и та же экспертная организация приходит как «ООО "Эксперт"»,
    «ООО «Эксперт»» и «Общество с ограниченной ответственностью "ЭКСПЕРТ"».
    Без сведения к одной форме топ организаций в инфографике рассыпается.
    """
    text = str(value or "").strip()
    if not text:
        return ""
    for src, dst in _QUOTES.items():
        text = text.replace(src, dst)
    text = re.sub(r"\s+", " ", text)

    # Развёрнутая организационно-правовая форма -> аббревиатура.
    for pattern, short in _LEGAL_FORMS:
        replaced, count = re.subn(pattern, short, text, count=1, flags=re.IGNORECASE)
        if count:
            text = replaced
            break

    # Аббревиатуру формы — всегда прописными (ооо -> ООО).
    text = re.sub(
        r"^(ооо|оао|зао|пао|ао|ип|гау|гбу|мбу|фау|гку|мку|фгбу)\b",
        lambda m: m.group(1).upper(),
        text.strip(),
        flags=re.IGNORECASE,
    )
    text = re.sub(r'"([^"]+)"', _detitle, text)
    return re.sub(r"\s+", " ", text).strip(" ,.;")


# --------------------------------------------------------------------------
# Категориальные поля
# --------------------------------------------------------------------------

def normalize_expertise_type(value: Any) -> str:
    text = str(value or "").lower()
    if "негосударствен" in text:
        return "Негосударственная"
    if "государствен" in text:
        return "Государственная"
    return "Не указано"


def normalize_result(value: Any) -> str:
    text = str(value or "").lower()
    if "отрицательн" in text:
        return "Отрицательное"
    if "положительн" in text:
        return "Положительное"
    return "Не указано"


def normalize_subject_matter(value: Any) -> str:
    text = str(value or "").lower()
    has_pd = "проектн" in text
    has_rii = "инженерн" in text and "изыскан" in text
    if "достоверност" in text and "сметн" in text:
        return "Достоверность сметной стоимости"
    if has_pd and has_rii:
        return "ПД и результаты инженерных изысканий"
    if has_rii:
        return "Результаты инженерных изысканий"
    if has_pd:
        return "Проектная документация"
    return "Не указано"


def detect_repeat(*values: Any) -> bool:
    return any("повторн" in str(v or "").lower() for v in values)


# --------------------------------------------------------------------------
# Сборка записи
# --------------------------------------------------------------------------

def _derive_period(date_iso: str | None) -> tuple[int | None, str | None, str | None]:
    if not date_iso:
        return None, None, None
    year = int(date_iso[:4])
    month_num = int(date_iso[5:7])
    return year, f"{year}-Q{(month_num - 1) // 3 + 1}", date_iso[:7]


def build_conclusion(mapped: dict[str, Any], *, raw: dict[str, Any] | None = None) -> Conclusion:
    """Собирает нормализованную запись из словаря сопоставленных полей.

    ``mapped`` — результат применения field-mapping источника (см.
    :mod:`egrz.source`): ключи уже наши, значения ещё сырые.
    """
    object_name = re.sub(r"\s+", " ", str(mapped.get("object_name") or "")).strip()
    address = re.sub(r"\s+", " ", str(mapped.get("address") or "")).strip()

    region, region_code, district = resolve_region(
        mapped.get("region") or address,
        code=mapped.get("region_code"),
    )

    category, purpose = classify_object(object_name, address)
    # Явное назначение из источника важнее эвристики по названию.
    explicit_purpose = str(mapped.get("purpose") or "").strip()
    if explicit_purpose:
        purpose = explicit_purpose

    date_registered = parse_date(mapped.get("date_registered"))
    date_issued = parse_date(mapped.get("date_issued"))
    # Периоды считаем по дате включения в реестр — это ось ежедневной выгрузки.
    year, quarter, month = _derive_period(date_registered or date_issued)

    cost = parse_cost(mapped.get("cost"))
    conclusion_number = str(mapped.get("conclusion_number") or "").strip()
    registry_number = str(mapped.get("registry_number") or "").strip()

    record = Conclusion(
        id=str(mapped.get("id") or "").strip()
        or stable_id(registry_number or conclusion_number, date_registered, object_name),
        registry_number=registry_number,
        conclusion_number=conclusion_number,
        date_registered=date_registered,
        date_issued=date_issued,
        expertise_type=normalize_expertise_type(mapped.get("expertise_type")),
        result=normalize_result(mapped.get("result")),
        subject_matter=normalize_subject_matter(mapped.get("subject_matter")),
        is_repeat=parse_bool(mapped.get("is_repeat"))
        or detect_repeat(mapped.get("subject_matter"), mapped.get("expertise_type")),
        object_name=object_name,
        object_category=category,
        purpose=purpose,
        address=address,
        region=region,
        region_code=region_code,
        federal_district=district,
        organization=canonical_org(mapped.get("organization")),
        organization_inn=parse_inn(mapped.get("organization_inn")),
        developer=canonical_org(mapped.get("developer")),
        developer_inn=parse_inn(mapped.get("developer_inn")),
        cost=cost,
        cost_bucket=cost_bucket(cost),
        year=year,
        quarter=quarter,
        month=month,
        source_url=str(mapped.get("source_url") or "").strip(),
        raw=raw or {},
    )
    return record
