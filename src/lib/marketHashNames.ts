/**
 * Maps internal skin IDs to their Steam Community Market hash names.
 * Knives require the ★ prefix. Wear is appended in parentheses.
 *
 * Used by /api/skin-price to build the Steam + CSFloat request URLs.
 */
export const MARKET_HASH_NAMES: Record<string, string> = {
  'ak47-redline':         'AK-47 | Redline (Field-Tested)',
  'ak47-wild-lotus':      'AK-47 | Wild Lotus (Factory New)',
  'awp-dragon-lore':      'AWP | Dragon Lore (Factory New)',
  'm4a4-howl':            'M4A4 | Howl (Minimal Wear)',
  'karambit-fade':        '★ Karambit | Fade (Factory New)',
  'butterfly-knife-fade': '★ Butterfly Knife | Fade (Factory New)',
  'glock-fade':           'Glock-18 | Fade (Factory New)',
  'deagle-blaze':         'Desert Eagle | Blaze (Factory New)',
};

export type KnownSkinId = keyof typeof MARKET_HASH_NAMES;

export function getHashName(skinId: string): string | undefined {
  return MARKET_HASH_NAMES[skinId];
}
