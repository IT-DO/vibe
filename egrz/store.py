"""Хранилище выгрузки: SQLite + история ежедневных запусков.

Задача хранилища — сделать ежедневную выгрузку инкрементальной и
воспроизводимой: помнить, что уже видели, отличать новые записи от
изменившихся и хранить журнал запусков, по которому видно динамику реестра.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator

from .models import COLUMNS, Conclusion

SCHEMA_VERSION = 1

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS conclusions (
    {', '.join(f'{name} TEXT' for name in COLUMNS if name not in ('cost', 'year', 'is_repeat'))},
    cost REAL,
    year INTEGER,
    is_repeat INTEGER NOT NULL DEFAULT 0,
    fingerprint TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_date_registered ON conclusions(date_registered);
CREATE INDEX IF NOT EXISTS idx_region ON conclusions(region);
CREATE INDEX IF NOT EXISTS idx_organization ON conclusions(organization);
CREATE INDEX IF NOT EXISTS idx_category ON conclusions(object_category);

CREATE TABLE IF NOT EXISTS runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    source TEXT NOT NULL,
    since TEXT,
    fetched INTEGER NOT NULL DEFAULT 0,
    inserted INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    unchanged INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

#: Колонки таблицы в порядке вставки.
_DB_COLUMNS = tuple(COLUMNS) + ("fingerprint", "first_seen", "last_seen")


@dataclass(slots=True)
class SyncStats:
    """Итог одного запуска выгрузки."""

    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    run_id: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "fetched": self.fetched,
            "inserted": self.inserted,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "run_id": self.run_id,
        }


class Store:
    """Тонкая обёртка над SQLite — без ORM, чтобы выгрузка оставалась переносимой."""

    def __init__(self, path: str | Path = "data/egrz.sqlite3") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(_SCHEMA)
        self.set_meta("schema_version", str(SCHEMA_VERSION))
        self.conn.commit()

    # --- служебное --------------------------------------------------------

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def set_meta(self, key: str, value: str) -> None:
        self.conn.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )

    def get_meta(self, key: str, default: str | None = None) -> str | None:
        row = self.conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

    # --- запись -----------------------------------------------------------

    @contextmanager
    def run(self, *, source: str, since: str | None) -> Iterator[SyncStats]:
        """Контекст одного запуска: пишет журнал даже если выгрузка упала."""
        started = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        cursor = self.conn.execute(
            "INSERT INTO runs(started_at, source, since) VALUES(?, ?, ?)",
            (started, source, since),
        )
        stats = SyncStats(run_id=cursor.lastrowid)
        self.conn.commit()
        try:
            yield stats
        except Exception as exc:
            self.conn.execute(
                "UPDATE runs SET finished_at=?, status='failed', error=?, "
                "fetched=?, inserted=?, updated=?, unchanged=? WHERE run_id=?",
                (
                    dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                    str(exc)[:1000],
                    stats.fetched, stats.inserted, stats.updated, stats.unchanged,
                    stats.run_id,
                ),
            )
            self.conn.commit()
            raise
        else:
            self.conn.execute(
                "UPDATE runs SET finished_at=?, status='ok', "
                "fetched=?, inserted=?, updated=?, unchanged=? WHERE run_id=?",
                (
                    dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                    stats.fetched, stats.inserted, stats.updated, stats.unchanged,
                    stats.run_id,
                ),
            )
            self.set_meta("last_sync_at", dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"))
            self.conn.commit()

    def upsert_many(self, records: Iterable[Conclusion], *, stats: SyncStats | None = None) -> SyncStats:
        """Вставляет новые записи и обновляет изменившиеся.

        Запись считается изменившейся, если её отпечаток (:meth:`Conclusion.fingerprint`)
        отличается от сохранённого — так повторная выгрузка одного и того же дня
        не создаёт ложных обновлений.
        """
        stats = stats or SyncStats()
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        placeholders = ", ".join("?" * len(_DB_COLUMNS))
        insert_sql = f"INSERT INTO conclusions({', '.join(_DB_COLUMNS)}) VALUES({placeholders})"
        update_sql = (
            "UPDATE conclusions SET "
            + ", ".join(f"{name}=?" for name in COLUMNS if name != "id")
            + ", fingerprint=?, last_seen=? WHERE id=?"
        )

        for record in records:
            stats.fetched += 1
            fingerprint = record.fingerprint()
            existing = self.conn.execute(
                "SELECT fingerprint FROM conclusions WHERE id=?", (record.id,)
            ).fetchone()

            data = record.to_dict()
            if existing is None:
                values = [_encode(data.get(name)) for name in COLUMNS]
                self.conn.execute(insert_sql, [*values, fingerprint, now, now])
                stats.inserted += 1
            elif existing["fingerprint"] != fingerprint:
                values = [_encode(data.get(name)) for name in COLUMNS if name != "id"]
                self.conn.execute(update_sql, [*values, fingerprint, now, record.id])
                stats.updated += 1
            else:
                self.conn.execute(
                    "UPDATE conclusions SET last_seen=? WHERE id=?", (now, record.id)
                )
                stats.unchanged += 1

            if stats.fetched % 2000 == 0:
                self.conn.commit()

        self.conn.commit()
        return stats

    # --- чтение ------------------------------------------------------------

    def count(self) -> int:
        return int(self.conn.execute("SELECT COUNT(*) AS n FROM conclusions").fetchone()["n"])

    def max_date_registered(self) -> str | None:
        row = self.conn.execute(
            "SELECT MAX(date_registered) AS d FROM conclusions"
        ).fetchone()
        return row["d"] if row and row["d"] else None

    def iter_records(self, *, order_by: str = "date_registered DESC") -> Iterator[dict[str, Any]]:
        allowed = {f"{c} {d}" for c in COLUMNS for d in ("ASC", "DESC")}
        if order_by not in allowed:
            raise ValueError(f"Недопустимая сортировка: {order_by}")
        query = self.conn.execute(
            f"SELECT {', '.join(COLUMNS)}, first_seen, last_seen FROM conclusions ORDER BY {order_by}"
        )
        for row in query:
            record = dict(row)
            record["is_repeat"] = bool(record["is_repeat"])
            yield record

    def recent_runs(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM runs ORDER BY run_id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]

    def suggest_since(self, *, overlap_days: int = 3) -> str | None:
        """С какой даты продолжать выгрузку.

        Берём максимальную известную дату включения в реестр и отступаем назад:
        записи попадают в реестр задним числом, поэтому «хвост» надо перечитывать.
        """
        latest = self.max_date_registered()
        if not latest:
            return None
        try:
            anchor = dt.date.fromisoformat(latest)
        except ValueError:
            return None
        return (anchor - dt.timedelta(days=overlap_days)).isoformat()


def _encode(value: Any) -> Any:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value
