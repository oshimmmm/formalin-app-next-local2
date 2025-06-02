import prisma from "@/app/lib/prisma";
import { InventoryDataBySizeType } from "@/app/types/inventory";
import { NextResponse } from "next/server";

const SIZES = [
  "25ml中性緩衝",
  "生検用 30ml",
  "3号 40ml"
] as const;

export async function POST(request: Request) {
  try {
    const { startDate, endDate } = await request.json();
    
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const inventoryBySize: InventoryDataBySizeType = {};

    for (const size of SIZES) {
      const [inCount, outCount, stockCount, submissionCount] = await Promise.all([
        // 入庫数を取得（formalinIdでユニーク）
        prisma.history.findMany({
          where: {
            updated_at: {
              gte: start,
              lte: end,
            },
            old_status: "",
            new_status: "入庫済み",
            formalin: {
              size: size
            }
          },
          distinct: ['formalinId'],
        }).then(results => results.length),

        // 出庫数を取得（formalinIdでユニーク）
        prisma.formalin.findMany({
          where: {
            updatedAt: {
              gte: start,
              lte: end,
            },
            status: "出庫済み",
            size: size
          },
          distinct: ['id'], 
        }).then(results => results.length),

        // 在庫数を取得（末日時点）
        prisma.history.findMany({
          where: {
            updated_at: {
              gte: new Date('2025-05-01'),
              lte: end // 末日以前のすべての履歴を対象とする
            },
            formalin: {
              size: size
            }
          },
          orderBy: {
            updated_at: 'desc' // 最新順に並べる
          },
          select: {
            formalinId: true,
            new_place: true,
            updated_at: true
          }
        }).then(results => {
          // 各formalinIdについて、最新の履歴のみを保持
          const latestStateMap = new Map();
          
          results.forEach(record => {
            if (!latestStateMap.has(record.formalinId)) {
              latestStateMap.set(record.formalinId, record);
            }
          });

          // 最新状態が "病理在庫" であるものの数をカウント
          return Array.from(latestStateMap.values())
            .filter(record => record.new_place === "病理在庫")
            .length;
        }),

        // 提出数を取得（formalinIdでユニーク）
        prisma.formalin.findMany({
          where: {
            updatedAt: {
              gte: start,
              lte: end,
            },
            status: "提出済み",
            size: size
          },
          distinct: ['id'],
        }).then(results => results.length),
      ]);

      inventoryBySize[size] = { inCount, outCount, stockCount, submissionCount };
    }

    return NextResponse.json(inventoryBySize);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "データの取得に失敗しました" },
      { status: 500 }
    );
  }
}