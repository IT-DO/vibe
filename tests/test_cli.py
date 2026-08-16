"""Сквозные тесты командной строки."""

import json
import re
from pathlib import Path

import pytest

import egrz.excel as excel_module
from egrz.cli import main

openpyxl = pytest.importorskip("openpyxl")

BACKFILL_HEADERS = ["Идентификатор", "Номер заключения экспертизы", "Дата заключения экспертизы"]


def _write_backfill_page(target, *, rows, skip_offset=0):
    """Мини-выгрузка для тестов egrz backfill — только то, что нужно
    build_conclusion, чтобы не тянуть в тесты CLI полную структуру ЕГРЗ."""
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(BACKFILL_HEADERS)
    for i in range(rows):
        sheet.append([f"guid-{skip_offset + i}", f"№{skip_offset + i}", None])
    workbook.save(target)


def patch_paged_backfill(monkeypatch, tmp_path, pages: list[int], *, page_size: int):
    """Подменяет download_with_retries на серию локальных страниц заданного
    размера — без реальной сети, как и в tests/test_excel.py."""
    served: dict[int, int] = {}
    skip = 0
    for count in pages:
        served[skip] = count
        skip += page_size

    def fake_download(url, target, **kwargs):
        skip_value = int(re.search(r"\$skip=(\d+)", url).group(1))
        _write_backfill_page(target, rows=served.get(skip_value, 0), skip_offset=skip_value)
        return Path(target)

    monkeypatch.setattr(excel_module, "download_with_retries", fake_download)


def test_daily_builds_store_and_export(tmp_path, capsys):
    db = tmp_path / "egrz.sqlite3"
    out = tmp_path / "export"

    code = main([
        "--db", str(db), "daily",
        "--source", "demo", "--demo-count", "120", "--full",
        "--out", str(out),
    ])

    assert code == 0
    assert db.exists()
    dataset = json.loads((out / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["row_count"] == 120
    assert "Витрина собрана" in capsys.readouterr().out


def test_second_daily_run_is_incremental(tmp_path):
    db = tmp_path / "egrz.sqlite3"
    out = tmp_path / "export"
    args = ["--db", str(db), "daily", "--source", "demo", "--demo-count", "120",
            "--out", str(out)]

    assert main([*args, "--full"]) == 0
    assert main(args) == 0  # без --full: продолжает с последней даты

    dataset = json.loads((out / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["row_count"] == 120  # дубликатов не появилось


def test_export_without_sync_reports_empty_store(tmp_path, capsys):
    code = main(["--db", str(tmp_path / "empty.sqlite3"), "export", "--out", str(tmp_path / "x")])
    assert code == 1
    assert "сначала выполните" in capsys.readouterr().out.lower()


def test_stats_outputs_json(tmp_path, capsys):
    db = tmp_path / "egrz.sqlite3"
    main(["--db", str(db), "sync", "--source", "demo", "--demo-count", "30", "--full"])
    capsys.readouterr()

    assert main(["--db", str(db), "stats"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["records"] == 30
    assert payload["last_source_kind"] == "demo"


def test_max_rows_zero_means_all(tmp_path):
    db = tmp_path / "egrz.sqlite3"
    out = tmp_path / "export"
    main(["--db", str(db), "sync", "--source", "demo", "--demo-count", "80", "--full"])
    assert main(["--db", str(db), "export", "--out", str(out), "--max-rows", "0"]) == 0

    dataset = json.loads((out / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["row_count"] == 80
    assert dataset["truncated"] is False


# ------------------------------------------------------------------- backfill

def test_backfill_completes_and_marks_done(tmp_path, monkeypatch, capsys):
    patch_paged_backfill(monkeypatch, tmp_path, [5, 5, 2], page_size=5)
    db = tmp_path / "egrz.sqlite3"
    out_dir = tmp_path / "export"

    code = main(["--db", str(db), "backfill", "--page-size", "5", "--rate-limit", "0", "--out", str(out_dir)])
    output = capsys.readouterr().out

    assert code == 0
    assert "Готово: вся история загружена" in output
    # backfill заполняет базу, но дашборд читает только витрину — без
    # автоматического export пользователь увидел бы пустой дашборд, хотя
    # данные уже есть.
    assert "Витрина собрана" in output
    dataset = json.loads((out_dir / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["row_count"] == 12  # 5 + 5 + 2

    stats_code = main(["--db", str(db), "stats"])
    payload = json.loads(capsys.readouterr().out)
    assert stats_code == 0
    assert payload["records"] == 12
    assert payload["backfill_done"] is True


def test_backfill_rerun_without_restart_is_a_noop(tmp_path, monkeypatch, capsys):
    patch_paged_backfill(monkeypatch, tmp_path, [5, 2], page_size=5)
    db = tmp_path / "egrz.sqlite3"
    out_dir = tmp_path / "export"
    main(["--db", str(db), "backfill", "--page-size", "5", "--rate-limit", "0", "--out", str(out_dir)])
    capsys.readouterr()

    # Вторая попытка не должна дёргать сеть вовсе — если бы дёрнула, тест
    # упал бы здесь же (данных для новых $skip в fake_download нет).
    def fail_if_called(*args, **kwargs):
        raise AssertionError("повторный backfill без --restart не должен качать заново")

    monkeypatch.setattr(excel_module, "download_with_retries", fail_if_called)

    code = main(["--db", str(db), "backfill", "--page-size", "5", "--rate-limit", "0", "--out", str(out_dir)])
    out = capsys.readouterr().out

    assert code == 0
    assert "уже была загружена" in out.lower()


def test_backfill_resumes_after_max_pages_limit(tmp_path, monkeypatch, capsys):
    patch_paged_backfill(monkeypatch, tmp_path, [5, 5, 5, 2], page_size=5)
    db = tmp_path / "egrz.sqlite3"
    out_dir = tmp_path / "export"

    # Первый запуск: успевает пройти только 2 страницы из 4.
    code1 = main(["--db", str(db), "backfill", "--page-size", "5", "--rate-limit", "0",
                  "--max-pages", "2", "--out", str(out_dir)])
    out1 = capsys.readouterr().out
    assert code1 == 0
    assert "Остановлено" in out1
    assert "$skip=5" in out1  # последняя ОБРАБОТАННАЯ страница

    stats1 = main(["--db", str(db), "stats"])
    payload1 = json.loads(capsys.readouterr().out)
    assert payload1["records"] == 10  # 5 + 5, третья и четвёртая страницы ещё не тронуты
    assert payload1["backfill_done"] is False
    assert payload1["backfill_next_skip"] == "10"

    # Второй запуск без --max-pages: продолжает с сохранённой позиции и добирает остаток.
    code2 = main(["--db", str(db), "backfill", "--page-size", "5", "--rate-limit", "0", "--out", str(out_dir)])
    out2 = capsys.readouterr().out
    assert code2 == 0
    assert "Продолжаем обход с $skip=10" in out2
    assert "Готово: вся история загружена" in out2

    stats2 = main(["--db", str(db), "stats"])
    payload2 = json.loads(capsys.readouterr().out)
    assert payload2["records"] == 17  # 5 + 5 + 5 + 2
    assert payload2["backfill_done"] is True


def test_backfill_restart_starts_over(tmp_path, monkeypatch, capsys):
    patch_paged_backfill(monkeypatch, tmp_path, [5, 2], page_size=5)
    db = tmp_path / "egrz.sqlite3"
    out_dir = tmp_path / "export"
    main(["--db", str(db), "backfill", "--page-size", "5", "--rate-limit", "0", "--out", str(out_dir)])
    capsys.readouterr()

    code = main(["--db", str(db), "backfill", "--page-size", "5", "--rate-limit", "0",
                 "--restart", "--out", str(out_dir)])
    out = capsys.readouterr().out

    assert code == 0
    assert "Полный перезапуск" in out
    # Те же 7 записей (id детерминированы), а не 14 — upsert, а не дублирование.
    stats_code = main(["--db", str(db), "stats"])
    payload = json.loads(capsys.readouterr().out)
    assert stats_code == 0
    assert payload["records"] == 7
