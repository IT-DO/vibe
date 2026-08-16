"""Тесты нормализации значений."""

import pytest

from egrz.normalize import (
    build_conclusion,
    canonical_org,
    detect_repeat,
    normalize_expertise_type,
    normalize_result,
    normalize_subject_matter,
    parse_bool,
    parse_cost,
    parse_date,
    parse_inn,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("2026-01-15", "2026-01-15"),
        ("2026-01-15T00:00:00", "2026-01-15"),
        ("2026-01-15T00:00:00+03:00", "2026-01-15"),
        ("2026-01-15T00:00:00Z", "2026-01-15"),
        ("15.01.2026", "2026-01-15"),
        ("15/01/2026", "2026-01-15"),
        ("2026/01/15", "2026-01-15"),
        ("", None),
        (None, None),
        ("не дата", None),
    ],
)
def test_parse_date(raw, expected):
    assert parse_date(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("1 234 567,89", 1234567.89),
        ("1234567.89", 1234567.89),
        ("1.234.567,00", 1234567.0),
        ("12 345 678 руб.", 12345678.0),
        ("45 000 000,00 ₽", 45000000.0),
        ("1.234", 1234.0),          # точка как разделитель разрядов
        (45_000_000, 45000000.0),
        ("0", None),
        (-5, None),
        ("", None),
        (None, None),
        ("абв", None),
    ],
)
def test_parse_cost(raw, expected):
    assert parse_cost(raw) == expected


def test_parse_cost_handles_nbsp():
    """Источник разделяет разряды неразрывным и узким пробелом."""
    assert parse_cost("1 234 567,89") == 1234567.89


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Государственная экспертиза", "Государственная"),
        ("негосударственная экспертиза", "Негосударственная"),
        ("", "Не указано"),
    ],
)
def test_normalize_expertise_type(raw, expected):
    assert normalize_expertise_type(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Положительное заключение", "Положительное"),
        ("ОТРИЦАТЕЛЬНОЕ", "Отрицательное"),
        ("что-то ещё", "Не указано"),
    ],
)
def test_normalize_result(raw, expected):
    assert normalize_result(raw) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Проектная документация и результаты инженерных изысканий",
         "ПД и результаты инженерных изысканий"),
        ("Проектная документация", "Проектная документация"),
        ("Результаты инженерных изысканий", "Результаты инженерных изысканий"),
        ("Проверка достоверности определения сметной стоимости",
         "Достоверность сметной стоимости"),
        ("", "Не указано"),
    ],
)
def test_normalize_subject_matter(raw, expected):
    assert normalize_subject_matter(raw) == expected


def test_canonical_org_collapses_variants():
    """Один и тот же эксперт не должен разъезжаться на несколько строк рейтинга."""
    variants = [
        'Общество с ограниченной ответственностью "ЭКСПЕРТ"',
        "ООО «Эксперт»",
        'ООО "ЭКСПЕРТ"',
        'ооо "эксперт"',
        'ООО  "Эксперт" ',
    ]
    assert len({canonical_org(v) for v in variants}) == 1


def test_canonical_org_keeps_mixed_case_names():
    assert canonical_org('ФАУ "Главгосэкспертиза России"') == 'ФАУ "Главгосэкспертиза России"'


def test_canonical_org_shortens_legal_form():
    assert canonical_org("Акционерное общество «Институт»") == 'АО "Институт"'


def test_canonical_org_strips_registry_metadata_tail():
    """Excel-выгрузка ЕГРЗ склеивает имя организации с её реквизитами в одну
    ячейку — ОГРН/ИНН/КПП/адрес не нужны в имени: ИНН и так приходит отдельной
    колонкой, а хвост только раздувает и захламляет рейтинг организаций."""
    raw = (
        'КРАЕВОЕ АВТОНОМНОЕ УЧРЕЖДЕНИЕ "Государственная Экспертиза Алтайского Края" '
        "(ОГРН: 1072221001709, ИНН: 2221123815, КПП: 222101001, "
        "МЕСТО НАХОЖДЕНИЯ и АДРЕС: 656015, край Алтайский, г. Барнаул, ул. Деповская, д. 7)"
    )
    assert canonical_org(raw) == 'КРАЕВОЕ АВТОНОМНОЕ УЧРЕЖДЕНИЕ "Государственная Экспертиза Алтайского Края"'


def test_canonical_org_tail_stripping_is_order_independent():
    """Хвост встречается и у organization, и у developer — с разными реквизитами."""
    raw = 'ООО "Ромашка" (ИНН: 7707083893, ОГРН: 1027700132195)'
    assert canonical_org(raw) == 'ООО "Ромашка"'


def test_canonical_org_without_tail_is_untouched():
    """Без хвоста поведение не должно измениться — не обрезаем лишнего."""
    assert canonical_org('ООО "Ромашка"') == 'ООО "Ромашка"'


def test_canonical_org_empty():
    assert canonical_org(None) == ""
    assert canonical_org("") == ""


@pytest.mark.parametrize("raw, expected", [("7707083893", "7707083893"), ("770708389312", "770708389312"),
                                           ("77070838", None), ("", None), (None, None)])
def test_parse_inn(raw, expected):
    assert parse_inn(raw) == expected


def test_parse_bool():
    assert parse_bool("да") is True
    assert parse_bool("нет") is False
    assert parse_bool(True) is True
    assert parse_bool(None) is False


def test_detect_repeat():
    assert detect_repeat("Повторная государственная экспертиза") is True
    assert detect_repeat("Первичная экспертиза", None) is False


def test_build_conclusion_full():
    record = build_conclusion(
        {
            "id": "abc-1",
            "conclusion_number": "0123-2026",
            "date_registered": "15.03.2026",
            "date_issued": "2026-03-01",
            "expertise_type": "Государственная экспертиза",
            "result": "Положительное заключение",
            "subject_matter": "Проектная документация и результаты инженерных изысканий",
            "object_name": "Детский сад на 240 мест",
            "address": "Свердловская область, г. Екатеринбург, ул. Ленина, 5",
            "organization": 'ООО "ЭКСПЕРТ"',
            "cost": "123 456 789,00",
        }
    )

    assert record.id == "abc-1"
    assert record.date_registered == "2026-03-15"
    assert record.expertise_type == "Государственная"
    assert record.result == "Положительное"
    assert record.object_category == "Образование"
    assert record.purpose == "Нежилое"
    assert record.region == "Свердловская область"
    assert record.federal_district == "Уральский"
    assert record.organization == 'ООО "Эксперт"'
    assert record.cost == 123456789.0
    assert record.cost_bucket == "100–500 млн ₽"
    assert (record.year, record.quarter, record.month) == (2026, "2026-Q1", "2026-03")


def test_build_conclusion_generates_stable_id():
    """Без идентификатора от источника ключ должен быть воспроизводимым."""
    payload = {
        "registry_number": "66-1-1-3-000123-2026",
        "date_registered": "2026-03-15",
        "object_name": "Школа",
    }
    assert build_conclusion(dict(payload)).id == build_conclusion(dict(payload)).id
    assert build_conclusion(dict(payload)).id != build_conclusion(
        {**payload, "object_name": "Другая школа"}
    ).id


def test_fingerprint_reacts_to_content_only():
    base = {"id": "x", "object_name": "Школа", "date_registered": "2026-01-01"}
    same = build_conclusion(dict(base), raw={"любое": "значение"})
    other = build_conclusion(dict(base), raw={"другое": "значение"})
    assert same.fingerprint() == other.fingerprint()

    changed = build_conclusion({**base, "result": "Отрицательное заключение"})
    assert changed.fingerprint() != same.fingerprint()


def test_explicit_purpose_wins_over_heuristic():
    record = build_conclusion({"object_name": "Школа", "purpose": "Особое назначение"})
    assert record.object_category == "Образование"
    assert record.purpose == "Особое назначение"
