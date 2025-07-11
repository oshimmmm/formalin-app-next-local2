import prisma from "@/app/lib/prisma";
import { InventoryDataBySizeType } from "@/app/types/inventory";
import { NextResponse } from "next/server";

const SIZES = [
  "25ml中性緩衝",
  "生検用 30ml",
  "リンパ節用 40ml"
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
      // ─── 1) 入庫数を取得（formalinIdでユニーク） ───
      const inCount = await prisma.history.findMany({
        where: {
          updated_at: {
            gte: start,
            lte: end,
          },
          old_status: "",
          new_status: "入庫済み",
          formalin: {
            size: size,
          },
        },
        distinct: ["formalinId"],
      }).then((results) => results.length);

      // ─── 2) 出庫数を取得 ───
      // 2-1) 「そのサイズに属するすべての formalinId」をまず取得
      const allFormalinIds = await prisma.formalin.findMany({
        where: { size },
        select: { id: true },
      }).then((rows) => rows.map((r) => r.id));

      // 2-2) 期間開始前の各 formalinId の最終履歴を個別に findFirst で取得
      const initialWasCounted = new Map<number, boolean>();
      await Promise.all(
        allFormalinIds.map(async (formalinId) => {
          const lastHistory = await prisma.history.findFirst({
            where: {
              formalinId,
              updated_at: { lt: start },
            },
            orderBy: { updated_at: "desc" },
            select: { new_status: true },
          });
          const was = lastHistory
            ? lastHistory.new_status === "出庫済み" || lastHistory.new_status === "提出済み"
            : false;
          initialWasCounted.set(formalinId, was);
        })
      );

      // 2-3) 期間内のすべての履歴を取得
      const periodHistories = await prisma.history.findMany({
        where: {
          updated_at: {
            gte: start,
            lte: end,
          },
          formalin: {
            size: size,
          },
        },
        orderBy: [
          { formalinId: "asc" },
          { updated_at: "asc" },
        ],
        select: {
          formalinId: true,
          old_status: true,
          new_status: true,
        },
      });

      const outboundMap = new Map<number, number>();
      let currentFormalinId: number | null = null;
      let wasCounted = false;

      for (const record of periodHistories) {
        if (record.formalinId === null) continue;
        const fId = record.formalinId;

        if (currentFormalinId !== fId) {
          currentFormalinId = fId;
          // 期間開始前の状態を照会して初期化
          wasCounted = initialWasCounted.get(fId) ?? false;
        }

        const oldS = record.old_status ?? "";
        const newS = record.new_status ?? "";

        // ── 真の出庫イベント ──
        // old="入庫済み" → new="出庫済み" または new="提出済み" のときにカウント
        if (
          !wasCounted &&
          oldS === "入庫済み" &&
          (newS === "出庫済み" || newS === "提出済み")
        ) {
          outboundMap.set(fId, (outboundMap.get(fId) || 0) + 1);
          wasCounted = true;
        }
        // ── 戻入イベント（出庫済み → 入庫済み）──
        else if (wasCounted && oldS === "出庫済み" && newS === "入庫済み") {
          outboundMap.set(fId, (outboundMap.get(fId) || 0) - 1);
          wasCounted = false;
        }
        // ── 強制編集で「提出済みまたは他の状態」→「入庫済み」に戻された場合のみ戻入扱い ──
        else if (
          wasCounted &&
          oldS !== "" &&
          oldS !== "入庫済み" &&
          newS === "入庫済み"
        ) {
          outboundMap.set(fId, (outboundMap.get(fId) || 0) - 1);
          wasCounted = false;
        }
        // ── 「提出済み → 出庫済み」の強制変更は無視 ──
        else if (oldS === "提出済み" && newS === "出庫済み") {
          // 何もしない
        }
        // その他の状態変化は net 出庫数に影響しない
      }

      const outCount = Array.from(outboundMap.values()).reduce(
        (sum, cnt) => sum + cnt,
        0
      );

      // ─── 3) 在庫数を取得（end日時点のスナップショット） ───
      // end 以前の履歴を formalinId ごとに最新順で取り出す
      const historyRecords = await prisma.history.findMany({
        where: {
          updated_at: { lte: end },
          formalin: { size },
        },
        orderBy: [
          { formalinId: 'asc' },
          { updated_at: 'desc' },
        ],
        select: {
          formalinId: true,
          new_status: true,
          formalin: {
            select: { lot_number: true },
          },
        },
      });

      // formalinId ごとに最初のレコード（最新状態）だけを残す
      const latestMap = new Map<number, {
        status: string;
        lotNumber: string;
      }>();
      for (const rec of historyRecords) {
        if (rec.formalinId == null) continue;
        if (!latestMap.has(rec.formalinId)) {
          latestMap.set(rec.formalinId, {
            status: rec.new_status ?? "",
            lotNumber: rec.formalin?.lot_number ?? "不明",
          });
        }
      }

      // "入庫済み" のものだけ抽出してカウント
      const inStockEntries = Array.from(latestMap.values())
        .filter((v) => v.status === "入庫済み");

      const stockCount = inStockEntries.length;

      // ロット番号ごとに件数集計
      const stockDetailsMap = new Map<string, number>();
      for (const { lotNumber } of inStockEntries) {
        stockDetailsMap.set(
          lotNumber,
          (stockDetailsMap.get(lotNumber) || 0) + 1
        );
      }
      const stockDetails = Array.from(stockDetailsMap.entries()).map(
        ([lotNumber, count]) => ({ lotNumber, count })
      );

      // // ─── 3) 在庫数を取得（末日時点） ───
      // const stockCount = await prisma.formalin.count({
      //   where: {
      //     status: "入庫済み",
      //     size,
      //   },
      // });

      // const stockGroup = await prisma.formalin.groupBy({
      //   by: ["lot_number"],
      //   where: {
      //     status: "入庫済み",
      //     size,
      //   },
      //   _count: { id: true },
      // });

      // const stockDetails = stockGroup.map(g => ({
      //   lotNumber: g.lot_number ?? "不明",
      //   count: g._count.id,
      // }));

      // ─── 4) 提出数を取得（formalinIdでユニーク） ───
      const submissionCount = await prisma.formalin.findMany({
        where: {
          updatedAt: {
            gte: start,
            lte: end,
          },
          status: "提出済み",
          size: size,
        },
        distinct: ["id"],
      }).then((results) => results.length);

      // ─── 5) 入庫詳細情報を取得 ───
      const inboundDetails = await prisma.history.groupBy({
        by: ["updated_by", "updated_at"],
        where: {
          updated_at: {
            gte: start,
            lte: end,
          },
          new_status: "入庫済み",
          old_status: "",
          formalin: {
            size: size,
          },
        },
        _count: {
          formalinId: true,
        },
      }).then(async (groups) => {
        const details = await Promise.all(
          groups.map(async (group) => {
            const lotNumber = await prisma.formalin.findFirst({
              where: {
                histories: {
                  some: {
                    updated_by: group.updated_by,
                    updated_at: group.updated_at,
                  },
                },
              },
              select: {
                lot_number: true,
              },
            });

            return {
              lotNumber: lotNumber?.lot_number || "",
              inboundDate: group.updated_at.toISOString().split("T")[0],
              updatedBy: group.updated_by || "",
              count: group._count.formalinId,
            };
          })
        );
        return details;
      });

      // ─── 6) 出庫詳細情報を “真の出庫イベント” でロットごとに集計 ───
      const targetIds = Array.from(outboundMap.keys());
      const formList = await prisma.formalin.findMany({
        where: { id: { in: targetIds } },
        select: { id: true, lot_number: true },
      });
      const lotMap = new Map<number, string>(
        formList.map(f => [f.id, f.lot_number ?? "不明"] as [number, string])
      );

      const detailsByLot = new Map<string, number>();
      for (const [formalinId, cnt] of outboundMap) {
        const lot = lotMap.get(formalinId) ?? "不明";
        detailsByLot.set(lot, (detailsByLot.get(lot) || 0) + cnt);
      }

      const outboundDetails = Array.from(detailsByLot.entries()).map(
        ([lotNumber, outCnt]) => ({
          lotNumber,
          outCount: outCnt,
          submissionCount: 0, // 必要に応じて同様に集計してください
        })
      );
      // ─── 7) 結果をオブジェクトにまとめる ───
      inventoryBySize[size] = {
        inCount,
        outCount,
        stockCount,
        submissionCount,
        inboundDetails,
        outboundDetails,
        stockDetails,
      };
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
