"""Командный интерфейс ежедневной выгрузки ЕГРЗ.

    egrz sync      — забрать данные из источника в локальную базу
    egrz export    — собрать витрину для дашборда
    egrz daily     — sync + export одной командой (то, что крутится по расписанию)
    egrz discover  — разведка API, когда выгрузка перестала работать
    egrz stats     — что сейчас лежит в базе
    egrz serve     — локальный просмотр дашборда
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from .export import export_all
from .source import get_source
from .store import Store

DEFAULT_DB = "data/egrz.sqlite3"
DEFAULT_EXPORT = "data/export"
WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def _log(message: str) -> None:
    stamp = dt.datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


# --------------------------------------------------------------------------
# Команды
# --------------------------------------------------------------------------

def cmd_sync(args: argparse.Namespace) -> int:
    with Store(args.db) as store:
        since = args.since
        if since is None and not args.full:
            since = store.suggest_since(overlap_days=args.overlap)
            if since:
                _log(f"Инкрементальная выгрузка с {since} (перекрытие {args.overlap} дн.)")
            else:
                _log("База пуста — выгружаем всё")
        elif args.full:
            since = None
            _log("Полная выгрузка (--full)")

        source_kwargs: dict[str, object] = {}
        if args.source == "demo":
            source_kwargs = {"count": args.demo_count}
        elif args.source == "excel":
            if not args.file:
                _log("Для --source excel укажите --file: путь к .xlsx или ссылку на выгрузку")
                return 1
            source_kwargs = {"source": args.file, "sheet": args.sheet}
        source = get_source(args.source, config_path=args.config, **source_kwargs)

        with store.run(source=args.source, since=since) as stats:
            store.upsert_many(
                source.iter_conclusions(since=since, limit=args.limit), stats=stats
            )
            store.set_meta("last_source_kind", args.source)

        # Нераспознанные колонки — единственный признак того, что выгрузка
        # изменилась, поэтому о них нужно сказать вслух, а не прятать в отчёт.
        report = getattr(source, "report", None)
        if report and report.get("unmapped_columns"):
            _log(f"Не распознаны колонки: {', '.join(report['unmapped_columns'][:12])}")
            _log("Добавьте для них правило в HEADER_RULES (egrz/excel.py), если они нужны")

        _log(
            f"Готово: получено {stats.fetched}, новых {stats.inserted}, "
            f"обновлено {stats.updated}, без изменений {stats.unchanged}"
        )
        _log(f"Всего в базе: {store.count()}")
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    with Store(args.db) as store:
        if store.count() == 0:
            _log("База пуста — сначала выполните `egrz sync`")
            return 1
        result = export_all(store, args.out, max_rows=args.max_rows)
    _log(f"Витрина собрана: {result['records']} записей -> {args.out}")
    if result["dashboard_records"] != result["records"]:
        _log(f"В дашборд попали {result['dashboard_records']} самых свежих (--max-rows)")
    return 0


def cmd_daily(args: argparse.Namespace) -> int:
    code = cmd_sync(args)
    if code != 0:
        return code
    return cmd_export(args)


def cmd_discover(args: argparse.Namespace) -> int:
    from .discover import probe, write_report
    from .source import SourceConfig

    config = SourceConfig.load(args.config)
    _log(f"Разведка API: {len(config.discovery_candidates)} кандидатов")
    report = probe(config)

    for attempt in report["attempts"]:
        mark = "OK " if attempt.get("suggested_field_map") else ("··· " if attempt.get("status") else "нет")
        detail = attempt.get("verdict") or attempt.get("note") or attempt.get("error", "")
        _log(f"  [{mark}] {attempt['method']} {attempt['url']} — {str(detail)[:120]}")

    path = write_report(report, args.out)
    _log(f"Отчёт: {path}")
    _log(report["summary"])
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    with Store(args.db) as store:
        payload = {
            "records": store.count(),
            "date_max": store.max_date_registered(),
            "last_sync_at": store.get_meta("last_sync_at"),
            "last_source_kind": store.get_meta("last_source_kind"),
            "recent_runs": store.recent_runs(10),
        }
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    """Отдаёт дашборд и витрину по HTTP: файловый:// не даёт fetch читать JSON."""
    import functools
    import http.server
    import socketserver

    root = Path(args.root).resolve()
    if not (root / "index.html").exists():
        _log(f"В {root} нет index.html")
        return 1

    export_dir = Path(args.out).resolve()
    link = root / "data"
    if export_dir.exists() and not link.exists():
        try:
            link.symlink_to(export_dir, target_is_directory=True)
            _log(f"Витрина подключена: {link} -> {export_dir}")
        except OSError:
            _log(f"Не удалось связать {link} с {export_dir}; скопируйте файлы вручную")

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    with socketserver.TCPServer(("", args.port), handler) as httpd:
        _log(f"Дашборд: http://localhost:{args.port}/ (Ctrl+C для остановки)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            _log("Остановлено")
    return 0


# --------------------------------------------------------------------------
# Разбор аргументов
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="egrz",
        description="Ежедневная выгрузка реестра заключений экспертизы ЕГРЗ",
    )
    parser.add_argument("--db", default=DEFAULT_DB, help=f"файл базы (по умолчанию {DEFAULT_DB})")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_sync_args(sub: argparse.ArgumentParser) -> None:
        sub.add_argument(
            "--source", choices=("api", "excel", "demo"), default="api",
            help="api — OData-эндпоинт ЕГРЗ; excel — скачанная выгрузка .xlsx; "
                 "demo — синтетические данные для офлайн-проверки",
        )
        sub.add_argument(
            "--file",
            help="для --source excel: путь к .xlsx или ссылка на excelDataFile",
        )
        sub.add_argument("--sheet", help="лист книги Excel (по умолчанию первый)")
        sub.add_argument("--since", help="дата в формате YYYY-MM-DD; по умолчанию — авто")
        sub.add_argument("--full", action="store_true", help="полная выгрузка вместо инкрементальной")
        sub.add_argument("--overlap", type=int, default=3,
                         help="сколько дней перечитывать заново (записи попадают в реестр задним числом)")
        sub.add_argument("--limit", type=int, help="ограничить число записей (отладка)")
        sub.add_argument("--demo-count", type=int, default=4000, help="сколько записей генерирует demo-источник")
        sub.add_argument("--config", help="путь к YAML-описанию источника")

    def add_export_args(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--out", default=DEFAULT_EXPORT, help=f"каталог витрины (по умолчанию {DEFAULT_EXPORT})")
        sub.add_argument("--max-rows", type=int, default=60000,
                         help="сколько самых свежих записей класть в дашборд (0 — все)")

    sync = subparsers.add_parser("sync", help="выгрузить данные из источника в базу")
    add_sync_args(sync)
    sync.set_defaults(func=cmd_sync)

    export = subparsers.add_parser("export", help="собрать витрину для дашборда")
    add_export_args(export)
    export.set_defaults(func=cmd_export)

    daily = subparsers.add_parser("daily", help="sync + export (ежедневный запуск)")
    add_sync_args(daily)
    add_export_args(daily)
    daily.set_defaults(func=cmd_daily)

    discover = subparsers.add_parser("discover", help="разведка API источника")
    discover.add_argument("--config", help="путь к YAML-описанию источника")
    discover.add_argument("--out", default="data/discovery.json", help="куда положить отчёт")
    discover.set_defaults(func=cmd_discover)

    stats = subparsers.add_parser("stats", help="состояние базы")
    stats.set_defaults(func=cmd_stats)

    serve = subparsers.add_parser("serve", help="локальный просмотр дашборда")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--root", default=str(WEB_DIR), help="каталог дашборда")
    serve.add_argument("--out", default=DEFAULT_EXPORT, help="каталог витрины")
    serve.set_defaults(func=cmd_serve)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, "max_rows", None) == 0:
        args.max_rows = None
    try:
        return int(args.func(args))
    except KeyboardInterrupt:
        _log("Прервано пользователем")
        return 130
    except Exception as exc:  # noqa: BLE001 — CLI показывает ошибку, а не трейсбек
        _log(f"Ошибка: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
