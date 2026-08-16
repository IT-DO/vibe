"""Сквозные тесты командной строки."""

import json

from egrz.cli import main


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
