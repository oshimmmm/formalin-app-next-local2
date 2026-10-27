# ホルマリン管理システム

職場の Windows PC 上の Docker Compose で動かす Next.js アプリです。

- [職場 PC の短い更新・復旧手順（モバイルでも閲覧可能）](UPDATE.md)
- [詳しい更新・復旧手順](docs/職場PC更新手順.md)
- [セキュリティ更新の検証結果](docs/更新版検証結果.md)
- [旧PCのDBをダンプの内容へ入れ替える手順](docs/旧PCのDB復元手順.md)

本番更新は、上記の手順書を使用してください。Node.js は Docker イメージに含まれます。

## 本番と分離した更新版の検証

Docker Desktop を起動した開発用 Windows PC で、リポジトリのフォルダーから実行します。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-security-update.ps1
```

`docker-compose.test.yml` 単独で、ランダムな Compose プロジェクト名、一時的な空の PostgreSQL、ローカル限定のポート `33003` を使います。本番の `.env`、DB、保存ボリュームは使用しません。検証後はそのテスト用コンテナとネットワークを終了します。

以下は開発サーバーを使う場合の説明です。本番運用は `next start` を使用します。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
