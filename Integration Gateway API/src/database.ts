import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Open SQLite and apply the idempotent schema setup.
 * Order plus key rows and webhook status transitions use SQLite transactions.
 */
export function openDatabase(path: string): Database {
  const filename = path === ":memory:" ? path : resolve(path);
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS customers_owner_idx ON customers(owner_id);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), owner_id TEXT NOT NULL, status TEXT NOT NULL, total_cents INTEGER NOT NULL, currency TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_owner_idx ON orders(owner_id);
    CREATE TABLE IF NOT EXISTS idempotency_keys (principal TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response_json TEXT NOT NULL, status_code INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(principal, key));
    CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, last_error TEXT, received_at TEXT NOT NULL, processed_at TEXT);
  `);
  return db;
}

export type Db = ReturnType<typeof openDatabase>;
