// app/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

/**
 * この型アサーションを使うことで、
 * 開発モードでホットリロードされても
 * グローバル空間にキャッシュされた prisma を使いまわす。
 */
const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 開発モードでクエリログを見たい場合などは以下を有効に
    // log: ["query", "info", "warn", "error"],
  });

// 開発環境の場合は、グローバル変数に prisma を保存して再利用
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
