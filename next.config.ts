import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Windows/Docker Desktop 環境でファイル監視をポーリングに切り替え
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        ignored: /node_modules/,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};


export default nextConfig;
