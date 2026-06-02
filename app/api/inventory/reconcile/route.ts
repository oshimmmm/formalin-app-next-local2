import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import {
  ReconcileBySizeType,
  ReconcileLotRow,
  ForcedEditCounts,
} from "@/app/types/inventory";

// 在庫確認ページ（/api/inventory）と同じ3規格のみを対象にする
const SIZES = ["25ml中性緩衝", "生検用 30ml", "リンパ節用 40ml"] as const;
type Size = (typeof SIZES)[number];
const isTargetSize = (s: string): s is Size =>
  (SIZES as readonly string[]).includes(s);

// size → lot ごとの集計バケツ
type Acc = {
  outCount: number; // net 出庫数（在庫確認と同じ）
  excelTotal: number; // まとめVer Excel に残る出庫本数
  crossReturns: number; // 期またぎ戻入
  inPeriodReturns: number; // 期内の往復戻入（参考）
};

export async function POST(request: Request) {
  try {
    const { startDate, endDate } = await request.json();

    // JSTの日付範囲をUTCに変換して検索（DBはUTC相当で格納）
    const start = new Date(`${startDate}T00:00:00+09:00`);
    const end = new Date(`${endDate}T23:59:59.999+09:00`);

    // ─── 期間開始前の各 formalin の最終状態（出庫済み/提出済み なら「カウント済み」扱い）───
    // formalin 1本ごとに findFirst を投げるとコネクションプールを食い潰す（P2024）ため、
    // distinct で「formalinId ごとに updated_at が最大の1行」を1クエリで取得する。
    const initialWasCounted = new Map<number, boolean>();
    const lastBeforeStart = await prisma.history.findMany({
      where: { updated_at: { lt: start } },
      orderBy: [{ formalinId: "asc" }, { updated_at: "desc" }],
      distinct: ["formalinId"],
      select: { formalinId: true, new_status: true },
    });
    for (const h of lastBeforeStart) {
      if (h.formalinId == null) continue;
      initialWasCounted.set(
        h.formalinId,
        h.new_status === "出庫済み" || h.new_status === "提出済み"
      );
    }

    // ─── 期間内の履歴（formalinId 昇順・時系列）───
    const periodHistories = await prisma.history.findMany({
      where: {
        updated_at: { gte: start, lte: end },
      },
      orderBy: [{ formalinId: "asc" }, { updated_at: "asc" }],
      select: {
        formalinId: true,
        old_status: true,
        new_status: true,
        formalin: { select: { size: true, lot_number: true } },
      },
    });

    // size → (lot → Acc)
    const bySizeLot = new Map<string, Map<string, Acc>>();
    const ensure = (size: string, lot: string): Acc => {
      let lots = bySizeLot.get(size);
      if (!lots) {
        lots = new Map();
        bySizeLot.set(size, lots);
      }
      let acc = lots.get(lot);
      if (!acc) {
        acc = { outCount: 0, excelTotal: 0, crossReturns: 0, inPeriodReturns: 0 };
        lots.set(lot, acc);
      }
      return acc;
    };

    // size → 識別可能な強制編集の件数
    const forcedBySize = new Map<string, ForcedEditCounts>();
    const ensureForced = (size: string): ForcedEditCounts => {
      let f = forcedBySize.get(size);
      if (!f) {
        f = { submittedToOutbound: 0, submittedToInbound: 0 };
        forcedBySize.set(size, f);
      }
      return f;
    };

    let currentFormalinId: number | null = null;
    let wasCounted = false;
    let pending = false; // 期内の出庫がまとめVer Excel にまだ残っているか

    for (const record of periodHistories) {
      if (record.formalinId === null) continue;
      const fId = record.formalinId;

      if (currentFormalinId !== fId) {
        currentFormalinId = fId;
        wasCounted = initialWasCounted.get(fId) ?? false;
        pending = false;
      }

      const size = record.formalin?.size ?? "";
      if (!isTargetSize(size)) continue; // 在庫確認/Excel と同じ3規格のみ
      const lot = record.formalin?.lot_number ?? "不明";

      const oldS = record.old_status ?? "";
      const newS = record.new_status ?? "";

      // ── 識別可能な強制編集の件数（状態機械とは独立に観測）──
      // 「提出済み」から状態を変える編集は通常フローでは起こらず、管理画面の手動編集のみ
      if (oldS === "提出済み" && newS === "出庫済み") {
        ensureForced(size).submittedToOutbound += 1;
      } else if (oldS === "提出済み" && newS === "入庫済み") {
        ensureForced(size).submittedToInbound += 1;
      }

      // ── 真の出庫イベント ──（在庫確認・Excel ともに +1）
      if (
        !wasCounted &&
        oldS === "入庫済み" &&
        (newS === "出庫済み" || newS === "提出済み")
      ) {
        const acc = ensure(size, lot);
        acc.outCount += 1;
        acc.excelTotal += 1;
        pending = true;
        wasCounted = true;
      }
      // ── 戻入イベント（出庫済み → 入庫済み）──
      else if (wasCounted && oldS === "出庫済み" && newS === "入庫済み") {
        const acc = ensure(size, lot);
        acc.outCount -= 1; // 在庫確認は常に -1
        if (pending) {
          // 期内に出庫した分の戻入 → Excel 側でも splice 済み（差は出ない）
          acc.excelTotal -= 1;
          acc.inPeriodReturns += 1;
        } else {
          // 前期間に出庫した分の戻入 → Excel には載らない（差の正体）
          acc.crossReturns += 1;
        }
        pending = false;
        wasCounted = false;
      }
      // ── 強制編集での戻入（提出済み等 → 入庫済み）──
      else if (
        wasCounted &&
        oldS !== "" &&
        oldS !== "入庫済み" &&
        newS === "入庫済み"
      ) {
        const acc = ensure(size, lot);
        acc.outCount -= 1;
        if (pending) {
          acc.excelTotal -= 1;
          acc.inPeriodReturns += 1;
        } else {
          acc.crossReturns += 1;
        }
        pending = false;
        wasCounted = false;
      }
      // ── 「提出済み → 出庫済み」の強制変更は無視 ──
      else if (oldS === "提出済み" && newS === "出庫済み") {
        // 何もしない
      }
    }

    // ─── 規格ごとに集計してレスポンス化 ───
    const result: ReconcileBySizeType = {};
    for (const size of SIZES) {
      const lots = bySizeLot.get(size) ?? new Map<string, Acc>();

      const lotRows: ReconcileLotRow[] = Array.from(lots.entries())
        .map(([lotNumber, a]) => ({
          lotNumber,
          outCount: a.outCount,
          excelTotal: a.excelTotal,
          crossReturns: a.crossReturns,
          inPeriodReturns: a.inPeriodReturns,
          matches: a.excelTotal - a.crossReturns === a.outCount,
        }))
        .sort((x, y) => x.lotNumber.localeCompare(y.lotNumber, "ja"));

      const sum = lotRows.reduce(
        (s, r) => ({
          outCount: s.outCount + r.outCount,
          excelTotal: s.excelTotal + r.excelTotal,
          crossReturns: s.crossReturns + r.crossReturns,
          inPeriodReturns: s.inPeriodReturns + r.inPeriodReturns,
        }),
        { outCount: 0, excelTotal: 0, crossReturns: 0, inPeriodReturns: 0 }
      );

      result[size] = {
        ...sum,
        matches: sum.excelTotal - sum.crossReturns === sum.outCount,
        forcedEdits:
          forcedBySize.get(size) ?? { submittedToOutbound: 0, submittedToInbound: 0 },
        lots: lotRows,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Reconcile error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
