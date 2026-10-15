// 数据访问层：SQLite（Node 内置 node:sqlite，零原生依赖）
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function now() {
  return new Date().toISOString();
}

// 事务包装：出错自动回滚
export function withTx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      phone         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('student','merchant')),
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      user_id        TEXT PRIMARY KEY REFERENCES users(id),
      real_name      TEXT NOT NULL,
      school         TEXT,
      grade          TEXT,
      bio            TEXT,
      rating         REAL DEFAULT 0,
      total_jobs     INTEGER DEFAULT 0,
      blacklisted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS merchants (
      user_id          TEXT PRIMARY KEY REFERENCES users(id),
      shop_name        TEXT NOT NULL,
      address          TEXT,
      latitude         REAL,
      longitude        REAL,
      contact_person   TEXT,
      business_license TEXT,
      rating           REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id           TEXT PRIMARY KEY,
      merchant_id  TEXT NOT NULL REFERENCES users(id),
      title        TEXT NOT NULL,
      category     TEXT NOT NULL,
      description  TEXT,
      wage         REAL NOT NULL,
      wage_type    TEXT NOT NULL CHECK (wage_type IN ('hourly','daily','piece')),
      work_date    TEXT NOT NULL,
      start_time   TEXT NOT NULL,
      end_time     TEXT NOT NULL,
      location     TEXT NOT NULL,
      latitude     REAL,
      longitude    REAL,
      headcount    INTEGER NOT NULL,
      requirements TEXT,
      status       TEXT NOT NULL CHECK (status IN ('draft','published','matched','completed','settled','cancelled')),
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
      id             TEXT PRIMARY KEY,
      job_id         TEXT NOT NULL REFERENCES jobs(id),
      student_id     TEXT NOT NULL REFERENCES users(id),
      status         TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','checked_in','finished','no_show','cancelled')),
      message        TEXT,
      applied_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      checked_in_at  TEXT,
      checkin_lat    REAL,
      checkin_lng    REAL,
      UNIQUE (job_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id           TEXT PRIMARY KEY,
      job_id       TEXT NOT NULL REFERENCES jobs(id),
      from_user_id TEXT NOT NULL REFERENCES users(id),
      to_user_id   TEXT NOT NULL REFERENCES users(id),
      rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment      TEXT,
      created_at   TEXT NOT NULL,
      UNIQUE (job_id, from_user_id, to_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
    CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
    CREATE INDEX IF NOT EXISTS idx_apps_student ON applications(student_id);
  `);
}
