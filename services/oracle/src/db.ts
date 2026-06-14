import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import type { IndexPriceRow, HistoryRow } from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'prices.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS price_history (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id          TEXT    NOT NULL,
    price             REAL    NOT NULL,
    volume            REAL    NOT NULL,
    constituents_used INTEGER NOT NULL DEFAULT 0,
    source            TEXT    NOT NULL DEFAULT 'oracle_vwap',
    fetched_at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_index_fetched
    ON price_history (index_id, fetched_at DESC);
`);

const stmtInsert = db.prepare(
  `INSERT INTO price_history (index_id, price, volume, constituents_used, source, fetched_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const stmtLatest = db.prepare(
  `SELECT * FROM price_history WHERE index_id = ? ORDER BY fetched_at DESC LIMIT 1`,
);

const stmtHistory = db.prepare(
  `SELECT price, volume, fetched_at
   FROM price_history WHERE index_id = ? ORDER BY fetched_at DESC LIMIT ?`,
);

const stmtPrune = db.prepare(
  `DELETE FROM price_history WHERE fetched_at < ?`,
);

export function insertPrice(
  indexId:          string,
  price:            number,
  volume:           number,
  constituentsUsed: number,
  source =          'oracle_vwap',
): void {
  stmtInsert.run(indexId, price, volume, constituentsUsed, source, Date.now());
}

export function getLatestPrice(indexId: string): IndexPriceRow | undefined {
  return stmtLatest.get(indexId) as IndexPriceRow | undefined;
}

export function getPriceHistory(indexId: string, limit = 1440): HistoryRow[] {
  return stmtHistory.all(indexId, limit) as unknown as HistoryRow[];
}

/** Remove records older than `retainHours` (default 7 days). */
export function pruneOldRecords(retainHours = 168): void {
  const cutoff = Date.now() - retainHours * 3_600_000;
  stmtPrune.run(cutoff);
}
