FROM node:20-alpine

WORKDIR /app

RUN apk update && apk add --no-cache python3 make g++

# package.json, package-lock.json, prisma/schema.prisma を先にコピー
COPY package*.json ./
COPY prisma ./prisma

# ここで .env をコピー
COPY .env.docker ./

RUN npm install

# Prisma Client生成
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3003
CMD ["npm", "run", "start"]
