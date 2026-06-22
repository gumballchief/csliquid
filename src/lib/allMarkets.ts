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
    iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjMGgIXSA7FVwptelsxbxSB74oZ7v8S0Vu6b2PqZvdvHHCDeUw75y4LFoS3qykR9x5WnRmY2tIC6VOAEkA8B3R_lK7EfZE0F0qg/360fx360f',
  },
  {
    slug: 'ak47-index', ticker: 'AK47-IDX', name: 'AK-47 Index',
    shortName: 'AK-47 Index',
    type: 'index', steamHashName: null, approxPrice: 12, onChain: true,
    iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjNqgJ3KEtwYnp8j1-lz_D0ugn5S4pCEOt6StMfQ0I_LHXWWUk7sks-A6HS22kB9x4jyGwo2tIHOJLlh3iFV5GUE/360fx360f',
  },
  {
    slug: 'knife-index', ticker: 'KNIFE-IDX', name: 'Knife Index',
    shortName: 'Knife Index',
    type: 'index', steamHashName: null, approxPrice: 480, onChain: true,
    iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2avx-9ytd5lRi67gVNwsDvSwtqqc3iXZg4kCZYjReYLtRbum9XgYuvm5wbWjtgUzCn3iSsf8G81tFEeH9rw/360fx360f',
  },
  {
    slug: 'glove-index', ticker: 'GLOVE-IDX', name: 'Glove Index',
    shortName: 'Glove Index',
    type: 'index', steamHashName: null, approxPrice: 280, onChain: true,
    iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk5UvzWCL2kpn2-DFk_OKherB0H_KfG2Kv0ed4u95lRi67gVNx4T-Bw434IHyVb1QlAsd1FOUDthG4xNznMu3m4QXXg90Wzn_33C1I8G81tLaDi_rK/360fx360f',
  },
  {
    slug: 'cs500-index', ticker: 'CS500', name: 'CS500 Index',
    shortName: 'CS500 Index',
    type: 'index', steamHashName: null, approxPrice: 420, onChain: true,
    iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk4veqYaF7IfysCnWRxuF4j-B-Xxa_nBovp3Pdwtj9cC_GaAd0DZdwQu9fuhS4kNy0NePntVTbjYpCyyT_3CgY5i9j_a9cBkcCWUKV/360fx360f',
  },

  // ── Individual skin perps ─────────────────────────────────────────────────
  {
    slug: 'awp-dragon-lore-fn', ticker: 'AWP-DL',
    name: 'AWP | Dragon Lore (Factory New)',
    shortName: 'Dragon Lore FN',
    type: 'rifle', steamHashName: 'AWP | Dragon Lore (Factory New)',
    approxPrice: 10000, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk4veqYaF7IfysCnWRxuF4j-B-Xxa_nBovp3Pdwtj9cC_GaAd0DZdwQu9fuhS4kNy0NePntVTbjYpCyyT_3CgY5i9j_a9cBkcCWUKV/360fx360f',
  },
  {
    slug: 'awp-gungnir-fn', ticker: 'AWP-GNG',
    name: 'AWP | Gungnir (Factory New)',
    shortName: 'Gungnir FN',
    type: 'rifle', steamHashName: 'AWP | Gungnir (Factory New)',
    approxPrice: 3000, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf-jFk7uW-V6N4LvedB3WvzedxuPUnHnjnzUl0sWrdztitI3rDZgJzAsZ1QOFY4UPqldDgMO_l41HXit9AmTK-0H227dAsvQ/360fx360f',
  },
  {
    slug: 'awp-medusa-fn', ticker: 'AWP-MED',
    name: 'AWP | Medusa (Factory New)',
    shortName: 'Medusa FN',
    type: 'rifle', steamHashName: 'AWP | Medusa (Factory New)',
    approxPrice: 2000, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk4veqfbdsH_GEHlicyOl-pK85TC23wk12tWSGnNr6JXqRPVUnA5J5RLIKshS-l4HuYbji7lfajdgU02yg2bOcOBD3/360fx360f',
  },
  {
    slug: 'awp-asiimov-fn', ticker: 'AWP-ASI',
    name: 'AWP | Asiimov (Factory New)',
    shortName: 'Asiimov FN',
    type: 'rifle', steamHashName: 'AWP | Asiimov (Factory New)',
    approxPrice: 250, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6V-Kf2cGFidxOp_pewnF3nhxEt0sGnSzN76dH3GOg9xC8FyEORftRe-x9PuYurq71bW3d8UnjK-0H0YSTpMGQ/360fx360f',
  },
  {
    slug: 'ak47-wild-lotus-fn', ticker: 'AK-WL',
    name: 'AK-47 | Wild Lotus (Factory New)',
    shortName: 'Wild Lotus FN',
    type: 'rifle', steamHashName: 'AK-47 | Wild Lotus (Factory New)',
    approxPrice: 5000, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0P_6afVSKP-EAm6extF6ueZhW2exwkl2tmTXwt39eCiUPQR2DMN4TOVetUK8xoLgM-K341eM2otDnC6okGoXufBz_TAB/360fx360f',
  },
  {
    slug: 'ak47-gold-arabesque-fn', ticker: 'AK-GA',
    name: 'AK-47 | Gold Arabesque (Factory New)',
    shortName: 'Gold Arabesque FN',
    type: 'rifle', steamHashName: 'AK-47 | Gold Arabesque (Factory New)',
    approxPrice: 3000, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiVI0POlPPNSJ_-fCliR0-90tfJ4WiyMmRQguynLntmvICieOARzCpMhF-BYsRe-xoHvYu_g5lSNj4NDyy2viCwY6Hlu5_FCD_Q1jEqYuQ/360fx360f',
  },
  {
    slug: 'ak47-fire-serpent-fn', ticker: 'AK-FS',
    name: 'AK-47 | Fire Serpent (Factory New)',
    shortName: 'Fire Serpent FN',
    type: 'rifle', steamHashName: 'AK-47 | Fire Serpent (Factory New)',
    approxPrice: 800, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0PSneqF-JeKDC2mE_u995LZWTTuygxIYvzSCkpu3cnvFPQB2DpUkROFY4Rntw93lP7i241DbiI1BxSuviHlKunk_6-sHU71lpPMTRLyP4Q/360fx360f',
  },
  {
    slug: 'ak47-case-hardened-fn', ticker: 'AK-CH',
    name: 'AK-47 | Case Hardened (Factory New)',
    shortName: 'Case Hardened FN',
    type: 'rifle', steamHashName: 'AK-47 | Case Hardened (Factory New)',
    approxPrice: 200, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiNK0P2nZKFpH_yaCW-Ej7sk5bE8Sn-2lEpz4zndzoyvdHuUPwFzWZYiE7EK4Bi4k9TlY-y24FbAy9USGSiZd5Q/360fx360f',
  },
  {
    slug: 'm4a4-howl-fn', ticker: 'M4-HOWL',
    name: 'M4A4 | Howl (Factory New)',
    shortName: 'Howl FN',
    type: 'rifle', steamHashName: 'M4A4 | Howl (Factory New)',
    approxPrice: 3500, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6afVSKP-EAm6extF6ueZhW2exwkl2tmTXwt39eCiUPQR2DMN4TOVetUK8xoLgM-K341eM2otDnC6okGoXufBz_TAB/360fx360f',
  },
  {
    slug: 'm4a4-poseidon-fn', ticker: 'M4-POS',
    name: 'M4A4 | Poseidon (Factory New)',
    shortName: 'Poseidon FN',
    type: 'rifle', steamHashName: 'M4A4 | Poseidon (Factory New)',
    approxPrice: 600, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0OKhe6FkJP-dMWuZxuZi_uM9Sn23xkx_sG3VyNyqcnnFZgchDMYjQuMJtRHuw9PvZuPjtlCI3d9bjXKpHL2aoaM/360fx360f',
  },
  {
    slug: 'm4a1s-golden-coil-fn', ticker: 'M4S-GC',
    name: 'M4A1-S | Golden Coil (Factory New)',
    shortName: 'Golden Coil FN',
    type: 'rifle', steamHashName: 'M4A1-S | Golden Coil (Factory New)',
    approxPrice: 800, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjNqgJ3KEtwYnp8jy5kz_fhr9l4L0-DAVuaKsbvY7c_TKW2HCkbYjsbFvGCjixUR14DnVmd2udHrEaVUgWMN3QPlK7EcxjBzAaQ/360fx360f',
  },
  {
    slug: 'glock-fade-fn', ticker: 'G18-FADE',
    name: 'Glock-18 | Fade (Factory New)',
    shortName: 'Glock Fade FN',
    type: 'pistol', steamHashName: 'Glock-18 | Fade (Factory New)',
    approxPrice: 800, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1a7s2oaaBoH_yaCW-Ej-8u5bZvHnq1w0Vz62TUzNj4eCiVblMmXMAkROJeskLpkdXjMrzksVTAy9US8PY25So/360fx360f',
  },
  {
    slug: 'desert-eagle-blaze-fn', ticker: 'DEAGLE-BLZ',
    name: 'Desert Eagle | Blaze (Factory New)',
    shortName: 'Blaze FN',
    type: 'pistol', steamHashName: 'Desert Eagle | Blaze (Factory New)',
    approxPrice: 600, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7vORbqhsLfWAMWuZxuZi_uI_TX6wxxkjsGXXnImsJ37COlUoWcByEOMOtxa5kdXmNu3htVPZjN1bjXKpHL2aoaM/360fx360f',
  },
  {
    slug: 'usp-kill-confirmed-fn', ticker: 'USP-KC',
    name: 'USP-S | Kill Confirmed (Factory New)',
    shortName: 'Kill Confirmed FN',
    type: 'pistol', steamHashName: 'USP-S | Kill Confirmed (Factory New)',
    approxPrice: 500, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai0ki7VeTHjMauO3-Y6wQlpd-7-VDgfgTwh6nm8itXoaf_PKA7dPKQWDDFl7pytrlsF33mzE9xtW3Tno6gcSiWPQYkX5Z4Q7UU8k7vhnuoasg/360fx360f',
  },
  {
    slug: 'karambit-doppler-p2-fn', ticker: 'KARA-DP2',
    name: 'Karambit | Doppler Phase 2 (Factory New)',
    shortName: 'Kara Doppler P2 FN',
    type: 'knife', steamHashName: '★ Karambit | Doppler (Factory New)',
    approxPrice: 2000, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SA1iUzv5mvOR7cDm7lA4i4gKJk4jxNWXFb1cpDJR2FOFbsBTql9bjYbzq7gPZiN1MxH7_2ytNuCdpte1UB_Ui5OSJ2GbkVqni/360fx360f',
  },
  {
    slug: 'karambit-fade-fn', ticker: 'KARA-FD',
    name: 'Karambit | Fade (Factory New)',
    shortName: 'Kara Fade FN',
    type: 'knife', steamHashName: '★ Karambit | Fade (Factory New)',
    approxPrice: 1800, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Q7uCvZaZkNM-SD1iWwOpzj-1gSCGn20tztm_UyIn_JHKUbgYlWMcmQ-ZcskSwldS0MOnntAfd3YlMzH35jntXrnE8SOGRGG8/360fx360f',
  },
  {
    slug: 'butterfly-doppler-p1-fn', ticker: 'BFLY-DP1',
    name: 'Butterfly Knife | Doppler Phase 1 (Factory New)',
    shortName: 'Butterfly Doppler P1 FN',
    type: 'knife', steamHashName: '★ Butterfly Knife | Doppler (Factory New)',
    approxPrice: 1200, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Z-ua6bbZrLOmsD2qvxeFmoO1sXRajnRw0tm-6mLD1KCzPKhh2DMckEeYNshC6koe1Munq5AbbitgTyyX6jixL7i5qteYLA6Mh-vWGkUifZkSF3e67/360fx360f',
  },
  {
    slug: 'm9-bayonet-doppler-fn', ticker: 'M9-DP',
    name: 'M9 Bayonet | Doppler (Factory New)',
    shortName: 'M9 Doppler FN',
    type: 'knife', steamHashName: '★ M9 Bayonet | Doppler (Factory New)',
    approxPrice: 900, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL6kJ_m-B1Wts2sab1iLvWHMWad_up5oPFlSjuMhRUmoDjUpYPwJiPTcA8nCcZ1EOcDu0Lum9CzZO6w4Fbeg4wQxX392ykb6yc4troKAPIm-6fJz1aWPFsIQnE/360fx360f',
  },
  {
    slug: 'sport-gloves-vice-fn', ticker: 'SG-VICE',
    name: 'Sport Gloves | Vice (Factory New)',
    shortName: 'Sport Vice FN',
    type: 'glove', steamHashName: '★ Sport Gloves | Vice (Factory New)',
    approxPrice: 4000, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk5UvzWCL2kpn2-DFk_OKherB0H_KfG2Kv0ed4u95lRi67gVNx4T-Bw434IHyVb1QlAsd1FOUDthG4xNznMu3m4QXXg90Wzn_33C1I8G81tLaDi_rK/360fx360f',
  },
  {
    slug: 'driver-gloves-king-snake-fn', ticker: 'DG-KS',
    name: 'Driver Gloves | King Snake (Factory New)',
    shortName: 'King Snake FN',
    type: 'glove', steamHashName: '★ Driver Gloves | King Snake (Factory New)',
    approxPrice: 2500, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5T441rsfhr9kYDl7h1I4_utY5t-LvGYC3SbyOBJp-lgWyyMmRQguynLz4r6Iy7EbFchApNyR-dbtEbuw4XkN7jq7gHdjtoQzi37hiwYvytvt_FCD_Ql24JgJg/360fx360f',
  },

  // ── CS2 Case perps ────────────────────────────────────────────────────────
  {
    slug: 'dreams-nightmares-case', ticker: 'DN-CASE',
    name: 'Dreams & Nightmares Case',
    shortName: 'Dreams & Nightmares',
    type: 'case', steamHashName: 'Dreams & Nightmares Case',
    approxPrice: 1.50, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frnIV7Kb5OaU-JqfHDzXFle0u4LY8Gy_kkRgisGzcm4v4J3vDOAQmDMdyRvlK7EcmeCU3yw/360fx360f',
  },
  {
    slug: 'recoil-case', ticker: 'RCL-CASE',
    name: 'Recoil Case',
    shortName: 'Recoil Case',
    type: 'case', steamHashName: 'Recoil Case',
    approxPrice: 0.80, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frnMVu6b-avA-JqSSCjSWwuhz47U9TCzlxh9yt2WGnNqgIi-fbgUkWMNxFPlK7EdIJF6a2Q/360fx360f',
  },
  {
    slug: 'revolution-case', ticker: 'REV-CASE',
    name: 'Revolution Case',
    shortName: 'Revolution Case',
    type: 'case', steamHashName: 'Revolution Case',
    approxPrice: 0.60, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frnAVvfb6aqduc_TFVjTCxbx05OU4S3jilE9w4DzRnImtIy2Sa1JzDJEhRPlK7EcO4U8gfA/360fx360f',
  },
  {
    slug: 'fracture-case', ticker: 'FRAC-CASE',
    name: 'Fracture Case',
    shortName: 'Fracture Case',
    type: 'case', steamHashName: 'Fracture Case',
    approxPrice: 0.50, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fr3QV7aD7OP01IfbGDzPCmbsm4LU5GnvkzUsi4WvUmIqtci_CPQNyApsjE_lK7EfrhW545A/360fx360f',
  },
  {
    slug: 'snakebite-case', ticker: 'SB-CASE',
    name: 'Snakebite Case',
    shortName: 'Snakebite Case',
    type: 'case', steamHashName: 'Snakebite Case',
    approxPrice: 0.40, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fr3oVvvT4bfI4dvTLCGTCmLl16ec7TX_mk08k42iHwtqscy-WPVUmCZJ4R_lK7Ed8Q6OYtw/360fx360f',
  },
  {
    slug: 'chroma-2-case', ticker: 'CHR2-CASE',
    name: 'Chroma 2 Case',
    shortName: 'Chroma 2 Case',
    type: 'case', steamHashName: 'Chroma 2 Case',
    approxPrice: 3.00, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fqmwOuKD2PqI6caDBWDeUkO8uteM9SnDglklw6miEn9j6IHKfblNxA5pxW6dU5UH4LtBe/360fx360f',
  },
  {
    slug: 'gamma-case', ticker: 'GAMMA-CASE',
    name: 'Gamma Case',
    shortName: 'Gamma Case',
    type: 'case', steamHashName: 'Gamma Case',
    approxPrice: 1.20, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frHEVtvP5bPZrd6XECmOSxe0v4bRoTnnjwBkitWrRm4yoeX3GagMnCZZ2FPlK7EcEv22BnQ/360fx360f',
  },
  {
    slug: 'spectrum-case', ticker: 'SPEC-CASE',
    name: 'Spectrum Case',
    shortName: 'Spectrum Case',
    type: 'case', steamHashName: 'Spectrum Case',
    approxPrice: 0.70, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frHQV7qCra_JscqPGCzLCl78ktuAxHSzmzUh_sjvWzdqoI33CaQF2DscjR_lK7EeF3oM7TA/360fx360f',
  },
  {
    slug: 'prisma-2-case', ticker: 'PRS2-CASE',
    name: 'Prisma 2 Case',
    shortName: 'Prisma 2 Case',
    type: 'case', steamHashName: 'Prisma 2 Case',
    approxPrice: 0.30, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fr3cV6vT9avBvefWWDDGTxbZ14rhsTX7qkE90sDiHwt2pdC-TblJ2DsB1QPlK7Ee9riHKAA/360fx360f',
  },
  {
    slug: 'cs20-case', ticker: 'CS20-CASE',
    name: 'CS20 Case',
    shortName: 'CS20 Case',
    type: 'case', steamHashName: 'CS20 Case',
    approxPrice: 2.50, onChain: false, iconUrl: 'https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fr3YVvfD9aqVveKaQDDKSl7134bg_HH3hlBty6z7Vn9v6eXmeZgBxWJd0EflK7Efs4hZiKQ/360fx360f',
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
