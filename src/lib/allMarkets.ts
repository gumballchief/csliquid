/**
 * Central market registry — single source of truth for all tradeable markets.
 * Includes the 5 original index markets, 20 individual high-value skin perps,
 * and 10 CS2 case perps.
 */

export type MarketType = 'index' | 'rifle' | 'pistol' | 'knife' | 'glove' | 'case';

export interface MarketDefinition {
  slug:          string;        // URL param, e.g. 'awp-dragon-lore-fn'
  ticker:        string;        // Short display ticker
  name:          string;        // Full display name
  shortName:     string;        // Compact name for cards
  type:          MarketType;
  steamHashName: string | null; // null for composite indices
  approxPrice:   number;        // USD baseline for fallback
  onChain:       boolean;       // has an initialized on-chain market account
  iconUrl:       string;        // Steam CDN icon hash (empty = show placeholder)
}

export const ALL_MARKETS: MarketDefinition[] = [
  // ── Index markets (on-chain, existing) ──────────────────────────────────────
  {
    slug: 'awp-index', ticker: 'AWP-IDX', name: 'AWP Index',
    shortName: 'AWP Index',
    type: 'index', steamHashName: null, approxPrice: 55, onChain: true,
    iconUrl: 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/weapons/base_weapons/weapon_awp.png',
  },
  {
    slug: 'ak47-index', ticker: 'AK47-IDX', name: 'AK-47 Index',
    shortName: 'AK-47 Index',
    type: 'index', steamHashName: null, approxPrice: 12, onChain: true,
    iconUrl: 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/weapons/base_weapons/weapon_ak47.png',
  },
  {
    slug: 'knife-index', ticker: 'KNIFE-IDX', name: 'Knife Index',
    shortName: 'Knife Index',
    type: 'index', steamHashName: null, approxPrice: 480, onChain: true,
    iconUrl: 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/weapons/base_weapons/weapon_knife_butterfly.png',
  },
  {
    slug: 'glove-index', ticker: 'GLOVE-IDX', name: 'Glove Index',
    shortName: 'Glove Index',
    type: 'index', steamHashName: null, approxPrice: 280, onChain: true,
    iconUrl: 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/wearables/hand_wraps/leop_glove_lt.png',
  },
  {
    slug: 'cs500-index', ticker: 'CS500', name: 'CS500 Index',
    shortName: 'CS500 Index',
    type: 'index', steamHashName: null, approxPrice: 420, onChain: true,
    iconUrl: 'https://cdn.cloudflare.steamstatic.com/apps/730/icons/econ/weapons/base_weapons/weapon_awp.png',
  },

  // ── Individual skin perps ─────────────────────────────────────────────────
  {
    slug: 'awp-dragon-lore-fn', ticker: 'AWP-DL',
    name: 'AWP | Dragon Lore (Factory New)',
    shortName: 'Dragon Lore FN',
    type: 'rifle', steamHashName: 'AWP | Dragon Lore (Factory New)',
    approxPrice: 10000, onChain: false, iconUrl: '',
  },
  {
    slug: 'awp-gungnir-fn', ticker: 'AWP-GNG',
    name: 'AWP | Gungnir (Factory New)',
    shortName: 'Gungnir FN',
    type: 'rifle', steamHashName: 'AWP | Gungnir (Factory New)',
    approxPrice: 3000, onChain: false, iconUrl: '',
  },
  {
    slug: 'awp-medusa-fn', ticker: 'AWP-MED',
    name: 'AWP | Medusa (Factory New)',
    shortName: 'Medusa FN',
    type: 'rifle', steamHashName: 'AWP | Medusa (Factory New)',
    approxPrice: 2000, onChain: false, iconUrl: '',
  },
  {
    slug: 'awp-asiimov-fn', ticker: 'AWP-ASI',
    name: 'AWP | Asiimov (Factory New)',
    shortName: 'Asiimov FN',
    type: 'rifle', steamHashName: 'AWP | Asiimov (Factory New)',
    approxPrice: 250, onChain: false, iconUrl: '',
  },
  {
    slug: 'ak47-wild-lotus-fn', ticker: 'AK-WL',
    name: 'AK-47 | Wild Lotus (Factory New)',
    shortName: 'Wild Lotus FN',
    type: 'rifle', steamHashName: 'AK-47 | Wild Lotus (Factory New)',
    approxPrice: 5000, onChain: false, iconUrl: '',
  },
  {
    slug: 'ak47-gold-arabesque-fn', ticker: 'AK-GA',
    name: 'AK-47 | Gold Arabesque (Factory New)',
    shortName: 'Gold Arabesque FN',
    type: 'rifle', steamHashName: 'AK-47 | Gold Arabesque (Factory New)',
    approxPrice: 3000, onChain: false, iconUrl: '',
  },
  {
    slug: 'ak47-fire-serpent-fn', ticker: 'AK-FS',
    name: 'AK-47 | Fire Serpent (Factory New)',
    shortName: 'Fire Serpent FN',
    type: 'rifle', steamHashName: 'AK-47 | Fire Serpent (Factory New)',
    approxPrice: 800, onChain: false, iconUrl: '',
  },
  {
    slug: 'ak47-case-hardened-fn', ticker: 'AK-CH',
    name: 'AK-47 | Case Hardened (Factory New)',
    shortName: 'Case Hardened FN',
    type: 'rifle', steamHashName: 'AK-47 | Case Hardened (Factory New)',
    approxPrice: 200, onChain: false, iconUrl: '',
  },
  {
    slug: 'm4a4-howl-fn', ticker: 'M4-HOWL',
    name: 'M4A4 | Howl (Factory New)',
    shortName: 'Howl FN',
    type: 'rifle', steamHashName: 'M4A4 | Howl (Factory New)',
    approxPrice: 3500, onChain: false, iconUrl: '',
  },
  {
    slug: 'm4a4-poseidon-fn', ticker: 'M4-POS',
    name: 'M4A4 | Poseidon (Factory New)',
    shortName: 'Poseidon FN',
    type: 'rifle', steamHashName: 'M4A4 | Poseidon (Factory New)',
    approxPrice: 600, onChain: false, iconUrl: '',
  },
  {
    slug: 'm4a1s-golden-coil-fn', ticker: 'M4S-GC',
    name: 'M4A1-S | Golden Coil (Factory New)',
    shortName: 'Golden Coil FN',
    type: 'rifle', steamHashName: 'M4A1-S | Golden Coil (Factory New)',
    approxPrice: 800, onChain: false, iconUrl: '',
  },
  {
    slug: 'glock-fade-fn', ticker: 'G18-FADE',
    name: 'Glock-18 | Fade (Factory New)',
    shortName: 'Glock Fade FN',
    type: 'pistol', steamHashName: 'Glock-18 | Fade (Factory New)',
    approxPrice: 800, onChain: false, iconUrl: '',
  },
  {
    slug: 'desert-eagle-blaze-fn', ticker: 'DEAGLE-BLZ',
    name: 'Desert Eagle | Blaze (Factory New)',
    shortName: 'Blaze FN',
    type: 'pistol', steamHashName: 'Desert Eagle | Blaze (Factory New)',
    approxPrice: 600, onChain: false, iconUrl: '',
  },
  {
    slug: 'usp-kill-confirmed-fn', ticker: 'USP-KC',
    name: 'USP-S | Kill Confirmed (Factory New)',
    shortName: 'Kill Confirmed FN',
    type: 'pistol', steamHashName: 'USP-S | Kill Confirmed (Factory New)',
    approxPrice: 500, onChain: false, iconUrl: '',
  },
  {
    slug: 'karambit-doppler-p2-fn', ticker: 'KARA-DP2',
    name: 'Karambit | Doppler Phase 2 (Factory New)',
    shortName: 'Kara Doppler P2 FN',
    type: 'knife', steamHashName: '★ Karambit | Doppler (Factory New)',
    approxPrice: 2000, onChain: false, iconUrl: '',
  },
  {
    slug: 'karambit-fade-fn', ticker: 'KARA-FD',
    name: 'Karambit | Fade (Factory New)',
    shortName: 'Kara Fade FN',
    type: 'knife', steamHashName: '★ Karambit | Fade (Factory New)',
    approxPrice: 1800, onChain: false, iconUrl: '',
  },
  {
    slug: 'butterfly-doppler-p1-fn', ticker: 'BFLY-DP1',
    name: 'Butterfly Knife | Doppler Phase 1 (Factory New)',
    shortName: 'Butterfly Doppler P1 FN',
    type: 'knife', steamHashName: '★ Butterfly Knife | Doppler (Factory New)',
    approxPrice: 1200, onChain: false, iconUrl: '',
  },
  {
    slug: 'm9-bayonet-doppler-fn', ticker: 'M9-DP',
    name: 'M9 Bayonet | Doppler (Factory New)',
    shortName: 'M9 Doppler FN',
    type: 'knife', steamHashName: '★ M9 Bayonet | Doppler (Factory New)',
    approxPrice: 900, onChain: false, iconUrl: '',
  },
  {
    slug: 'sport-gloves-vice-fn', ticker: 'SG-VICE',
    name: 'Sport Gloves | Vice (Factory New)',
    shortName: 'Sport Vice FN',
    type: 'glove', steamHashName: '★ Sport Gloves | Vice (Factory New)',
    approxPrice: 4000, onChain: false, iconUrl: '',
  },
  {
    slug: 'driver-gloves-king-snake-fn', ticker: 'DG-KS',
    name: 'Driver Gloves | King Snake (Factory New)',
    shortName: 'King Snake FN',
    type: 'glove', steamHashName: '★ Driver Gloves | King Snake (Factory New)',
    approxPrice: 2500, onChain: false, iconUrl: '',
  },

  // ── CS2 Case perps ────────────────────────────────────────────────────────
  {
    slug: 'dreams-nightmares-case', ticker: 'DN-CASE',
    name: 'Dreams & Nightmares Case',
    shortName: 'Dreams & Nightmares',
    type: 'case', steamHashName: 'Dreams & Nightmares Case',
    approxPrice: 1.50, onChain: false, iconUrl: '',
  },
  {
    slug: 'recoil-case', ticker: 'RCL-CASE',
    name: 'Recoil Case',
    shortName: 'Recoil Case',
    type: 'case', steamHashName: 'Recoil Case',
    approxPrice: 0.80, onChain: false, iconUrl: '',
  },
  {
    slug: 'revolution-case', ticker: 'REV-CASE',
    name: 'Revolution Case',
    shortName: 'Revolution Case',
    type: 'case', steamHashName: 'Revolution Case',
    approxPrice: 0.60, onChain: false, iconUrl: '',
  },
  {
    slug: 'fracture-case', ticker: 'FRAC-CASE',
    name: 'Fracture Case',
    shortName: 'Fracture Case',
    type: 'case', steamHashName: 'Fracture Case',
    approxPrice: 0.50, onChain: false, iconUrl: '',
  },
  {
    slug: 'snakebite-case', ticker: 'SB-CASE',
    name: 'Snakebite Case',
    shortName: 'Snakebite Case',
    type: 'case', steamHashName: 'Snakebite Case',
    approxPrice: 0.40, onChain: false, iconUrl: '',
  },
  {
    slug: 'chroma-2-case', ticker: 'CHR2-CASE',
    name: 'Chroma 2 Case',
    shortName: 'Chroma 2 Case',
    type: 'case', steamHashName: 'Chroma 2 Case',
    approxPrice: 3.00, onChain: false, iconUrl: '',
  },
  {
    slug: 'gamma-case', ticker: 'GAMMA-CASE',
    name: 'Gamma Case',
    shortName: 'Gamma Case',
    type: 'case', steamHashName: 'Gamma Case',
    approxPrice: 1.20, onChain: false, iconUrl: '',
  },
  {
    slug: 'spectrum-case', ticker: 'SPEC-CASE',
    name: 'Spectrum Case',
    shortName: 'Spectrum Case',
    type: 'case', steamHashName: 'Spectrum Case',
    approxPrice: 0.70, onChain: false, iconUrl: '',
  },
  {
    slug: 'prisma-2-case', ticker: 'PRS2-CASE',
    name: 'Prisma 2 Case',
    shortName: 'Prisma 2 Case',
    type: 'case', steamHashName: 'Prisma 2 Case',
    approxPrice: 0.30, onChain: false, iconUrl: '',
  },
  {
    slug: 'cs20-case', ticker: 'CS20-CASE',
    name: 'CS20 Case',
    shortName: 'CS20 Case',
    type: 'case', steamHashName: 'CS20 Case',
    approxPrice: 2.50, onChain: false, iconUrl: '',
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

const BY_SLUG = new Map(ALL_MARKETS.map(m => [m.slug, m]));

export function getMarket(slug: string): MarketDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function isValidMarket(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/** Markets grouped by type, indices first. */
export function getMarketsByType(): Record<MarketType, MarketDefinition[]> {
  const out: Record<MarketType, MarketDefinition[]> = {
    index: [], rifle: [], pistol: [], knife: [], glove: [], case: [],
  };
  for (const m of ALL_MARKETS) out[m.type].push(m);
  return out;
}

export const TYPE_LABEL: Record<MarketType, string> = {
  index: 'INDEX',
  rifle: 'RIFLE',
  pistol: 'PISTOL',
  knife: 'KNIFE',
  glove: 'GLOVE',
  case: 'CASE',
};

export const TYPE_COLOR: Record<MarketType, string> = {
  index:  '#00ff88',
  rifle:  '#f97316',
  pistol: '#a78bfa',
  knife:  '#60a5fa',
  glove:  '#f472b6',
  case:   '#facc15',
};
