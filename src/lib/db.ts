import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Одно подключение к SQLite на весь процесс.
 *
 * Почему SQLite, а не "взрослая" база: это один файл на диске. Его можно
 * скопировать, положить в бэкап, открыть просмотрщиком. Пока у тебя меньше
 * нескольких сотен запросов в секунду - этого достаточно с большим запасом.
 * Менять базу нужно тогда, когда упрёшься, а не заранее.
 */

declare global {
  // В dev-режиме Next перезагружает модули на каждое изменение файла.
  // Без этого кэша мы бы открывали новое подключение на каждый чих.
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function open(): Database.Database {
  const file = process.env.DATABASE_PATH || "./data/app.db";
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  // WAL: читатели не блокируют писателя. Для веб-приложения - обязательно.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      credits       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS payments (
      id             TEXT    PRIMARY KEY,          -- id платежа в ЮKassa
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id        TEXT    NOT NULL,
      amount_rub     TEXT    NOT NULL,
      credits        INTEGER NOT NULL,
      status         TEXT    NOT NULL,             -- pending | succeeded | canceled
      credits_issued INTEGER NOT NULL DEFAULT 0,   -- 0/1, защита от двойного начисления
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

    CREATE TABLE IF NOT EXISTS generations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      input      TEXT    NOT NULL,
      output     TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id, id DESC);
  `);
}

export const db: Database.Database = globalThis.__db ?? (globalThis.__db = open());

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  credits: number;
  created_at: string;
};
