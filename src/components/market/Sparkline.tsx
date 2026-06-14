interface Props {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
}

export default function Sparkline({ data, positive, width = 80, height = 36 }: Props) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data.map((v, i): [number, number] => [
    pad + (i / (data.length - 1)) * (width - pad * 2),
    pad + (1 - (v - min) / range) * (height - pad * 2),
  ]);

  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const stroke = positive ? '#00ff88' : '#ff4444';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className="shrink-0">
      <polyline points={line} stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
