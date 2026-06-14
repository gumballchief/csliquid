import React from 'react';

function KnifeIcon() {
  return (
    <svg
      height="0.88em"
      width="0.40em"
      viewBox="0 0 16 36"
      fill="#FF6B00"
      style={{ display: 'inline-block', marginLeft: '0.02em', marginRight: '0.01em' }}
      aria-hidden
    >
      {/*
        Bayonet silhouette: blade tip top, handle bottom, rotated -22deg.
        Transform chain (SVG right-to-left):
          translate(-8,-18) → center knife at origin
          rotate(-22)       → tilt
          translate(8,18)   → move to SVG center
      */}
      <g transform="translate(8,18) rotate(-22) translate(-8,-18)">
        {/* Blade */}
        <path d="M7,1 L9,1 L10.5,22 L8,25 L5.5,22 Z" />
        {/* Crossguard */}
        <rect x="3" y="22" width="10" height="3" rx="0.5" />
        {/* Handle */}
        <rect x="5" y="25" width="6" height="10" rx="1" />
      </g>
    </svg>
  );
}

export default function Logo({ size }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: '#FF6B00' }}>CS</span>
      <KnifeIcon />
      <span style={{ color: '#ffffff' }}>IQUID</span>
    </span>
  );
}
