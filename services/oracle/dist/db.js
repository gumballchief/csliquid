"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertPrice = insertPrice;
exports.getLatestPrice = getLatestPrice;
exports.getPriceHistory = getPriceHistory;
exports.pruneOldRecords = pruneOldRecords;
const node_sqlite_1 = require("node:sqlite");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const DATA_DIR = path_1.default.join(__dirname, '..', 'data');
const DB_PATH = path_1.default.join(DATA_DIR, 'prices.db');
if (!fs_1.default.existsSync(DATA_DIR)) {
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
}
const db = new node_sqlite_1.DatabaseSync(DB_PATH);
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
const stmtInsert = db.prepare(`INSERT INTO price_history (index_id, price, volume, constituents_used, source, fetched_at)
   VALUES (?, ?, ?, ?, ?, ?)`);
const stmtLatest = db.prepare(`SELECT * FROM price_history WHERE index_id = ? ORDER BY fetched_at DESC LIMIT 1`);
const stmtHistory = db.prepare(`SELECT price, volume, fetched_at
   FROM price_history WHERE index_id = ? ORDER BY fetched_at DESC LIMIT ?`);
const stmtPrune = db.prepare(`DELETE FROM price_history WHERE fetched_at < ?`);
function insertPrice(indexId, price, volume, constituentsUsed, source = 'oracle_vwap') {
    stmtInsert.run(indexId, price, volume, constituentsUsed, source, Date.now());
}
function getLatestPrice(indexId) {
    return stmtLatest.get(indexId);
}
function getPriceHistory(indexId, limit = 1440) {
    return stmtHistory.all(indexId, limit);
}
/** Remove records older than `retainHours` (default 7 days). */
function pruneOldRecords(retainHours = 168) {
    const cutoff = Date.now() - retainHours * 3_600_000;
    stmtPrune.run(cutoff);
}
