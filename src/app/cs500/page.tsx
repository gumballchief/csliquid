'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

const TOTAL_BASKET_SIZE = 500;

type SortKey = 'az' | 'category';

interface Skin { id: number; name: string; category: string; }

const ALL_SKINS: Skin[] = [
  { id:  1, name: 'AWP Dragon Lore FN',                   category: 'Sniper Rifle' },
  { id:  2, name: 'Karambit Fade FN',                     category: 'Knife'        },
  { id:  3, name: 'M9 Bayonet Doppler FN',                category: 'Knife'        },
  { id:  4, name: 'AK-47 Wild Lotus FN',                  category: 'Rifle'        },
  { id:  5, name: 'Sport Gloves Crimson Kimono FT',       category: 'Gloves'       },
  { id:  6, name: 'AWP Medusa FN',                        category: 'Sniper Rifle' },
  { id:  7, name: 'Butterfly Knife Fade FN',              category: 'Knife'        },
  { id:  8, name: 'AWP Gungnir FN',                       category: 'Sniper Rifle' },
  { id:  9, name: 'StatTrak AK-47 Fire Serpent FT',       category: 'Rifle'        },
  { id: 10, name: 'M4A4 Howl FT',                         category: 'Rifle'        },
  { id: 11, name: 'Karambit Marble Fade FN',              category: 'Knife'        },
  { id: 12, name: 'Butterfly Knife Marble Fade FN',       category: 'Knife'        },
  { id: 13, name: 'AWP Fade FN',                          category: 'Sniper Rifle' },
  { id: 14, name: 'AK-47 Blue Gem FT',                    category: 'Rifle'        },
  { id: 15, name: 'StatTrak AWP Asiimov FT',              category: 'Sniper Rifle' },
  { id: 16, name: 'Bayonet Fade FN',                      category: 'Knife'        },
  { id: 17, name: 'M4A1-S Immovable Object FN',           category: 'Rifle'        },
  { id: 18, name: 'Sport Gloves Vice FT',                 category: 'Gloves'       },
  { id: 19, name: 'Karambit Autotronic FN',               category: 'Knife'        },
  { id: 20, name: 'AK-47 Panthera Onca FN',              category: 'Rifle'        },
  { id: 21, name: 'AWP Desert Hydra FN',                  category: 'Sniper Rifle' },
  { id: 22, name: 'Glock-18 Fade FN',                     category: 'Pistol'       },
  { id: 23, name: 'Bayonet Lore FN',                      category: 'Knife'        },
  { id: 24, name: 'Butterfly Knife Autotronic FN',        category: 'Knife'        },
  { id: 25, name: 'M4A4 Poseidon FN',                     category: 'Rifle'        },
  { id: 26, name: 'AWP Containment Breach FN',            category: 'Sniper Rifle' },
  { id: 27, name: 'Specialist Gloves Crimson Kimono FT',  category: 'Gloves'       },
  { id: 28, name: 'M4A1-S Knight FN',                     category: 'Rifle'        },
  { id: 29, name: 'Karambit Tiger Tooth FN',              category: 'Knife'        },
  { id: 30, name: 'StatTrak Desert Eagle Blaze FN',       category: 'Pistol'       },
  { id: 31, name: 'Flip Knife Fade FN',                   category: 'Knife'        },
  { id: 32, name: 'AK-47 Bloodsport FN',                 category: 'Rifle'        },
  { id: 33, name: 'M9 Bayonet Lore FN',                   category: 'Knife'        },
  { id: 34, name: 'AWP Fever Dream FN',                   category: 'Sniper Rifle' },
  { id: 35, name: 'StatTrak AK-47 Vulcan FN',             category: 'Rifle'        },
  { id: 36, name: 'Butterfly Knife Damascus Steel FN',    category: 'Knife'        },
  { id: 37, name: 'USP-S Printstream FN',                 category: 'Pistol'       },
  { id: 38, name: 'AK-47 Gold Arabesque FN',             category: 'Rifle'        },
  { id: 39, name: 'M4A1-S Printstream FN',               category: 'Rifle'        },
  { id: 40, name: 'StatTrak AWP Lightning Strike FN',     category: 'Sniper Rifle' },
  { id: 41, name: 'Moto Gloves Slaughter FT',            category: 'Gloves'       },
  { id: 42, name: 'AK-47 Redline FT',                    category: 'Rifle'        },
  { id: 43, name: 'StatTrak M4A4 Asiimov FT',            category: 'Rifle'        },
  { id: 44, name: 'AWP Asiimov FN',                      category: 'Sniper Rifle' },
  { id: 45, name: 'Glock-18 Water Elemental FN',         category: 'Pistol'       },
  { id: 46, name: 'Desert Eagle Hand Cannon FN',         category: 'Pistol'       },
  { id: 47, name: 'M4A1-S Hyper Beast FN',               category: 'Rifle'        },
  { id: 48, name: 'AK-47 Neon Rider FN',                 category: 'Rifle'        },
  { id: 49, name: 'AWP Electric Hive FN',                category: 'Sniper Rifle' },
  { id: 50, name: 'P250 Asiimov FN',                     category: 'Pistol'       },
];

const CATEGORY_STYLE: Record<string, string> = {
  'Sniper Rifle': 'text-tx-green  bg-tx-green/10  border-tx-green/20',
  'Rifle':        'text-tx-muted  bg-tx-raised    border-tx-border',
  'Knife':        'text-tx-muted  bg-tx-raised    border-tx-border',
  'Gloves':       'text-tx-muted  bg-tx-raised    border-tx-border',
  'Pistol':       'text-tx-dim    bg-tx-raised    border-tx-border',
};

function CategoryBadge({ cat }: { cat: string }) {
  const cls = CATEGORY_STYLE[cat] ?? 'text-tx-dim bg-tx-raised border-tx-border';
  return (
    <span className={`inline-block font-mono text-[9px] px-2 py-0.5 border ${cls}`}>
      {cat}
    </span>
  );
}

export default function CS500Page() {
  const [query, setQuery] = useState('');
  const [sort,  setSort]  = useState<SortKey>('az');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const result = q
      ? ALL_SKINS.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      : [...ALL_SKINS];
    if (sort === 'az') result.sort((a, b) => a.name.localeCompare(b.name));
    else result.sort((a, b) => a.category.localeCompare(b.category));
    return result;
  }, [query, sort]);

  return (
    <main className="min-h-screen bg-tx-bg px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">

        <Link href="/trade"
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-tx-dim hover:text-tx-muted transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Markets
        </Link>

        {/* Header */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold text-tx-green uppercase tracking-[0.15em] border border-tx-green/30 bg-tx-green/10 px-2.5 py-1">
              Live Index
            </span>
            <span className="font-mono text-[9px] font-bold text-tx-muted uppercase tracking-[0.15em] border border-tx-border bg-tx-raised px-2.5 py-1">
              On CSLIQUID
            </span>
          </div>
          <h1 className="font-mono text-4xl sm:text-5xl font-black text-tx-text tracking-tight">
            CS<span className="text-tx-green">500</span> INDEX
          </h1>
          <p className="font-mono text-[13px] text-tx-muted tracking-wide">The CS2 Skin Market Index</p>
          <div className="h-px bg-tx-border mt-3" />
        </section>

        {/* Snapshot stats */}
        <section className="grid grid-cols-3 gap-px bg-tx-border rounded overflow-hidden">
          {[
            { label: 'Basket Size', value: '500 skins', sub: 'tracked live'       },
            { label: 'Top Holding', value: '—',         sub: 'AWP Dragon Lore FN' },
            { label: 'Avg Price',   value: '—',         sub: 'volume-weighted'    },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-tx-surface px-4 py-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-tx-dim mb-1">{label}</p>
              <p className="font-mono text-[16px] font-bold text-tx-text tabular-nums">{value}</p>
              <p className="font-mono text-[9px] text-tx-dim mt-0.5">{sub}</p>
            </div>
          ))}
        </section>

        {/* What is CS500 */}
        <section className="space-y-3">
          <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">What is CS500?</h2>
          <div className="bg-tx-surface border border-tx-border rounded p-5 space-y-3">
            <p className="text-[11px] font-mono text-tx-muted leading-relaxed">
              The <span className="font-bold text-tx-text">CS500</span> is analogous to the S&amp;P 500, but for CS2 skins.
              It tracks the combined market value of the top 500 best-selling CS2 skins on{' '}
              <span className="text-tx-green">CSFloat</span> and{' '}
              <span className="text-tx-green">Skinport</span> — the largest CS skin marketplaces.
            </p>
            <p className="text-[11px] font-mono text-tx-dim leading-relaxed">
              Rather than trading individual skins, the CS500 gives you exposure to the{' '}
              <span className="text-tx-text">entire CS2 skin market</span> in a single tradeable perpetual market on CSLIQUID.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/trade"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-tx-green text-tx-bg text-[10px] font-mono font-bold uppercase tracking-wider rounded-sm hover:bg-[#00e87a] transition-colors active:scale-[0.98]">
                Trade CS500-PERP
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link href="/docs#oracle"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-tx-border text-tx-muted hover:text-tx-text hover:border-tx-border2 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors">
                Oracle docs →
              </Link>
            </div>
          </div>
        </section>

        {/* Methodology */}
        <section className="space-y-3">
          <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">Methodology</h2>
          <div className="bg-tx-surface border border-tx-border rounded p-5">
            <ul className="space-y-2.5">
              {[
                'Fixed basket of 500 skins selected by volume and liquidity rankings from CSFloat and Skinport.',
                'Index value = volume-weighted average price (VWAP) across all 500 skins.',
                'Prices fetched from CSFloat and Skinport APIs every 60 seconds. Outliers beyond 2 standard deviations are rejected before averaging.',
                'Periodic rebalancing: skins may be swapped in or out based on updated volume rankings. Rebalances are announced 48 hours in advance.',
                'Float value and wear tier are normalised — only skin name and type is used for basket membership.',
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="font-mono text-tx-green text-[10px] mt-0.5 shrink-0">▸</span>
                  <span className="text-[11px] font-mono text-tx-dim leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* All 500 Skins */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] font-bold text-tx-green uppercase tracking-[0.15em]">All 500 Skins</h2>
            <span className="font-mono text-[9px] text-tx-dim">
              Showing {filtered.length} of {TOTAL_BASKET_SIZE}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tx-dim pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search skins or categories..."
                className="w-full bg-tx-surface border border-tx-border rounded-sm pl-8 pr-4 py-2 font-mono text-[11px] text-tx-text placeholder-tx-dim focus:outline-none focus:border-tx-border2 transition-colors"
              />
              {query && (
                <button onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-dim hover:text-tx-muted transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="bg-tx-surface border border-tx-border rounded-sm px-3 py-2 font-mono text-[11px] text-tx-muted focus:outline-none focus:border-tx-border2 transition-colors cursor-pointer"
            >
              <option value="az">A → Z</option>
              <option value="category">By Category</option>
            </select>
          </div>

          <div className="bg-tx-surface border border-tx-border rounded overflow-hidden">
            <div className="grid grid-cols-[48px_1fr_140px] gap-x-4 px-4 py-2.5 border-b border-tx-border">
              {[['#', 'text-center'], ['SKIN', ''], ['CATEGORY', '']].map(([label, cls]) => (
                <span key={label} className={`font-mono text-[9px] uppercase tracking-[0.1em] text-tx-dim ${cls}`}>{label}</span>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-mono text-[11px] text-tx-dim">No skins match &quot;{query}&quot;</p>
              </div>
            ) : (
              <div className="divide-y divide-tx-border/40">
                {filtered.map((skin, idx) => (
                  <div
                    key={skin.id}
                    className={`grid grid-cols-[48px_1fr_140px] gap-x-4 px-4 py-2.5 items-center hover:bg-tx-raised transition-colors ${
                      idx % 2 === 1 ? 'bg-[#0f1012]' : ''
                    }`}
                  >
                    <span className="font-mono text-[10px] text-tx-dim text-center tabular-nums">{skin.id}</span>
                    <span className="font-mono text-[11px] text-tx-muted truncate pr-2">{skin.name}</span>
                    <div><CategoryBadge cat={skin.category} /></div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-2.5 border-t border-tx-border flex items-center justify-between">
              <span className="font-mono text-[9px] text-tx-dim">Basket composition sourced from CSFloat &amp; Skinport</span>
              <span className="font-mono text-[9px] text-tx-dim">{filtered.length}/{TOTAL_BASKET_SIZE} skins</span>
            </div>
          </div>
        </section>

        {/* Footer note */}
        <section className="bg-tx-surface border border-tx-border rounded px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-[10px] text-tx-muted">
              The CS500 Index is a synthetic price feed — no actual skins are held or transferred.
            </p>
            <p className="font-mono text-[9px] text-tx-dim">
              Trading the CS500-PERP on CSLIQUID is purely financial exposure, not ownership.
            </p>
          </div>
          <Link href="/trade"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-tx-green text-tx-bg text-[10px] font-mono font-bold uppercase tracking-wider rounded-sm hover:bg-[#00e87a] transition-colors whitespace-nowrap active:scale-[0.98]">
            Trade CS500-PERP →
          </Link>
        </section>

      </div>
    </main>
  );
}
