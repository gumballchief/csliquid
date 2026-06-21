/**
 * Skin index definitions.
 *
 * Each index tracks the volume-weighted average price (VWAP) of the 10
 * most liquid skins in its category. Static weights are used as fallback when
 * Steam returns volume = 0; they approximate known relative trading activity.
 *
 * Steam Community Market hash names must be exact (including ★ prefix for
 * knives and gloves, and the wear condition in parentheses).
 */

export interface IndexConstituent {
  /** Exact Steam Community Market hash name. */
  hashName: string;
  /** Fallback weight when live volume is unavailable (all weights sum to 1.0). */
  staticWeight: number;
}

export interface SkinIndexDefinition {
  id: string;
  name: string;
  /** Matches the `weapon` field on the corresponding Skin object. */
  weapon: string;
  description: string;
  constituents: IndexConstituent[];
}

export const INDEX_DEFINITIONS: Record<string, SkinIndexDefinition> = {
  'awp-index': {
    id:          'awp-index',
    name:        'AWP Index',
    weapon:      'AWP',
    description: 'Volume-weighted average of the 10 most-traded AWP skins',
    constituents: [
      { hashName: 'AWP | Asiimov (Field-Tested)',         staticWeight: 0.18 },
      { hashName: 'AWP | Fever Dream (Field-Tested)',     staticWeight: 0.16 },
      { hashName: 'AWP | Atheris (Field-Tested)',         staticWeight: 0.14 },
      { hashName: 'AWP | Hyper Beast (Field-Tested)',     staticWeight: 0.12 },
      { hashName: 'AWP | Neo-Noir (Field-Tested)',        staticWeight: 0.11 },
      { hashName: 'AWP | Wildfire (Field-Tested)',        staticWeight: 0.09 },
      { hashName: 'AWP | Oni Taiji (Field-Tested)',       staticWeight: 0.07 },
      { hashName: 'AWP | Medusa (Field-Tested)',          staticWeight: 0.05 },
      { hashName: 'AWP | Lightning Strike (Factory New)', staticWeight: 0.05 },
      { hashName: 'AWP | Dragon Lore (Factory New)',      staticWeight: 0.03 },
    ],
  },

  'ak47-index': {
    id:          'ak47-index',
    name:        'AK-47 Index',
    weapon:      'AK-47',
    description: 'Volume-weighted average of the 10 most-traded AK-47 skins',
    constituents: [
      { hashName: 'AK-47 | Redline (Field-Tested)',              staticWeight: 0.20 },
      { hashName: 'AK-47 | Bloodsport (Field-Tested)',           staticWeight: 0.15 },
      { hashName: 'AK-47 | Asiimov (Field-Tested)',              staticWeight: 0.14 },
      { hashName: 'AK-47 | The Empress (Field-Tested)',          staticWeight: 0.12 },
      { hashName: 'AK-47 | Aquamarine Revenge (Field-Tested)',   staticWeight: 0.10 },
      { hashName: 'AK-47 | Neon Rider (Well-Worn)',              staticWeight: 0.09 },
      { hashName: 'AK-47 | Vulcan (Field-Tested)',               staticWeight: 0.07 },
      { hashName: 'AK-47 | Case Hardened (Field-Tested)',        staticWeight: 0.06 },
      { hashName: 'AK-47 | Fire Serpent (Field-Tested)',         staticWeight: 0.04 },
      { hashName: 'AK-47 | Wild Lotus (Well-Worn)',              staticWeight: 0.03 },
    ],
  },

  'knife-index': {
    id:          'knife-index',
    name:        'Knife Index',
    weapon:      'Knife',
    description: 'Volume-weighted average of the 10 most-traded knife skins',
    constituents: [
      { hashName: '★ Karambit | Fade (Factory New)',                staticWeight: 0.16 },
      { hashName: '★ Butterfly Knife | Fade (Factory New)',         staticWeight: 0.14 },
      { hashName: '★ M9 Bayonet | Fade (Factory New)',              staticWeight: 0.13 },
      { hashName: '★ Karambit | Doppler (Factory New)',             staticWeight: 0.12 },
      { hashName: '★ Butterfly Knife | Doppler (Factory New)',      staticWeight: 0.11 },
      { hashName: '★ Bayonet | Fade (Factory New)',                 staticWeight: 0.10 },
      { hashName: '★ Flip Knife | Fade (Factory New)',              staticWeight: 0.09 },
      { hashName: '★ Karambit | Tiger Tooth (Factory New)',         staticWeight: 0.07 },
      { hashName: '★ Butterfly Knife | Tiger Tooth (Factory New)', staticWeight: 0.05 },
      { hashName: '★ Skeleton Knife | Fade (Factory New)',          staticWeight: 0.03 },
    ],
  },

  'glove-index': {
    id:          'glove-index',
    name:        'Glove Index',
    weapon:      'Glove',
    description: 'Volume-weighted average of the 10 most-traded glove skins',
    constituents: [
      { hashName: "★ Sport Gloves | Pandora's Box (Field-Tested)",    staticWeight: 0.16 },
      { hashName: '★ Sport Gloves | Vice (Field-Tested)',             staticWeight: 0.14 },
      { hashName: '★ Specialist Gloves | Crimson Kimono (Well-Worn)', staticWeight: 0.13 },
      { hashName: '★ Driver Gloves | King Snake (Field-Tested)',      staticWeight: 0.12 },
      { hashName: '★ Hand Wraps | Cobalt Skulls (Field-Tested)',      staticWeight: 0.11 },
      { hashName: '★ Moto Gloves | Spearmint (Field-Tested)',         staticWeight: 0.10 },
      { hashName: '★ Sport Gloves | Amphibious (Well-Worn)',          staticWeight: 0.09 },
      { hashName: '★ Hydra Gloves | Case Hardened (Well-Worn)',       staticWeight: 0.07 },
      { hashName: '★ Bloodhound Gloves | Charred (Well-Worn)',        staticWeight: 0.05 },
      { hashName: '★ Specialist Gloves | Lt. Commander (Well-Worn)',  staticWeight: 0.03 },
    ],
  },

  // CS500: 25 flagship skins spanning all price tiers (budget → ultra-premium).
  // Index methodology: sum(median_listing_price per skin) / CS500_DIVISOR (DJIA-style).
  // Divisor set so the index opens near $3,000 at mid-2025 market prices.
  'cs500-index': {
    id:          'cs500-index',
    name:        'CS500 Index',
    weapon:      'CS500',
    description: 'Price-weighted index of 25 flagship CS2 skins spanning all tiers. Calculated as sum(median listing price per skin) / 3.5 — analogous to the Dow Jones methodology. Target range $2,000–$5,000.',
    constituents: [
      // Ultra-premium ($900–$1,500)
      { hashName: 'AWP | Dragon Lore (Factory New)',                  staticWeight: 0.04 },
      { hashName: "★ Sport Gloves | Pandora's Box (Field-Tested)",    staticWeight: 0.04 },
      { hashName: '★ Sport Gloves | Vice (Field-Tested)',             staticWeight: 0.04 },
      { hashName: '★ Karambit | Fade (Factory New)',                  staticWeight: 0.04 },
      { hashName: '★ Butterfly Knife | Fade (Factory New)',           staticWeight: 0.04 },
      // High-premium ($300–$900)
      { hashName: '★ M9 Bayonet | Fade (Factory New)',                staticWeight: 0.04 },
      { hashName: '★ Karambit | Doppler (Factory New)',               staticWeight: 0.04 },
      { hashName: '★ Specialist Gloves | Crimson Kimono (Well-Worn)', staticWeight: 0.04 },
      { hashName: '★ Butterfly Knife | Doppler (Factory New)',        staticWeight: 0.04 },
      { hashName: '★ Hand Wraps | Cobalt Skulls (Field-Tested)',      staticWeight: 0.04 },
      { hashName: '★ Karambit | Tiger Tooth (Factory New)',           staticWeight: 0.04 },
      { hashName: '★ Bayonet | Fade (Factory New)',                   staticWeight: 0.04 },
      { hashName: '★ Driver Gloves | King Snake (Field-Tested)',      staticWeight: 0.04 },
      { hashName: '★ Flip Knife | Fade (Factory New)',                staticWeight: 0.04 },
      { hashName: '★ Moto Gloves | Spearmint (Field-Tested)',         staticWeight: 0.04 },
      // Mid-tier ($50–$300)
      { hashName: 'AK-47 | Wild Lotus (Well-Worn)',                   staticWeight: 0.04 },
      { hashName: 'AK-47 | Fire Serpent (Field-Tested)',              staticWeight: 0.04 },
      { hashName: 'AWP | Lightning Strike (Factory New)',             staticWeight: 0.04 },
      { hashName: 'AWP | Medusa (Field-Tested)',                      staticWeight: 0.04 },
      { hashName: 'AK-47 | Vulcan (Field-Tested)',                    staticWeight: 0.04 },
      { hashName: 'AK-47 | Case Hardened (Field-Tested)',             staticWeight: 0.04 },
      // Budget ($5–$50)
      { hashName: 'AK-47 | Neon Rider (Well-Worn)',                   staticWeight: 0.04 },
      { hashName: 'AWP | Hyper Beast (Field-Tested)',                 staticWeight: 0.04 },
      { hashName: 'AWP | Asiimov (Field-Tested)',                     staticWeight: 0.04 },
      { hashName: 'AK-47 | Redline (Field-Tested)',                   staticWeight: 0.04 },
    ],
  },
};

export const INDEX_IDS = Object.keys(INDEX_DEFINITIONS);

export function isIndexId(id: string): boolean {
  return id in INDEX_DEFINITIONS;
}
