import type { NextConfig } from "next";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextConfig: NextConfig = {
  /* config options here */
  // Windows/Docker Desktop 環境でファイル監視をポーリングに切り替え
  webpackDevMiddleware: (config: any) => {
    config.watchOptions = {
      // 1000ms ごとにポーリングして変更を検知
      poll: 1000,
      // node_modules 配下は監視対象から除外
      ignored: /node_modules/,
      // 変更後、再ビルド開始までの遅延時間
      aggregateTimeout: 300,
    };
    return config;
  },
};


export default nextConfig;
