"""Тесты справочников: регионы, классификатор объектов, стоимостные корзины."""

import pytest

from egrz.reference import (
    FEDERAL_DISTRICTS,
    REGIONS,
    classify_object,
    cost_bucket,
    resolve_region,
)


def test_region_table_is_complete():
    """89 субъектов, уникальные коды и названия."""
    assert len(REGIONS) == 89
    codes = [code for code, _, _, _ in REGIONS]
    names = [name for _, name, _, _ in REGIONS]
    assert len(set(codes)) == len(codes)
    assert len(set(names)) == len(names)
    assert {district for _, _, district, _ in REGIONS} == set(FEDERAL_DISTRICTS)


@pytest.mark.parametrize(
    "raw, name, district",
    [
        ("г. Москва", "Москва", "Центральный"),
        ("Москва", "Москва", "Центральный"),
        ("Московская обл.", "Московская область", "Центральный"),
        ("Респ. Татарстан", "Республика Татарстан", "Приволжский"),
        ("Республика Татарстан", "Республика Татарстан", "Приволжский"),
        ("ХМАО", "Ханты-Мансийский автономный округ — Югра", "Уральский"),
        ("Ханты-Мансийский автономный округ - Югра",
         "Ханты-Мансийский автономный округ — Югра", "Уральский"),
        ("Кемеровская область", "Кемеровская область — Кузбасс", "Сибирский"),
        ("г Санкт-Петербург", "Санкт-Петербург", "Северо-Западный"),
        ("Якутия", "Республика Саха (Якутия)", "Дальневосточный"),
        ("КРАСНОДАРСКИЙ КРАЙ", "Краснодарский край", "Южный"),
    ],
)
def test_resolve_region_by_name(raw, name, district):
    resolved_name, _, resolved_district = resolve_region(raw)
    assert (resolved_name, resolved_district) == (name, district)


def test_resolve_region_prefers_longest_match_in_address():
    """«Московская область» не должна проиграть подстроке «Москва»."""
    name, _, _ = resolve_region("Российская Федерация, Московская область, г. Химки, ул. Мира, 1")
    assert name == "Московская область"


def test_resolve_region_from_address():
    name, code, district = resolve_region(
        "Российская Федерация, Свердловская область, г. Екатеринбург, ул. Ленина, д. 5"
    )
    assert (name, code, district) == ("Свердловская область", "66", "Уральский")


def test_resolve_region_by_code_beats_garbage_text():
    assert resolve_region("мусор", code="66")[0] == "Свердловская область"


def test_resolve_region_code_alias():
    """Чечня приходит и как 20, и как 95."""
    assert resolve_region(None, code="95")[0] == "Чеченская Республика"
    assert resolve_region(None, code="20")[0] == "Чеченская Республика"


def test_resolve_region_unknown_is_preserved():
    """Нераспознанное значение не теряется — его видно в фильтре как есть."""
    name, code, district = resolve_region("Марсианская область")
    assert (name, code, district) == ("Марсианская область", None, "Не определён")


def test_resolve_region_empty():
    assert resolve_region("") == ("Не указан", None, "Не определён")
    assert resolve_region(None) == ("Не указан", None, "Не определён")


@pytest.mark.parametrize(
    "name, category, purpose",
    [
        ("Многоквартирный жилой дом со встроенными помещениями", "Жилые дома", "Жилое"),
        ("Детский сад на 240 мест", "Образование", "Нежилое"),
        ("Общеобразовательная школа на 1100 мест", "Образование", "Нежилое"),
        ("Поликлиника на 350 посещений", "Здравоохранение", "Нежилое"),
        ("Реконструкция автомобильной дороги", "Транспорт и дороги", "Линейный объект"),
        ("Строительство сетей водоснабжения", "Инженерные сети", "Линейный объект"),
        ("Газопровод межпоселковый", "Инженерные сети", "Линейный объект"),
        ("Производственный корпус завода", "Промышленность", "Нежилое"),
        ("Складской комплекс класса А", "Склады и логистика", "Нежилое"),
        ("Физкультурно-оздоровительный комплекс с бассейном", "Спорт и культура", "Нежилое"),
        ("Реконструкция здания администрации", "Административные здания", "Нежилое"),
        ("Благоустройство набережной", "Благоустройство", "Нежилое"),
        ("Нечто неведомое", "Прочее", "Не определено"),
        ("", "Прочее", "Не определено"),
    ],
)
def test_classify_object(name, category, purpose):
    assert classify_object(name) == (category, purpose)


def test_classify_prefers_name_over_address():
    """Улица Школьная не должна делать склад образовательным объектом."""
    category, _ = classify_object("Складской комплекс", "г. Пермь, ул. Школьная, д. 4")
    assert category == "Склады и логистика"


def test_classify_falls_back_to_address():
    category, _ = classify_object("Объект капитального строительства", "территория школы №5")
    assert category == "Образование"


@pytest.mark.parametrize(
    "value, bucket",
    [
        (5_000_000, "до 10 млн ₽"),
        (10_000_000, "10–50 млн ₽"),
        (99_000_000, "50–100 млн ₽"),
        (123_456_789, "100–500 млн ₽"),
        (750_000_000, "0,5–1 млрд ₽"),
        (2_000_000_000, "1–5 млрд ₽"),
        (9_000_000_000, "свыше 5 млрд ₽"),
        (None, "Не указана"),
        (0, "Не указана"),
    ],
)
def test_cost_bucket(value, bucket):
    assert cost_bucket(value) == bucket
