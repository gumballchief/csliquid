/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow Steam CDN images — no referrer sent so their CDN doesn't block
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs:     false,
      net:    false,
      tls:    false,
      crypto: false,
      stream: false,
      path:   false,
      os:     false,
    };
    return config;
  },
};

export default nextConfig;
