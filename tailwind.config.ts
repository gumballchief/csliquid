import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/contexts/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Terminal trading palette
        tx: {
          bg:      '#0a0b0d',
          surface: '#111214',
          raised:  '#161719',
          border:  '#1e2025',
          border2: '#2a2d35',
          green:   '#00ff88',
          red:     '#ff4444',
          text:    '#e8eaed',
          muted:   '#6b7280',
          dim:     '#374151',
          deep:    '#080909',
        },
      },
      fontFamily: {
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
