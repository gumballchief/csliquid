'use client';

import { useState, useEffect, useRef } from 'react';

const SECTIONS = [
  { id: 'overview',        label: 'Overview'        },
  { id: 'markets',         label: 'Markets'         },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'trading',         label: 'Trading'         },
  { id: 'fees',            label: 'Fees & Costs'    },
  { id: 'risk',            label: 'Risk Management' },
  { id: 'oracle',          label: 'Oracle'          },
  { id: 'pool',            label: 'Liquidity Pool'  },
  { id: 'referral',        label: 'Referral'        },
  { id: 'protocol',        label: 'Protocol'        },
  { id: 'api',             label: 'API Reference'   },
  { id: 'faq',             label: 'FAQ'             },
];

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-mono text-xl font-bold text-tx-green mb-5 border-b border-tx-border pb-3">
      {children}
    </h1>
  );
}
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[12px] font-bold text-tx-green uppercase tracking-[0.1em] mt-8 mb-3">
      {children}
    </h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-mono text-tx-muted leading-relaxed mb-4">{children}</p>
  );
}
function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-none space-y-1.5 mb-4 ml-1">
      {children}
    </ul>
  );
}
function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal list-inside text-[12px] font-mono text-tx-muted space-y-1.5 mb-4 ml-2">
      {children}
    </ol>
  );
}
function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12px] font-mono text-tx-muted leading-relaxed">
      <span className="text-tx-green shrink-0 mt-0.5">▸</span>
      <span>{children}</span>
    </li>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-tx-raised border border-tx-border px-1.5 py-0.5 text-[10px] font-mono text-tx-green">
      {children}
    </code>
  );
}
function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-tx-bg border border-tx-border rounded-sm p-4 text-[11px] font-mono text-tx-green overflow-x-auto mb-4 leading-relaxed">
      {children}
    </pre>
  );
}
function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-[11px] font-mono border-collapse bg-tx-surface border border-tx-border rounded overflow-hidden">
        <thead>
          <tr className="border-b border-tx-border">
            {head.map(h => (
              <th key={h} className="text-left text-[9px] font-mono text-tx-dim uppercase tracking-[0.1em] px-3 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-tx-border/40 last:border-b-0 hover:bg-tx-raised transition-colors ${i % 2 === 1 ? 'bg-[#0f1012]' : ''}`}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 text-tx-muted text-[11px]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children, green }: { children: React.ReactNode; green?: boolean }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-[9px] font-bold font-mono ${
      green
        ? 'bg-tx-green/10 text-tx-green border border-tx-green/20'
        : 'bg-tx-raised text-tx-muted border border-tx-border'
    }`}>
      {children}
    </span>
  );
}

function FAQItem({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-tx-border rounded-sm overflow-hidden mb-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-[12px] font-mono text-tx-muted hover:text-tx-text hover:bg-tx-raised transition-colors"
      >
        <span>{q}</span>
        <svg
          className={`w-3.5 h-3.5 text-tx-dim transition-transform duration-150 shrink-0 ml-3 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-[12px] font-mono text-tx-muted leading-relaxed border-t border-tx-border bg-tx-bg">
          {children}
        </div>
      )}
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  return (
    <>
      {/* Mobile: dropdown select */}
      <div className="md:hidden mb-4 px-0">
        <select
          value={active}
          onChange={e => {
            const el = document.getElementById(e.target.value);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className="w-full bg-tx-surface border border-tx-border text-tx-muted text-[12px] font-mono rounded-sm px-3 py-3 focus:outline-none focus:border-tx-border2 transition-colors cursor-pointer"
        >
          {SECTIONS.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      {/* Desktop: sticky sidebar */}
      <nav className="hidden md:block w-48 shrink-0 sticky top-[calc(3.5rem+1.75rem)] self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 border-r border-tx-border">
        <p className="text-[9px] font-mono font-bold text-tx-dim uppercase tracking-[0.15em] mb-3 pl-3 pt-1">
          Documentation
        </p>
        <ul className="space-y-0.5 pb-4">
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`block px-3 py-1.5 text-[11px] font-mono transition-colors ${
                  active === id
                    ? 'text-tx-green bg-tx-green/10 border-l-2 border-tx-green -ml-px pl-[11px]'
                    : 'text-tx-dim hover:text-tx-text hover:bg-tx-raised rounded-sm'
                }`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-16">
      {children}
    </section>
  );
}

export default function DocsPage() {
  const [activeId, setActiveId] = useState('overview');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const callback: IntersectionObserverCallback = entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActiveId(entry.target.id);
      }
    };
    observerRef.current = new IntersectionObserver(callback, { rootMargin: '-20% 0px -70% 0px' });
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-tx-bg font-mono">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 md:flex md:gap-8">

        <Sidebar active={activeId} />

        <div className="flex-1 min-w-0 md:pl-8">

          {/* OVERVIEW */}
          <Section id="overview">
            <H1>Overview</H1>
            <P>
              CSLIQUID is the first on-chain perpetual futures DEX for CS2 skins. Built on Solana using
              the Anchor framework, it offers markets that let traders go long or short on CS2 skins
              and indexes with up to 20× leverage. Prices are sourced from CSFloat and Skinport market
              data via an automated aggregator with adaptive EWMA smoothing. Live on Solana Mainnet.
            </P>
            <Table
              head={['Property', 'Value']}
              rows={[
                ['Network',      'Solana Mainnet'],
                ['Framework',    'Anchor'],
                ['Max Leverage', '20×'],
                ['Open Fee',     '0.05% of notional'],
                ['Close Fee',    '0.05% of notional'],
                ['Profit Cap',   '500% of collateral'],
                ['Price Feed',   'CSFloat + Skinport (60s cadence)'],
              ]}
            />
            <H2>Architecture</H2>
            <P>
              Every position is held in a program-derived account (PDA) owned by the trader&apos;s wallet.
              The liquidity pool acts as the protocol&apos;s counterparty to all trades. Funding rates
              rebalance open interest between longs and shorts every hour. An on-chain oracle program
              stores the latest aggregated price; the trading program reads from it atomically.
            </P>
          </Section>

          {/* MARKETS */}
          <Section id="markets">
            <H1>Markets</H1>
            <P>All markets are perpetual futures — they have no expiry date.</P>
            <Table
              head={['Market', 'Skin', 'Category', 'Live']}
              rows={[
                ['AWP-INDEX-PERP',       'AWP Index',                      'Index',  <Badge green key="a">Yes</Badge>],
                ['KNIFE-INDEX-PERP',     'Knife Index',                    'Index',  <Badge green key="b">Yes</Badge>],
                ['AK47-INDEX-PERP',      'AK-47 Index',                    'Index',  <Badge green key="c">Yes</Badge>],
                ['GLOVE-INDEX-PERP',     'Glove Index',                    'Index',  <Badge green key="d">Yes</Badge>],
                ['AWP-DRAGON-LORE-PERP', 'AWP Dragon Lore FN',             'Rifle',  <Badge green key="e">Yes</Badge>],
                ['AWP-MEDUSA-PERP',      'AWP Medusa FN',                  'Rifle',  <Badge green key="f">Yes</Badge>],
                ['KARAMBIT-FADE-PERP',   'Karambit Fade FN',               'Knife',  <Badge green key="g">Yes</Badge>],
                ['M9-DOPPLER-PERP',      'M9 Bayonet Doppler FN',          'Knife',  <Badge green key="h">Yes</Badge>],
                ['AK47-WILD-LOTUS-PERP', 'AK-47 Wild Lotus FN',            'Rifle',  <Badge green key="i">Yes</Badge>],
                ['GLOVE-CRIMSON-PERP',   'Sport Gloves Crimson Kimono FT', 'Gloves', <Badge green key="j">Yes</Badge>],
              ]}
            />
            <H2>Index Markets</H2>
            <P>
              Index markets track the median price of a category of skins rather than a single item.
              This reduces single-listing manipulation risk and provides smoother price feeds. The AWP
              Index, for example, aggregates the 10 most-liquid AWP skins by trading volume.
            </P>
          </Section>

          {/* GETTING STARTED */}
          <Section id="getting-started">
            <H1>Getting Started</H1>
            <OL>
              <li className="leading-relaxed"><strong className="text-tx-text">Install a Solana wallet.</strong> We recommend Phantom or Backpack. Create a new wallet or import an existing one.</li>
              <li className="leading-relaxed"><strong className="text-tx-text">Switch to Mainnet.</strong> In your wallet settings select &ldquo;Mainnet&rdquo; as the network.</li>
              <li className="leading-relaxed"><strong className="text-tx-text">Fund your wallet.</strong> Transfer SOL to your wallet to cover gas fees.</li>
              <li className="leading-relaxed"><strong className="text-tx-text">Deposit USDC.</strong> CSLIQUID uses USDC as collateral. Deposit USDC on the deposit screen to fund your account.</li>
              <li className="leading-relaxed"><strong className="text-tx-text">Pick a market.</strong> From the Trade page, select any skin or index market. Review the current mark price and 24h change.</li>
              <li className="leading-relaxed"><strong className="text-tx-text">Open a position.</strong> Choose Long or Short, set your collateral amount and leverage (1× – 20×), review the fee and liquidation price, then click Open Position.</li>
            </OL>
            <H2>Session Wallets</H2>
            <P>
              To avoid signing every transaction with your main wallet, CSLIQUID supports session
              wallets. A temporary keypair is generated in your browser, funded with a small SOL
              allowance from your main wallet, and used to sign trades automatically until the
              allowance is exhausted or you revoke it.
            </P>
          </Section>

          {/* TRADING */}
          <Section id="trading">
            <H1>Trading</H1>
            <H2>Opening a Position</H2>
            <P>
              Select a market, choose a direction (Long or Short), enter the USDC collateral amount,
              and select a leverage multiplier from 1× to 20×. The notional size equals collateral ×
              leverage. After reviewing the open fee and estimated liquidation price, click{' '}
              <Code>Open Position</Code>.
            </P>
            <Table
              head={['Parameter', 'Value', 'Notes']}
              rows={[
                ['Min collateral', '$1 USDC',            'Per position'],
                ['Max leverage',   '20×',                'Notional = collateral × leverage'],
                ['Max positions',  '5',                  'Per wallet, across all markets'],
                ['Open fee',       '0.05%',              'Charged on notional at open'],
                ['Close fee',      '0.05%',              'Charged on notional at close'],
                ['Profit cap',     '500%',               '5× collateral maximum payout'],
              ]}
            />
            <H2>PnL Formula</H2>
            <Pre>{`-- Long position
PnL = (exit_price - entry_price) / entry_price × notional

-- Short position
PnL = (entry_price - exit_price) / entry_price × notional

-- Net PnL (after fees)
Net PnL = PnL - open_fee - close_fee - funding_paid

-- Profit cap
Payout = min(collateral + Net PnL, collateral × 6)  -- max 500% profit`}</Pre>
            <H2>Closing a Position</H2>
            <P>
              Navigate to Portfolio, find your open position, and click <Code>Close</Code>. You may
              close partial amounts by entering a percentage. The close fee is charged on the portion
              of notional being closed.
            </P>
            <H2>Funding Rate</H2>
            <P>
              When longs exceed shorts (or vice versa), the majority side pays funding to the minority
              side to keep the mark price anchored to the index. Funding is settled every hour.
              The rate is proportional to the open interest imbalance.
            </P>
            <Pre>{`Funding Rate = OI_imbalance_ratio × base_rate
                            (0.01% per hour at equilibrium)`}</Pre>
          </Section>

          {/* FEES */}
          <Section id="fees">
            <H1>Fees &amp; Costs</H1>
            <Table
              head={['Fee Type', 'Rate', 'When Charged']}
              rows={[
                ['Open fee',   '0.05% of notional',    'At position open'],
                ['Close fee',  '0.05% of notional',   'At position close or liquidation'],
                ['Profit cap', '500% of collateral',   'Maximum payout limit'],
                ['Funding',    'Variable (hourly)',     'Majority side pays minority side'],
              ]}
            />
            <H2>Fee Distribution</H2>
            <Table
              head={['Recipient', 'Share', 'Description']}
              rows={[
                ['LP Pool',        '50%', 'Shared pro-rata among liquidity providers'],
                ['Insurance Fund', '25%', 'Covers protocol insolvency risk'],
                ['Platform',       '25%', 'Protocol development and operations'],
              ]}
            />
            <H2>Funding Rate Distribution</H2>
            <P>
              Funding payments flow from the majority open-interest side to the minority side.
              A portion is also retained by the protocol:
            </P>
            <Table
              head={['Recipient', 'Share']}
              rows={[
                ['Minority-side traders', '—  (received directly)'],
                ['LP Pool',               '70% of protocol cut'],
                ['Insurance Fund',        '20% of protocol cut'],
                ['Platform',              '10% of protocol cut'],
              ]}
            />
          </Section>

          {/* RISK */}
          <Section id="risk">
            <H1>Risk Management</H1>
            <H2>Liquidations</H2>
            <P>
              A position is liquidated when its margin ratio falls to or below 5%. Margin ratio is
              calculated as:
            </P>
            <Pre>{`Margin Ratio = (collateral + unrealised_PnL) / notional × 100%

Liquidation threshold: Margin Ratio ≤ 5%`}</Pre>
            <P>
              At liquidation the position is closed at the current mark price. Any remaining collateral
              after covering the loss is distributed as follows:
            </P>
            <Table
              head={['Recipient', 'Share']}
              rows={[
                ['Liquidator (keeper bot)', '2%'],
                ['LP Pool',                 '44%'],
                ['Insurance Fund',          '44%'],
                ['Platform',                '10%'],
              ]}
            />
            <H2>Adding Margin</H2>
            <P>
              To reduce liquidation risk, open your position in Portfolio and click{' '}
              <Code>Add Margin</Code>. This deposits additional USDC to your position, raising
              the margin ratio and moving your liquidation price further from the current mark.
            </P>
            <H2>Removing Margin</H2>
            <P>
              You can withdraw excess margin as long as the resulting margin ratio remains above 10%
              (a safety buffer above the 5% liquidation threshold). Click{' '}
              <Code>Remove Margin</Code> in the position panel.
            </P>
            <H2>Insurance Fund</H2>
            <P>
              If a position is liquidated into negative equity (mark price moves past the liquidation
              price before a keeper executes), the shortfall is covered by the Insurance Fund. If the
              Insurance Fund is depleted, losses are socialised across the LP pool.
            </P>
          </Section>

          {/* ORACLE */}
          <Section id="oracle">
            <H1>Oracle</H1>
            <P>
              Prices are aggregated from CSFloat and Skinport APIs every 60 seconds. The aggregator
              fetches live listings, calculates a volume-weighted average price (VWAP), rejects
              outliers beyond 2 standard deviations, and pushes the result on-chain signed by the
              admin keypair. The on-chain price account stores both the raw aggregated price and an
              EWMA-smoothed mark price used for PnL calculations.
            </P>
            <H2>EWMA Smoothing</H2>
            <Table
              head={['Parameter', 'Value', 'Effect']}
              rows={[
                ['α (fast)',    '0.30', 'Reacts quickly — used when spread narrows'],
                ['α (medium)',  '0.10', 'Default smoothing factor'],
                ['α (slow)',    '0.03', 'Used during high volatility / wide spread'],
                ['Min samples', '3',    'Minimum listings required to publish a price'],
              ]}
            />
            <H2>Staleness Protection</H2>
            <UL>
              <LI>If no price update is received for <strong className="text-tx-text">30 minutes</strong>, the trading program pauses new opens on affected markets.</LI>
              <LI>After <strong className="text-tx-text">1 hour</strong> of no updates, all affected markets are auto-paused and existing positions cannot be modified.</LI>
              <LI>The oracle operator can push a manual price update at any time to resume.</LI>
            </UL>
            <H2>Manipulation Resistance</H2>
            <P>
              Because prices are derived from multiple independent listings across two platforms
              (CSFloat and Skinport), a single seller cannot manipulate the mark price without
              simultaneously placing outlier listings on both. Outlier rejection and EWMA smoothing
              further dampen short-duration price spikes.
            </P>
          </Section>

          {/* POOL */}
          <Section id="pool">
            <H1>Liquidity Pool</H1>
            <P>
              The liquidity pool is the protocol&apos;s counterparty to all open positions. When traders
              profit, the pool pays them; when traders lose, the pool receives the proceeds. In
              addition the pool collects a share of all trading fees, funding fees, and liquidation
              proceeds.
            </P>
            <H2>Fee Sources</H2>
            <Table
              head={['Source', 'LP Share', 'Notes']}
              rows={[
                ['Trading fees (open/close)', '50%', '0.05% on notional each way'],
                ['Funding fees',               '70%', 'Of the protocol cut from funding'],
                ['Liquidations',               '44%', 'Of remaining liquidated collateral'],
              ]}
            />
            <H2>LP Tokens</H2>
            <P>
              When you deposit USDC you receive LP tokens proportional to your share of the pool.
              Share price starts at $1.00 and appreciates as the pool accumulates fees. LP tokens
              represent a pro-rata claim on pool assets.
            </P>
            <Pre>{`LP tokens received = deposit_usdc / share_price
Share price         = pool_total_usdc / total_lp_tokens`}</Pre>
            <H2>Lockup Period</H2>
            <P>
              There is <strong className="text-tx-text">no lockup period</strong>. You may withdraw
              at any time as long as the pool has sufficient free liquidity (i.e., it is not fully
              reserved by open positions).
            </P>
            <H2>Risks</H2>
            <UL>
              <LI>If traders collectively profit more than fees collected, the share price decreases.</LI>
              <LI>Extreme market moves can deplete the pool faster than the Insurance Fund can cover.</LI>
              <LI>Oracle failure or manipulation could cause incorrect liquidations that harm LPs.</LI>
            </UL>
          </Section>

          {/* REFERRAL */}
          <Section id="referral">
            <H1>Referral</H1>
            <P>
              Earn a share of trading fees generated by traders you refer to CSLIQUID.
            </P>
            <H2>How It Works</H2>
            <OL>
              <li className="leading-relaxed">Register a username on-chain from the Referral page (costs one small transaction).</li>
              <li className="leading-relaxed">Share your referral link: <Code>csliquid.xyz/ref/your-username</Code></li>
              <li className="leading-relaxed">When a referred trader opens or closes a position, you earn a percentage of their trading fee.</li>
              <li className="leading-relaxed">Earnings accumulate on-chain and can be claimed at any time.</li>
            </OL>
            <H2>Referral Rates</H2>
            <Table
              head={['Tier', 'Referred Volume (30d)', 'Rebate to Referrer']}
              rows={[
                ['Standard', '< $10,000',    '10% of referred fees'],
                ['Silver',   '$10k – $100k', '15% of referred fees'],
                ['Gold',     '> $100k',      '20% of referred fees'],
              ]}
            />
            <P>
              Referral earnings come from the Platform share of fees (25%) and do not reduce the
              LP or Insurance Fund allocation.
            </P>
          </Section>

          {/* PROTOCOL */}
          <Section id="protocol">
            <H1>Protocol</H1>
            <Table
              head={['Property', 'Value']}
              rows={[
                ['Program ID', 'TBD — deploying to mainnet soon'],
                ['Network',    'Solana Mainnet'],
                ['Framework',  'Anchor'],
                ['Frontend',   'csliquid.xyz'],
                ['Source',     'Coming soon'],
              ]}
            />
            <H2>Instructions</H2>
            <Table
              head={['Instruction', 'Who Calls', 'Description']}
              rows={[
                ['initialize',          'Admin',    'Bootstrap pool and config accounts'],
                ['update_price',        'Oracle',   'Push new mark price from aggregator'],
                ['add_liquidity',       'LP',       'Deposit USDC, mint LP tokens'],
                ['remove_liquidity',    'LP',       'Burn LP tokens, withdraw USDC'],
                ['open_position',       'Trader',   'Open a long or short position'],
                ['close_position',      'Trader',   'Close all or part of a position'],
                ['add_margin',          'Trader',   'Deposit additional collateral to a position'],
                ['remove_margin',       'Trader',   'Withdraw excess collateral from a position'],
                ['liquidate',           'Keeper',   'Liquidate an under-margined position'],
                ['settle_funding',      'Crank',    'Apply hourly funding to all open positions'],
                ['claim_fees',          'LP',       'Claim accrued fee earnings'],
                ['register_referral',   'User',     'Register a referral username on-chain'],
                ['claim_referral_fees', 'Referrer', 'Claim accrued referral earnings'],
                ['update_config',       'Admin',    'Update protocol parameters'],
              ]}
            />
          </Section>

          {/* API */}
          <Section id="api">
            <H1>API Reference</H1>
            <P>
              The REST API is served by the oracle aggregator backend. All endpoints return JSON.
              Base URL: <Code>https://api.csliquid.xyz/v1</Code> (mainnet).
            </P>
            <Table
              head={['Method', 'Endpoint', 'Description']}
              rows={[
                ['GET', '/ping',          'Health check — returns {"ok":true}'],
                ['GET', '/health',        'Detailed service status'],
                ['GET', '/prices',        'Latest mark price for all markets'],
                ['GET', '/candles',       'OHLCV candlestick data'],
                ['GET', '/trades/recent', 'Last 100 trades across all markets'],
                ['GET', '/trades',        'Paginated trade history'],
                ['GET', '/stats',         'Protocol-wide 24h statistics'],
              ]}
            />
            <H2>/prices</H2>
            <Pre>{`GET /prices
GET /prices?market=AWP-INDEX

// Response
{
  "AWP-INDEX":   { "price": 1842.50, "ts": 1718000000, "change24h": 2.3  },
  "KNIFE-INDEX": { "price":  980.00, "ts": 1718000000, "change24h": -1.1 },
  "AK47-INDEX":  { "price":  320.75, "ts": 1718000000, "change24h": 0.8  },
  "GLOVE-INDEX": { "price":  610.20, "ts": 1718000000, "change24h": 1.5  }
}`}</Pre>
            <H2>/candles</H2>
            <Pre>{`GET /candles?market=AWP-INDEX&resolution=1h&limit=200

// Response — array of OHLCV objects
[
  { "t": 1718000000, "o": 1838.00, "h": 1851.00, "l": 1830.00, "c": 1842.50, "v": 48200 },
  ...
]

// Supported markets
AWP-INDEX, KNIFE-INDEX, AK47-INDEX, GLOVE-INDEX,
AWP-DRAGON-LORE, AWP-MEDUSA, KARAMBIT-FADE,
M9-DOPPLER, AK47-WILD-LOTUS, GLOVE-CRIMSON

// Supported resolutions
1m, 5m, 15m, 1h, 4h, 1d`}</Pre>
            <H2>/stats</H2>
            <Pre>{`GET /stats

// Response
{
  "total_volume_24h":  128400,
  "total_volume_all":  9820000,
  "open_interest_long":  4188,
  "open_interest_short": 2156,
  "fees_24h":    256.80,
  "fees_all":    812.79,
  "unique_traders": 47,
  "active_positions": 12
}`}</Pre>
          </Section>

          {/* FAQ */}
          <Section id="faq">
            <H1>FAQ</H1>
            <FAQItem q="Do I need a crypto wallet extension?">
              Yes. CSLIQUID requires a Solana-compatible browser wallet (Phantom, Backpack, Solflare,
              etc.) to sign transactions. Alternatively you can use the &quot;Continue as guest&quot; mode to
              browse markets without connecting a wallet — but you cannot trade or provide liquidity
              without one.
            </FAQItem>
            <FAQItem q="Is this real money?">
              Yes. CSLIQUID is live on Solana Mainnet. All SOL and USDC used are real
              mainnet tokens with real-world value. Trade responsibly.
            </FAQItem>
            <FAQItem q="What happens if I close my browser?">
              Your positions are stored entirely on-chain and are not affected by browser state.
              You can close the tab, restart your computer, or switch devices — your positions remain
              open until you close them or they are liquidated. The session wallet (if you used one)
              will be re-imported automatically on your next visit using the encrypted keypair stored
              in your browser&apos;s localStorage.
            </FAQItem>
            <FAQItem q="How do I reset my password?">
              CSLIQUID uses wallet-based authentication — there are no passwords. If you lose access
              to your wallet, recover it with your seed phrase. If you signed up with email, use the
              &quot;Forgot password?&quot; link on the login page to receive a reset link.
            </FAQItem>
            <FAQItem q="Can I get liquidated?">
              Yes. If your position&apos;s margin ratio falls to or below 5%, a keeper bot will
              liquidate it automatically. To avoid liquidation, monitor your positions, add margin
              when needed, or use lower leverage. You can see your estimated liquidation price on
              every open position card.
            </FAQItem>
            <FAQItem q="How is the skin price determined?">
              The oracle aggregator fetches live listings from CSFloat and Skinport every 60 seconds,
              computes a volume-weighted average price, rejects statistical outliers, and applies
              EWMA smoothing before pushing the result on-chain. The mark price — not the spot price
              — is used for PnL and liquidation calculations.
            </FAQItem>
            <FAQItem q="What is the profit cap?">
              The maximum payout on any single position is 500% of collateral (6× your initial
              deposit including the collateral itself). This cap protects the liquidity pool from
              catastrophic single-position losses during extreme price events.
            </FAQItem>
            <FAQItem q="Can I provide liquidity?">
              Yes. Visit the{' '}
              <a href="/pool" className="text-tx-green hover:text-tx-green/80 underline underline-offset-2">
                Pool
              </a>{' '}
              page to deposit USDC into the liquidity pool. You will receive LP tokens representing
              your share of the pool and earn a portion of all trading fees, funding fees, and
              liquidation proceeds. There is no lockup period.
            </FAQItem>
          </Section>

        </div>
      </div>
    </div>
  );
}
