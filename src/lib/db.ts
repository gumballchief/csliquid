import { sql } from '@vercel/postgres';

export async function initDb(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS positions (
      id            SERIAL PRIMARY KEY,
      wallet        VARCHAR(64)   NOT NULL,
      market        VARCHAR(20)   NOT NULL,
      direction     VARCHAR(5)    NOT NULL,
      size          DECIMAL(20,6) NOT NULL,
      collateral    DECIMAL(20,6) NOT NULL,
      leverage      INTEGER       NOT NULL,
      entry_price   DECIMAL(20,6) NOT NULL,
      liq_price     DECIMAL(20,6) NOT NULL,
      notional      DECIMAL(20,6) NOT NULL,
      fee           DECIMAL(20,6) NOT NULL,
      status        VARCHAR(10)   NOT NULL DEFAULT 'open',
      open_tx       VARCHAR(128),
      close_tx      VARCHAR(128),
      exit_price    DECIMAL(20,6),
      realized_pnl  DECIMAL(20,6),
      opened_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      closed_at     TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS wallets (
      address    VARCHAR(64)  PRIMARY KEY,
      first_seen TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      last_seen  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS price_history (
      id          SERIAL PRIMARY KEY,
      skin_id     TEXT          NOT NULL,
      price       NUMERIC(20,6) NOT NULL,
      recorded_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ph_skin_time
    ON price_history (skin_id, recorded_at DESC)
  `;
}

export interface TradeRecord {
  id: number;
  wallet: string;
  market: string;
  direction: string;
  size: number;
  collateral: number;
  leverage: number;
  entry_price: number;
  liq_price: number;
  notional: number;
  fee: number;
  status: string;
  open_tx: string | null;
  close_tx: string | null;
  exit_price: number | null;
  realized_pnl: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface LeaderboardEntry {
  wallet: string;
  trades: number;
  wins: number;
  volume: number;
  total_pnl: number;
  win_rate: number;
}

export const db = {
  async recordOpenPosition(data: {
    wallet: string;
    market: string;
    direction: 'LONG' | 'SHORT';
    size: number;
    collateral: number;
    leverage: number;
    entry_price: number;
    liq_price: number;
    notional: number;
    fee: number;
    open_tx: string;
  }): Promise<number> {
    const result = await sql`
      INSERT INTO positions
        (wallet, market, direction, size, collateral, leverage, entry_price, liq_price, notional, fee, open_tx)
      VALUES
        (${data.wallet}, ${data.market}, ${data.direction}, ${data.size},
         ${data.collateral}, ${data.leverage}, ${data.entry_price}, ${data.liq_price},
         ${data.notional}, ${data.fee}, ${data.open_tx})
      RETURNING id
    `;
    return result.rows[0].id as number;
  },

  async recordClosePosition(
    wallet: string,
    market: string,
    close_tx: string,
    exit_price: number,
    realized_pnl: number,
    fallback?: { direction: string; size: number; entry_price: number; leverage: number },
  ): Promise<void> {
    const result = await sql`
      UPDATE positions
      SET status       = 'closed',
          close_tx     = ${close_tx},
          exit_price   = ${exit_price},
          realized_pnl = ${realized_pnl},
          closed_at    = NOW()
      WHERE wallet = ${wallet}
        AND market = ${market}
        AND status = 'open'
    `;
    // If no open record existed (record-open was skipped or failed), insert a
    // closed-only record so the trade still appears in history.
    if ((result.rowCount ?? 0) === 0 && fallback) {
      const dir      = fallback.direction.toUpperCase();
      const notional = fallback.size * fallback.entry_price;
      await sql`
        INSERT INTO positions
          (wallet, market, direction, size, collateral, leverage,
           entry_price, liq_price, notional, fee,
           status, close_tx, exit_price, realized_pnl, closed_at)
        VALUES
          (${wallet}, ${market}, ${dir}, ${fallback.size},
           ${notional / fallback.leverage}, ${fallback.leverage},
           ${fallback.entry_price}, 0, ${notional}, 0,
           'closed', ${close_tx}, ${exit_price}, ${realized_pnl}, NOW())
        ON CONFLICT DO NOTHING
      `;
    }
  },

  async getOpenPositions(wallet: string): Promise<TradeRecord[]> {
    const result = await sql`
      SELECT * FROM positions WHERE wallet = ${wallet} AND status = 'open'
    `;
    return result.rows as TradeRecord[];
  },

  async getTradeHistory(wallet: string, limit = 50): Promise<TradeRecord[]> {
    const result = await sql`
      SELECT * FROM positions
      WHERE wallet = ${wallet} AND status = 'closed'
      ORDER BY closed_at DESC
      LIMIT ${limit}
    `;
    return result.rows as TradeRecord[];
  },

  async recordPriceSnapshot(skinId: string, price: number): Promise<void> {
    await sql`INSERT INTO price_history (skin_id, price) VALUES (${skinId}, ${price})`;
  },

  async getPriceSnapshots(
    skinId: string,
    since: Date,
    limit = 5000,
  ): Promise<{ price: number; recorded_at: string }[]> {
    const result = await sql`
      SELECT price, recorded_at FROM price_history
      WHERE skin_id = ${skinId} AND recorded_at >= ${since.toISOString()}
      ORDER BY recorded_at ASC
      LIMIT ${limit}
    `;
    return result.rows as { price: number; recorded_at: string }[];
  },

  async countPriceSnapshots(skinId: string): Promise<number> {
    const result = await sql`SELECT COUNT(*) AS cnt FROM price_history WHERE skin_id = ${skinId}`;
    return Number(result.rows[0].cnt);
  },

  async upsertWallet(address: string): Promise<void> {
    await sql`
      INSERT INTO wallets (address)
      VALUES (${address})
      ON CONFLICT (address) DO UPDATE SET last_seen = NOW()
    `;
  },

  async getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    const result = await sql`
      WITH all_wallets AS (
        SELECT address FROM wallets
        UNION
        SELECT DISTINCT wallet AS address FROM positions
      )
      SELECT
        aw.address                                                          AS wallet,
        COUNT(p.id)::int                                                    AS trades,
        COALESCE(SUM(CASE WHEN p.realized_pnl > 0 THEN 1 ELSE 0 END), 0)::int AS wins,
        COALESCE(SUM(p.notional), 0)                                        AS volume,
        COALESCE(SUM(p.realized_pnl), 0)                                    AS total_pnl
      FROM all_wallets aw
      LEFT JOIN positions p ON p.wallet = aw.address AND p.status = 'closed'
      GROUP BY aw.address
      ORDER BY total_pnl DESC
      LIMIT ${limit}
    `;
    return result.rows.map(r => ({
      wallet:    r.wallet as string,
      trades:    Number(r.trades),
      wins:      Number(r.wins),
      volume:    Number(r.volume),
      total_pnl: Number(r.total_pnl),
      win_rate:  Number(r.trades) > 0 ? (Number(r.wins) / Number(r.trades)) * 100 : 0,
    }));
  },
};
