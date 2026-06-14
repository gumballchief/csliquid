import { PerpsPosition } from '@/store/positionsStore';

interface Props {
  position: PerpsPosition;
  onClose?: () => void;
}

export default function PositionRow({ position, onClose }: Props) {
  const pnlPositive = position.unrealizedPnl >= 0;

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
      <td className="px-4 py-3 text-sm text-white">{position.skin.name}</td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
          position.side === 'long' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
        }`}>
          {position.side.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-mono text-gray-300">{position.size.toFixed(4)}</td>
      <td className="px-4 py-3 text-sm font-mono text-gray-300">
        ${position.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-white">
        ${position.markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-red-400">
        ${position.liquidationPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3 text-sm text-gray-300">{position.leverage}x</td>
      <td className="px-4 py-3">
        <span className={`text-sm font-mono font-semibold ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
          {pnlPositive ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
        </span>
        <span className={`text-xs ml-1 ${pnlPositive ? 'text-green-500' : 'text-red-500'}`}>
          ({pnlPositive ? '+' : ''}{position.unrealizedPnlPct.toFixed(2)}%)
        </span>
      </td>
      {onClose && (
        <td className="px-4 py-3">
          <button
            onClick={onClose}
            className="text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-2 py-0.5 rounded transition-colors"
          >
            Close
          </button>
        </td>
      )}
    </tr>
  );
}
