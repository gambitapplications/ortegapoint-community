import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDataDir } from "@/lib/config";

let db;

function columnExists(handle, table, column) {
  const rows = handle.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function ensureDb() {
  if (db) {
    return db;
  }

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "ortegapoint-community.sqlite");
  db = new DatabaseSync(dbPath);

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      folder_path TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_folder_path ON notes(folder_path);
    CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
  `);

  if (!columnExists(db, "notes", "deleted_at")) {
    db.exec("ALTER TABLE notes ADD COLUMN deleted_at TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS trash (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      original_path TEXT NOT NULL,
      display_name TEXT NOT NULL,
      trash_path TEXT,
      note_id TEXT,
      size_bytes INTEGER,
      trashed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trash_trashed_at ON trash(trashed_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_rotations (
      path TEXT PRIMARY KEY,
      degrees INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

export function getDb() {
  return ensureDb();
}

export function resetDbForTests() {
  if (db && typeof db.close === "function") {
    db.close();
  }
  db = undefined;
}
