'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

interface Props {
  skinName: string;
  markPrice: number;
}

const LEVERAGES = [1, 2, 3, 5, 10, 20];

export default function TradePanel({ skinName, markPrice }: Props) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [leverage, setLeverage] = useState(5);
  const [size, setSize] = useState('');
  const [limitPrice, setLimitPrice] = useState('');

  const sizeNum = parseFloat(size) || 0;
  const priceNum = orderType === 'market' ? markPrice : (parseFloat(limitPrice) || markPrice);
  const notional = sizeNum * priceNum;
  const margin = notional / leverage;
  const liqPrice = side === 'long'
    ? priceNum * (1 - 1 / leverage * 0.9)
    : priceNum * (1 + 1 / leverage * 0.9);

  const handleSubmit = () => {
    if (!connected) { setVisible(true); return; }
    alert(`Order placed: ${side.toUpperCase()} ${size} ${skinName} @ ${orderType === 'market' ? 'Market' : `$${limitPrice}`} x${leverage}`);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex">
        <button
          onClick={() => setSide('long')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${side === 'long' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Long
        </button>
        <button
          onClick={() => setSide('short')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${side === 'short' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Short
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-1 bg-gray-800 rounded-md p-1">
          {(['market', 'limit'] as const).map(t => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`flex-1 py-1 text-xs rounded transition-colors capitalize ${orderType === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {orderType === 'limit' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Limit Price (USD)</label>
            <input
              type="number"
              value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)}
              placeholder={markPrice.toFixed(2)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1">Size (units)</label>
          <input
            type="number"
            value={size}
            onChange={e => setSize(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Leverage</span>
            <span className="text-white font-mono">{leverage}x</span>
          </div>
          <div className="flex gap-1">
            {LEVERAGES.map(l => (
              <button
                key={l}
                onClick={() => setLeverage(l)}
                className={`flex-1 py-1 text-xs rounded transition-colors ${leverage === l ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-md p-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-400">
            <span>Notional</span>
            <span className="text-gray-200 font-mono">${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Margin Required</span>
            <span className="text-gray-200 font-mono">${margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Est. Liq. Price</span>
            <span className={`font-mono ${side === 'long' ? 'text-red-400' : 'text-green-400'}`}>
              ${sizeNum > 0 ? liqPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
            </span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className={`w-full py-3 rounded-md text-sm font-semibold transition-colors ${
            side === 'long'
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
        >
          {connected ? `${side === 'long' ? 'Long' : 'Short'} ${skinName}` : 'Connect Wallet'}
        </button>
      </div>
    </div>
  );
}
