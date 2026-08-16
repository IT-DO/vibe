"""Тесты чтения Excel-выгрузки реестра."""

import datetime as dt
import re
import zipfile

import pytest

from egrz.excel import ExcelSource, map_headers, read_rows

openpyxl = pytest.importorskip("openpyxl")


# Заголовки, буква в букву как в реальной выгрузке open-api.egrz.ru
# (PublicRegistrationBook/excelDataFile) — сняты с настоящего файла.
REAL_HEADERS = [
    "Идентификатор",
    "Номер заключения экспертизы",
    "Дата заключения экспертизы",
    "Результат проведенной экспертизы (положительное или отрицательное заключение экспертизы)",
    "Форма экспертизы (государственная, негосударственная)",
    "Сведения об объекте экспертиз (проектная документация и(или) результаты инженерных изысканий)",
    "Субъект РФ",
    "Код субъекта РФ",
    "Наименование и адрес (местоположение) объекта капитального строительства, "
    "применительно к которому подготовлена проектная документация",
    "Сведения об экспертной организации",
    "ИНН экспертной организации",
    "КПП экспертной организации",
    "ОГРН экспертной организации",
    "Место нахождения и адрес экспертной организации",
    "Сведения о застройщике, обеспечившем подготовку проектной документации",
    "Дата включения сведений в реестр",
    "Вид работ",
]

REAL_ROW = [
    "a55059a5-ab9f-4881-892f-7c90f4ba47bc",
    "22-1-1-2-039945-2026",
    dt.datetime(2026, 8, 15),
    "Положительное заключение",
    "Государственная",
    "Проектная документация",
    "Алтайский край - 22",
    22,
    '"Капитальный ремонт частного домовладения", Почтовый адрес: '
    "'Российская Федерация, Алтайский край, г.Барнаул, ул.Озерная, 14'",
    'КРАЕВОЕ АВТОНОМНОЕ УЧРЕЖДЕНИЕ "Государственная Экспертиза Алтайского Края" '
    "(ОГРН: 1072221001709, ИНН: 2221123815, КПП: 222101001, "
    "МЕСТО НАХОЖДЕНИЯ и АДРЕС: 656015, край Алтайский, г. Барнаул, ул. Деповская, д. 7)",
    "2221123815",
    "222101001",
    "1072221001709",
    "656015, край Алтайский, г. Барнаул, ул. Деповская, д. 7",
    "КОМИТЕТ ПО ЭНЕРГОРЕСУРСАМ (ОГРН: 1152225017340, ИНН: 2225163199, КПП: 222501001, "
    "МЕСТО НАХОЖДЕНИЯ и АДРЕС: Алтайский край, г. Барнаул, ул. Гоголя, д. 48)",
    dt.datetime(2026, 8, 15),
    "Капитальный ремонт",
]


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


def make_real_shaped_workbook(path, *, rows=3):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(REAL_HEADERS)
    for index in range(rows):
        row = list(REAL_ROW)
        row[0] = f"guid-{index:04d}"
        row[1] = f"22-1-1-2-{index:06d}-2026"
        sheet.append(row)
    workbook.save(path)
    return path


def break_dimension_tag(path):
    """Портит тег ``<dimension>`` так же, как это делает генератор ЕГРЗ.

    Реальная выгрузка объявляет диапазон в одну колонку (``A1:A6249``), хотя
    физически строки содержат 25 ячеек. openpyxl в потоковом ``read_only``
    режиме доверяет этому тегу и без явного ``max_col`` обрезает каждую
    строку до первой ячейки — этот хелпер воспроизводит баг для теста.
    """
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        sheet_name = next(n for n in names if re.match(r"xl/worksheets/sheet\d+\.xml", n))
        contents = {name: archive.read(name) for name in names}

    xml = contents[sheet_name].decode("utf-8")
    max_row = max(int(m) for m in re.findall(r'<row r="(\d+)"', xml))
    broken = re.sub(r'<dimension ref="[^"]*"\s*/>', f'<dimension ref="A1:A{max_row}" />', xml)
    assert broken != xml, "тег <dimension> не найден — тест не воспроизводит баг"
    contents[sheet_name] = broken.encode("utf-8")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in contents.items():
            archive.writestr(name, data)


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


# ---------------------------------------------- реальная структура выгрузки ЕГРЗ

def test_map_headers_matches_real_egrz_export():
    """Заголовки один в один как в настоящей выгрузке open-api.egrz.ru."""
    mapping, unmapped = map_headers(REAL_HEADERS)
    by_field = {field: index for index, field in mapping.items()}

    assert by_field["id"] == 0
    assert by_field["conclusion_number"] == 1
    assert by_field["date_issued"] == 2
    assert by_field["result"] == 3
    assert by_field["expertise_type"] == 4          # «Форма экспертизы», не «вид»/«тип»
    assert by_field["subject_matter"] == 5
    assert by_field["region"] == 6
    assert by_field["region_code"] == 7
    assert by_field["object_name"] == 8
    assert by_field["organization"] == 9
    assert by_field["organization_inn"] == 10
    assert by_field["developer"] == 14
    assert by_field["date_registered"] == 15

    # КПП/ОГРН/адрес организации/«Вид работ» — не путаются с адресом объекта
    # и не попадают на чужие поля молча.
    assert "address" not in by_field
    assert "КПП экспертной организации" in unmapped
    assert "ОГРН экспертной организации" in unmapped
    assert "Место нахождения и адрес экспертной организации" in unmapped


def test_excel_source_reads_real_shaped_data(tmp_path):
    path = make_real_shaped_workbook(tmp_path / "real.xlsx", rows=3)
    records = list(ExcelSource(source=str(path)).iter_conclusions())

    assert len(records) == 3
    record = records[0]
    assert record.id == "guid-0000"                  # реальный id, а не сгенерированный
    assert record.conclusion_number == "22-1-1-2-000000-2026"
    assert record.expertise_type == "Государственная"
    assert record.result == "Положительное"
    assert record.region == "Алтайский край"
    assert record.region_code == "22"
    assert record.federal_district == "Сибирский"
    # Регистрационный хвост (ОГРН/ИНН/КПП/адрес) отрезан от имени организации.
    assert record.organization == 'КРАЕВОЕ АВТОНОМНОЕ УЧРЕЖДЕНИЕ "Государственная Экспертиза Алтайского Края"'
    assert "ОГРН" not in record.organization
    assert record.organization_inn == "2221123815"
    assert "ОГРН" not in record.developer


def test_read_rows_survives_broken_dimension_tag(tmp_path):
    """Регресс-тест на главный найденный баг.

    Выгрузка ЕГРЗ пишет в лист тег ``<dimension ref="A1:A6249"/>`` (только
    первая колонка), хотя реальных колонок 25 — генератор файла на сервере
    считает диапазон неверно. Без явного ``max_col`` при потоковом чтении
    openpyxl доверяет этому тегу и обрезает КАЖДУЮ строку до одной ячейки —
    результат выглядит как «в реестре только идентификаторы», хотя данные
    физически присутствуют в файле. Ушло много времени, чтобы это поймать;
    этот тест не даёт регрессии повториться незамеченной.
    """
    path = make_real_shaped_workbook(tmp_path / "broken.xlsx", rows=5)
    break_dimension_tag(path)

    # Без защиты (max_col) от бага: ровно то, что мы видели на реальном сервере.
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    worksheet = workbook.worksheets[0]
    naive_rows = list(worksheet.iter_rows(values_only=True))
    workbook.close()
    assert len(naive_rows[0]) == 1, "тест не воспроизвёл баг — проверьте break_dimension_tag"

    # С защитой (текущий read_rows) — все 17 колонок на месте.
    records, unmapped = read_rows(path)
    assert len(records) == 5
    assert records[0]["organization"].startswith('КРАЕВОЕ АВТОНОМНОЕ')
    assert records[0]["region"] == "Алтайский край - 22"
    assert records[0]["region_code"] == 22
    assert "КПП экспертной организации" in unmapped


def test_excel_source_survives_broken_dimension_tag(tmp_path):
    """То же самое, но через весь путь ExcelSource -> Conclusion."""
    path = make_real_shaped_workbook(tmp_path / "broken.xlsx", rows=3)
    break_dimension_tag(path)

    records = list(ExcelSource(source=str(path)).iter_conclusions())
    assert len(records) == 3
    assert records[0].region == "Алтайский край"
    assert records[0].organization_inn == "2221123815"
    assert records[0].expertise_type == "Государственная"
