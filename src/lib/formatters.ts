/**
 * Compact price formatter used across the site.
 * Always includes a $ prefix and uses standard abbreviations for large values.
 */
export function formatPrice(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '$0.00';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)        return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000)         return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
}

/** Same as formatPrice but without dollar sign — useful for chart axes. */
export function formatCompact(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)        return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000)         return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}
