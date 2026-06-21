/**
 * Maps internal skin IDs to their Steam Community Market hash names.
 * Knives require the ★ prefix. Wear is appended in parentheses.
 *
 * Used by /api/skin-price to build the Steam + CSFloat request URLs.
 */
export const MARKET_HASH_NAMES: Record<string, string> = {
  // Legacy IDs (kept for backwards compat)
  'ak47-redline':         'AK-47 | Redline (Field-Tested)',
  'ak47-wild-lotus':      'AK-47 | Wild Lotus (Factory New)',
  'awp-dragon-lore':      'AWP | Dragon Lore (Factory New)',
  'm4a4-howl':            'M4A4 | Howl (Minimal Wear)',
  'karambit-fade':        '★ Karambit | Fade (Factory New)',
  'butterfly-knife-fade': '★ Butterfly Knife | Fade (Factory New)',
  'glock-fade':           'Glock-18 | Fade (Factory New)',
  'deagle-blaze':         'Desert Eagle | Blaze (Factory New)',

  // Individual AWP perps
  'awp-dragon-lore-fn':   'AWP | Dragon Lore (Factory New)',
  'awp-gungnir-fn':       'AWP | Gungnir (Factory New)',
  'awp-medusa-fn':        'AWP | Medusa (Factory New)',
  'awp-asiimov-fn':       'AWP | Asiimov (Factory New)',

  // Individual AK-47 perps
  'ak47-wild-lotus-fn':     'AK-47 | Wild Lotus (Factory New)',
  'ak47-gold-arabesque-fn': 'AK-47 | Gold Arabesque (Factory New)',
  'ak47-fire-serpent-fn':   'AK-47 | Fire Serpent (Factory New)',
  'ak47-case-hardened-fn':  'AK-47 | Case Hardened (Factory New)',

  // Individual rifle perps (M4/M4A1-S)
  'm4a4-howl-fn':       'M4A4 | Howl (Factory New)',
  'm4a4-poseidon-fn':   'M4A4 | Poseidon (Factory New)',
  'm4a1s-golden-coil-fn': 'M4A1-S | Golden Coil (Factory New)',

  // Pistol perps
  'glock-fade-fn':          'Glock-18 | Fade (Factory New)',
  'desert-eagle-blaze-fn':  'Desert Eagle | Blaze (Factory New)',
  'usp-kill-confirmed-fn':  'USP-S | Kill Confirmed (Factory New)',

  // Knife perps
  'karambit-doppler-p2-fn':  '★ Karambit | Doppler (Factory New)',
  'karambit-fade-fn':        '★ Karambit | Fade (Factory New)',
  'butterfly-doppler-p1-fn': '★ Butterfly Knife | Doppler (Factory New)',
  'm9-bayonet-doppler-fn':   '★ M9 Bayonet | Doppler (Factory New)',

  // Glove perps
  'sport-gloves-vice-fn':         '★ Sport Gloves | Vice (Factory New)',
  'driver-gloves-king-snake-fn':  '★ Driver Gloves | King Snake (Factory New)',

  // CS2 Case perps
  'dreams-nightmares-case': 'Dreams & Nightmares Case',
  'recoil-case':            'Recoil Case',
  'revolution-case':        'Revolution Case',
  'fracture-case':          'Fracture Case',
  'snakebite-case':         'Snakebite Case',
  'chroma-2-case':          'Chroma 2 Case',
  'gamma-case':             'Gamma Case',
  'spectrum-case':          'Spectrum Case',
  'prisma-2-case':          'Prisma 2 Case',
  'cs20-case':              'CS20 Case',
};

export type KnownSkinId = keyof typeof MARKET_HASH_NAMES;

export function getHashName(skinId: string): string | undefined {
  return MARKET_HASH_NAMES[skinId];
}
