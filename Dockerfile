FROM node:22.23.4-alpine

WORKDIR /app

RUN apk update && apk add --no-cache python3 make g++

# package.json, package-lock.json, prisma/schema.prisma を先にコピー
COPY package*.json ./
COPY prisma ./prisma

# ロックファイルと同じ依存関係を入れる。環境変数は実行時にComposeから渡す。
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build_only npm ci

# Prisma Client生成
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build_only npx prisma generate

COPY . .

RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build_only npm run build

EXPOSE 3003
CMD ["npm", "run", "start"]
