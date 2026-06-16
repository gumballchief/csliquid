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
  ): Promise<void> {
    await sql`
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

  async getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    const result = await sql`
      SELECT
        wallet,
        COUNT(*)::int                                            AS trades,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END)::int AS wins,
        SUM(notional)                                           AS volume,
        SUM(realized_pnl)                                       AS total_pnl
      FROM positions
      WHERE status = 'closed'
      GROUP BY wallet
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
