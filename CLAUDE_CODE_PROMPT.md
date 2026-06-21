# CSLIQUID — Full Bug Fix + Feature Prompt
# Run this in Claude Code (terminal) in the cs-skin-futures directory.
# Complete EVERY item. Do not stop until all are done and deployed.

---

## CONTEXT
Next.js 14 App Router on Vercel (prod: www.csliquid.xyz)
Solana devnet, Anchor, Program ID: 76QQzNaRCjcF83bf3Bx6XN67eHbthDETKdLSVccfXf9f
USDC mint: Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
Helius devnet RPC: https://devnet.helius-rpc.com/?api-key=f6fe2699-bbfb-4999-b2e5-e58ebd674f2e
Guest wallet: 48PGsCp12VCSiaJFaErWdAeFSazzCg4HUW5TmG6HEGCD
Vercel KV for roll state/streaks, Vercel Postgres for trades/leaderboard/rewards_wins
allMarkets.ts = central registry with 35+ markets (5 index + 20 skin + 10 case perps)
onChain: false markets show DEMO badge and no trade form
Deploy: git add -A && git commit -m "..." && git push origin main

---

## BUG FIXES (all required)

### BUG 1 — Login page flashes before landing page
File: src/components/auth/AuthGuard.tsx (or ClientLayout / middleware)
The auth check shows the login/auth screen for a split second on every page load before
realizing the user is already logged in. Fix: on mount, read the persisted session from
localStorage SYNCHRONOUSLY before first paint — if a session exists, skip the auth screen
entirely. Use a `isLoading` gate that renders nothing (not the auth screen) until the
session is confirmed or denied.

### BUG 2 — "CS" in logo is wrong color on auth/login page
File: src/components/auth/AuthScreen.tsx  line ~57
Current: `CS<span style={{ color: GREEN }}>LIQUID</span>`
Fix: `<span style={{ color: ORANGE }}>CS</span><span style={{ color: GREEN }}>LIQUID</span>`
Add `const ORANGE = '#f97316';` to the constants at the top.
Apply the same orange to the "CS" part of any other logo instances in Header.tsx.

### BUG 3 — Email login missing / broken
File: src/components/auth/AuthScreen.tsx
AuthContext already has `loginWithEmail(email)` implemented. The UI section was removed.
Re-add a section "03 Email Login" below the Guest section:
- Email text input (monospace, same style as the card)
- "Continue with Email →" GreenBtn
- On click: validate email format, call loginWithEmail(email)
- Show inline error if email is blank or malformed
- No password needed — a keypair is generated for the email the first time,
  and restored from localStorage on subsequent logins (already works in AuthContext)

### BUG 4 — Charts too volatile (huge random candles)
File: src/services/skinPriceService.ts (mockFallback / EWMA logic)
File: src/lib/priceCache.ts or wherever EWMA is computed
Current: ±0.4% per-poll random walk. This compounds to massive swings over time.
Fix:
  - Reduce per-poll drift from ±0.4% to ±0.05% (α drift = 0.001 range)
  - Add a mean-reversion term: if price has drifted >5% from approxPrice, pull it back
    by 0.1% per tick toward approxPrice.
  - Cap single-tick move at ±0.3% hard maximum regardless of random draw.
  - For the on-chain EWMA prices (priceCache), clamp each new sample to ±1% of the
    previous value before feeding into the EWMA (not ±3% as currently set).
Goal: candles on the chart should look like gentle, realistic price movement.
Liquidations should only trigger when the user's actual leverage is correctly exceeded,
NOT from artificial volatility spikes.

### BUG 5 — All chart timeframes show same number of candles
File: src/components/trade/TradingChart.tsx (or wherever candle data is generated/fetched)
Current: 1H, 4H, 1D, 1W all render the same number of candles.
Fix the candle generation so each timeframe maps to a different candle interval:
  - 1H  → 1-minute candles, show last 60 candles (1 hour of data)
  - 4H  → 5-minute candles, show last 48 candles (4 hours of data)
  - 1D  → 30-minute candles, show last 48 candles (1 day of data)
  - 1W  → 4-hour candles, show last 42 candles (1 week of data)
When switching timeframes, re-aggregate/re-generate the candles at the new interval.
Higher timeframes should visually show fewer, wider candles.

### BUG 6 — Charts have too few candles / no historical data
Seed each market with at least 200 candles of synthetic history when the mockFallback
initializes, using the approxPrice as the starting point and the gentle drift from BUG 4.
This way, when the user first loads a chart, they see a meaningful history, not 5 candles.

### BUG 7 — /api/stats returns 404
Create src/app/api/stats/route.ts if it doesn't exist. It should return:
  - totalVolume (sum of collateral*leverage from positions table)
  - totalTrades (count of all positions)
  - openPositions (count of open positions)
  - totalFees (feesEarned from pool/stats)
  - uniqueTraders (distinct wallet count)
  - aprPercent (from pool/stats)
Pull from Vercel Postgres + on-chain pool account. Handle POSTGRES_URL missing gracefully.

### BUG 8 — Pool: Withdraw and Claim Fees are the same button
File: src/app/pool/page.tsx
Currently one button does both actions. Split into two separate buttons:
  - "Withdraw LP" button: withdraws LP tokens, reduces user's pool share
  - "Claim Fees" button: claims accrued fee income without removing LP
Each button should be independently enabled/disabled based on whether the user has LP
balance (for withdraw) or unclaimed fees > 0 (for claim fees).

### BUG 9 — Daily streak bug on rewards page
File: src/app/rewards/page.tsx
When hitting the daily streak milestone button, it throws an error.
Debug: likely calling an API route that doesn't exist or has wrong params.
Fix whatever is causing the error. Add try/catch + user-friendly error display.

### BUG 10 — Leaderboard only shows the current user's wallet
File: src/app/api/leaderboard/route.ts and src/app/leaderboard/page.tsx
Current: only wallets with trade records appear.
Fix: maintain a wallets registry table in Postgres. Every time a new wallet connects
(loginWithWallet, loginAsGuest, loginWithEmail in AuthContext), upsert the wallet into
a `wallets` table with columns: address TEXT PRIMARY KEY, first_seen TIMESTAMPTZ DEFAULT NOW().
The leaderboard API should LEFT JOIN this wallets table against the positions aggregate,
so every wallet appears — with $0 PnL and 0 trades if they've never traded.
Create the wallets table with CREATE TABLE IF NOT EXISTS in initDb().
Add the upsert call in /api/airdrop/route.ts or a new /api/wallet/register endpoint
that AuthContext calls after any login.

---

## NEW FEATURES (all required)

### FEATURE 1 — Images on index market cards
File: src/app/trade/page.tsx (markets listing) and wherever index cards are rendered
Each of the 5 index markets (AWP, AK47, Knife, Glove, CS500) needs a banner image on
its card, similar to how trading card game sets show artwork.
Use these public CS2/CSGO image URLs (or find working equivalents):
  - AWP Index:   https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/weapons/base_weapons/weapon_awp.png
  - AK-47 Index: https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/weapons/base_weapons/weapon_ak47.png
  - Knife Index: https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/weapons/base_weapons/weapon_knife_butterfly.png
  - Glove Index: https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/wearables/hand_wraps/leop_glove_lt.png
  - CS500 Index: use a collage or the CS2 logo
Display the image as a card hero/banner (full width, ~120px tall, object-cover, rounded top).
For DEMO skin/case markets, use their Steam CDN image if available via steamHashName,
otherwise use a generic placeholder.
Update iconUrl in allMarkets.ts for the 5 index markets to these URLs.

### FEATURE 2 — Compact price formatting (10K / 1M / 1B)
Create a utility function `formatPrice(n: number): string` in src/lib/formatters.ts:
  - n >= 1_000_000_000 → "1.23B"
  - n >= 1_000_000     → "1.23M"
  - n >= 10_000        → "10.2K"
  - n >= 1_000         → "$1,234.56" (normal with commas)
  - otherwise          → "$123.45"
Apply this formatter everywhere prices are displayed:
  - Price ticker (PriceTicker.tsx)
  - Market cards on /trade page
  - LivePriceHeader mark/index price
  - Leaderboard PnL column
  - Stats page TVL / volume
  - Portfolio P&L display
  - Prize Pool page

### FEATURE 3 — Prize claim flow after daily roll win
File: src/app/rewards/page.tsx and new src/app/api/rewards/claim/route.ts
When the roll result is `won: true`, instead of just showing the prize name, show a
claim modal/panel with two options:

Option A — Receive skin in CS2:
  - Text input: "Your Steam username"
  - Explanation: "We'll send the skin to your CS2 inventory within 48 hours"
  - Submit button: "Claim Skin →"

Option B — Receive USDC equivalent:
  - Text input: "Solana wallet address to receive USDC"
  - Pre-fill with the user's current wallet address
  - Show the USDC value: "You'll receive $X.XX USDC"
  - Submit button: "Claim USDC →"

On submit, POST to /api/rewards/claim with { wallet, prizeWon, claimType: 'skin'|'usdc', steamUsername?, receiveWallet? }.
The API should:
  1. Validate the claim (check KV that this wallet actually won today)
  2. Record the claim in Postgres rewards_wins table (add claim_type, steam_username, receive_wallet, claimed_at columns)
  3. Return { ok: true, message: "Claim received! ..." }
Show a success state after claiming. Prevent double-claims (one claim per win).

### FEATURE 4 — Compact numbers site-wide (already covered in FEATURE 2)
Also apply to: pool TVL display, fee amounts, any number > 9999 anywhere on the site.

---

## AFTER ALL FIXES

1. Run `npx tsc --noEmit` — must pass with 0 errors.
2. Run `npx next build` — must compile clean.
3. Commit and push: git add -A && git commit -m "fix+feat: login flash/color/email, chart volatility/timeframes/history, stats API, pool buttons, leaderboard all-wallets, prize claim flow, compact price format, index card images" && git push origin main
4. Verify on www.csliquid.xyz after Vercel deploys.
