import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.join(process.cwd(), 'data', 'tos.db');

// Ensure the data directory exists before opening the file.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS tos_acceptances (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT    NOT NULL,
    ip_country  TEXT,
    user_agent  TEXT,
    accepted_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wallet ON tos_acceptances(wallet);
`);

const stmtInsert = db.prepare(
  'INSERT INTO tos_acceptances (wallet, ip_country, user_agent, accepted_at) VALUES (?, ?, ?, ?)',
);

export interface TosRecord {
  wallet:     string;
  ipCountry?: string;
  userAgent?: string;
}

export function recordAcceptance(record: TosRecord): void {
  stmtInsert.run(
    record.wallet,
    record.ipCountry ?? null,
    record.userAgent ?? null,
    Math.floor(Date.now() / 1000),
  );
}
