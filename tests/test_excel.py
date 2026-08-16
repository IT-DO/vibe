"""Тесты чтения Excel-выгрузки реестра."""

import datetime as dt

import pytest

from egrz.excel import ExcelSource, map_headers, read_rows

openpyxl = pytest.importorskip("openpyxl")


# Заголовки в том виде, в каком они встречаются в выгрузке реестра.
HEADERS = [
    "Номер заключения экспертизы",
    "Дата заключения экспертизы",
    "Дата включения в реестр",
    "Вид экспертизы",
    "Предмет экспертизы",
    "Результат экспертизы",
    "Наименование объекта капитального строительства",
    "Адрес объекта",
    "Субъект Российской Федерации",
    "Наименование экспертной организации",
    "ИНН экспертной организации",
    "Застройщик",
    "Сметная стоимость, руб.",
]

ROW = [
    "0123-2026",
    dt.datetime(2026, 3, 1),
    dt.datetime(2026, 3, 15),
    "Государственная экспертиза",
    "Проектная документация и результаты инженерных изысканий",
    "Положительное заключение",
    "Детский сад на 240 мест",
    "г. Екатеринбург, ул. Ленина, д. 5",
    "Свердловская область",
    'ООО "ЭКСПЕРТ"',
    "7707083893",
    'АО "Домостроительный комбинат"',
    "123 456 789,00",
]


def make_workbook(path, *, title_rows=0, rows=1, headers=None):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    for _ in range(title_rows):
        sheet.append(["Реестр заключений экспертизы", None, None])
    sheet.append(headers or HEADERS)
    for index in range(rows):
        row = list(ROW)
        row[0] = f"{index:04d}-2026"
        sheet.append(row)
    workbook.save(path)
    return path


# -------------------------------------------------------- сопоставление колонок

def test_map_headers_recognises_registry_export():
    mapping, unmapped = map_headers(HEADERS)
    assert unmapped == []
    by_field = {field: index for index, field in mapping.items()}

    assert by_field["conclusion_number"] == 0
    assert by_field["date_issued"] == 1
    assert by_field["date_registered"] == 2
    assert by_field["expertise_type"] == 3
    assert by_field["subject_matter"] == 4
    assert by_field["result"] == 5
    assert by_field["object_name"] == 6
    assert by_field["address"] == 7
    assert by_field["region"] == 8
    assert by_field["organization"] == 9
    assert by_field["organization_inn"] == 10
    assert by_field["developer"] == 11
    assert by_field["cost"] == 12


def test_inn_column_does_not_swallow_organization():
    """«ИНН экспертной организации» не должно занять поле самой организации."""
    mapping, _ = map_headers(["Наименование экспертной организации", "ИНН экспертной организации"])
    assert mapping == {0: "organization", 1: "organization_inn"}


def test_map_headers_accepts_wording_variants():
    mapping, _ = map_headers([
        "Организация, проводившая экспертизу",
        "Место расположения объекта",
        "Регион",
        "Стоимость",
    ])
    assert set(mapping.values()) == {"organization", "address", "region", "cost"}


def test_map_headers_reports_unknown_columns():
    _, unmapped = map_headers(["Наименование объекта", "Какая-то новая колонка"])
    assert unmapped == ["Какая-то новая колонка"]


def test_map_headers_ignores_empty_cells():
    mapping, unmapped = map_headers(["Наименование объекта", None, ""])
    assert mapping == {0: "object_name"}
    assert unmapped == []


# ---------------------------------------------------------------- чтение файла

def test_read_rows(tmp_path):
    path = make_workbook(tmp_path / "registry.xlsx", rows=3)
    records, unmapped = read_rows(path)

    assert len(records) == 3
    assert unmapped == []
    assert records[0]["object_name"] == "Детский сад на 240 мест"
    assert records[0]["region"] == "Свердловская область"


def test_read_rows_skips_title_rows(tmp_path):
    """Над таблицей в выгрузке бывает заголовок отчёта — он не должен ломать разбор."""
    path = make_workbook(tmp_path / "titled.xlsx", title_rows=3, rows=2)
    records, _ = read_rows(path)
    assert len(records) == 2
    assert records[0]["conclusion_number"] == "0000-2026"


def test_read_rows_rejects_foreign_file(tmp_path):
    path = tmp_path / "other.xlsx"
    workbook = openpyxl.Workbook()
    workbook.active.append(["Колонка А", "Колонка Б"])
    workbook.active.append([1, 2])
    workbook.save(path)

    with pytest.raises(RuntimeError, match="узнаваемой колонки"):
        read_rows(path)


def test_read_rows_on_empty_file(tmp_path):
    path = tmp_path / "empty.xlsx"
    openpyxl.Workbook().save(path)
    records, _ = read_rows(path)
    assert records == []


# --------------------------------------------------------------------- источник

def test_excel_source_normalizes(tmp_path):
    path = make_workbook(tmp_path / "registry.xlsx", rows=2)
    records = list(ExcelSource(source=str(path)).iter_conclusions())

    assert len(records) == 2
    record = records[0]
    assert record.date_issued == "2026-03-01"
    assert record.date_registered == "2026-03-15"
    assert record.expertise_type == "Государственная"
    assert record.result == "Положительное"
    assert record.subject_matter == "ПД и результаты инженерных изысканий"
    assert record.object_category == "Образование"
    assert record.region == "Свердловская область"
    assert record.federal_district == "Уральский"
    assert record.organization == 'ООО "Эксперт"'
    assert record.organization_inn == "7707083893"
    assert record.cost == 123456789.0
    assert record.cost_bucket == "100–500 млн ₽"


def test_excel_source_reports_unmapped(tmp_path):
    path = make_workbook(
        tmp_path / "extra.xlsx",
        headers=[*HEADERS, "Экзотическая колонка"],
    )
    source = ExcelSource(source=str(path))
    list(source.iter_conclusions())
    assert source.report["unmapped_columns"] == ["Экзотическая колонка"]
    assert source.report["rows"] == 1


def test_excel_source_respects_limit_and_since(tmp_path):
    path = make_workbook(tmp_path / "registry.xlsx", rows=5)
    source = ExcelSource(source=str(path))
    assert len(list(source.iter_conclusions(limit=2))) == 2
    assert list(source.iter_conclusions(since="2030-01-01")) == []
    assert len(list(source.iter_conclusions(since="2026-01-01"))) == 5


def test_excel_source_missing_file():
    with pytest.raises(RuntimeError, match="не найден"):
        list(ExcelSource(source="/nope/absent.xlsx").iter_conclusions())


def test_excel_records_are_stable_across_runs(tmp_path):
    """Идентификаторы не должны «поехать» между ежедневными запусками."""
    path = make_workbook(tmp_path / "registry.xlsx", rows=4)
    first = [r.id for r in ExcelSource(source=str(path)).iter_conclusions()]
    second = [r.id for r in ExcelSource(source=str(path)).iter_conclusions()]
    assert first == second
    assert len(set(first)) == 4
