export interface IndexConstituent {
  hashName:     string;
  staticWeight: number;
}

export interface SkinIndexDefinition {
  id:           string;
  name:         string;
  constituents: IndexConstituent[];
}

/**
 * CS500 price methodology (DJIA-style):
 *   price = sum(median_listing_price_per_skin) / CS500_DIVISOR
 *
 * Divisor is set so that at mid-2025 market prices the index opens near $3,000.
 * The divisor is intentionally fixed (never resets) so the index is continuous.
 * When a constituent is rebalanced in the future, adjust the divisor to preserve
 * the index level on the day of the change.
 */
export const CS500_DIVISOR = 3.5;

export const INDEX_DEFINITIONS: Record<string, SkinIndexDefinition> = {
  'awp-index': {
    id:   'awp-index',
    name: 'AWP Index',
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
    id:   'ak47-index',
    name: 'AK-47 Index',
    constituents: [
      { hashName: 'AK-47 | Redline (Field-Tested)',            staticWeight: 0.20 },
      { hashName: 'AK-47 | Bloodsport (Field-Tested)',         staticWeight: 0.15 },
      { hashName: 'AK-47 | Asiimov (Field-Tested)',            staticWeight: 0.14 },
      { hashName: 'AK-47 | The Empress (Field-Tested)',        staticWeight: 0.12 },
      { hashName: 'AK-47 | Aquamarine Revenge (Field-Tested)', staticWeight: 0.10 },
      { hashName: 'AK-47 | Neon Rider (Well-Worn)',            staticWeight: 0.09 },
      { hashName: 'AK-47 | Vulcan (Field-Tested)',             staticWeight: 0.07 },
      { hashName: 'AK-47 | Case Hardened (Field-Tested)',      staticWeight: 0.06 },
      { hashName: 'AK-47 | Fire Serpent (Field-Tested)',       staticWeight: 0.04 },
      { hashName: 'AK-47 | Wild Lotus (Well-Worn)',            staticWeight: 0.03 },
    ],
  },

  'knife-index': {
    id:   'knife-index',
    name: 'Knife Index',
    constituents: [
      { hashName: '★ Karambit | Fade (Factory New)',               staticWeight: 0.16 },
      { hashName: '★ Butterfly Knife | Fade (Factory New)',        staticWeight: 0.14 },
      { hashName: '★ M9 Bayonet | Fade (Factory New)',             staticWeight: 0.13 },
      { hashName: '★ Karambit | Doppler (Factory New)',            staticWeight: 0.12 },
      { hashName: '★ Butterfly Knife | Doppler (Factory New)',     staticWeight: 0.11 },
      { hashName: '★ Bayonet | Fade (Factory New)',                staticWeight: 0.10 },
      { hashName: '★ Flip Knife | Fade (Factory New)',             staticWeight: 0.09 },
      { hashName: '★ Karambit | Tiger Tooth (Factory New)',        staticWeight: 0.07 },
      { hashName: '★ Butterfly Knife | Tiger Tooth (Factory New)', staticWeight: 0.05 },
      { hashName: '★ Skeleton Knife | Fade (Factory New)',         staticWeight: 0.03 },
    ],
  },

  'glove-index': {
    id:   'glove-index',
    name: 'Glove Index',
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

  // CS500: 25 flagship skins across all price tiers (budget → ultra-premium).
  // Index = sum(median_listing_price per skin) / CS500_DIVISOR
  // staticWeight is unused for CS500 — all skins contribute equally to the sum.
  'cs500-index': {
    id:   'cs500-index',
    name: 'CS500 Index',
    constituents: [
      // Ultra-premium tier ($900–$1500)
      { hashName: 'AWP | Dragon Lore (Factory New)',                  staticWeight: 0.04 },
      { hashName: "★ Sport Gloves | Pandora's Box (Field-Tested)",    staticWeight: 0.04 },
      { hashName: '★ Sport Gloves | Vice (Field-Tested)',             staticWeight: 0.04 },
      { hashName: '★ Karambit | Fade (Factory New)',                  staticWeight: 0.04 },
      { hashName: '★ Butterfly Knife | Fade (Factory New)',           staticWeight: 0.04 },
      // High-premium tier ($300–$900)
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
      // Budget tier ($5–$50)
      { hashName: 'AK-47 | Neon Rider (Well-Worn)',                   staticWeight: 0.04 },
      { hashName: 'AWP | Hyper Beast (Field-Tested)',                 staticWeight: 0.04 },
      { hashName: 'AWP | Asiimov (Field-Tested)',                     staticWeight: 0.04 },
      { hashName: 'AK-47 | Redline (Field-Tested)',                   staticWeight: 0.04 },
    ],
  },
};

export const INDEX_IDS = Object.keys(INDEX_DEFINITIONS);
