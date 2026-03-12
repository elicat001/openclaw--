import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DATA_DIR = resolve(process.cwd(), "..", "data");

let _db: BetterSQLite3Database<typeof schema> | null = null;

function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const DB_PATH = resolve(DATA_DIR, "cross-selector.db");

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  // Auto-create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      params TEXT NOT NULL,
      output_dir TEXT,
      report_id TEXT,
      error TEXT,
      progress INTEGER DEFAULT 0,
      current_step TEXT,
      log_path TEXT,
      schedule_id TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      keyword TEXT,
      category TEXT,
      content TEXT NOT NULL,
      summary TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'BRL',
      rating REAL,
      reviews INTEGER,
      link TEXT,
      image_url TEXT,
      keyword TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      params TEXT NOT NULL,
      cron_expr TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);

  _db = drizzle(sqlite, { schema });
  return _db;
}

// Proxy that lazily initializes the DB on first use
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const realDb = getDb();
    const value = (realDb as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(realDb);
    }
    return value;
  },
});
