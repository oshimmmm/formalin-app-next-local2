import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

const SIZE = "生検用 30ml";

/** 指定日のJST境界をUTCのDateに変換 */
function getJstDayTimesAsUtc(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  // JST 00:00 は UTC -9時間
  const startUtc = new Date(Date.UTC(y, m - 1, d, -9, 0, 0, 0));
  // JST 23:59:59.999 は UTC 14:59:59.999
  const endUtc = new Date(Date.UTC(y, m - 1, d, 14, 59, 59, 999));
  return { startUtc, endUtc };
}

/** UTCの日時から「ちょうど months ヶ月前」のUTC日時を返す（時分秒ミリ秒は維持） */
function monthsAgoUtc(atUtc: Date, months: number) {
  return new Date(
    Date.UTC(
      atUtc.getUTCFullYear(),
      atUtc.getUTCMonth() - months,
      atUtc.getUTCDate(),
      atUtc.getUTCHours(),
      atUtc.getUTCMinutes(),
      atUtc.getUTCSeconds(),
      atUtc.getUTCMilliseconds()
    )
  );
}

/**
 * atUtc 時点における「手術室×出庫済み×SIZE」の個数を復元して数える。
 * ただし検索対象の履歴は lowerBoundUtc 以降（>=）〜 atUtc まで（<=）に限定。
 */
async function countOrOutAtTime(atUtc: Date, lowerBoundUtc: Date) {
  const records = await prisma.history.findMany({
    where: {
      updated_at: { gte: lowerBoundUtc, lte: atUtc }, // 2ヶ月ウィンドウ
      formalin: { size: SIZE },
    },
    orderBy: [{ formalinId: "asc" }, { updated_at: "desc" }],
    select: {
      formalinId: true,
      new_status: true,
      new_place: true,
    },
  });

  let count = 0;
  const seen = new Set<number>();
  for (const r of records) {
    if (r.formalinId == null) continue;
    if (seen.has(r.formalinId)) continue; // formalinIdごとに最新1件のみ
    seen.add(r.formalinId);
    const status = r.new_status ?? "";
    const place = r.new_place ?? "";
    if (status === "出庫済み" && place === "手術室") count++;
  }
  return count;
}

export async function POST(request: Request) {
  try {
    const { date } = (await request.json()) as { date?: string };
    if (!date) {
      return NextResponse.json(
        { error: "date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const { startUtc, endUtc } = getJstDayTimesAsUtc(date);

    // 2か月前の下限（UTC）
    const initialLower = monthsAgoUtc(startUtc, 2);
    const finalLower = monthsAgoUtc(endUtc, 2);

    // ① 指定日 JST 00:00 時点
    const initialCount = await countOrOutAtTime(startUtc, initialLower);

    // ③ 指定日 JST 23:59:59.999 時点
    const finalCount = await countOrOutAtTime(endUtc, finalLower);

    // ② 一覧（Formalin基準: JST当日範囲 & returnBy が null/空文字以外）
    const list = await prisma.formalin.findMany({
      where: {
        size: SIZE,
        updatedAt: { gte: startUtc, lte: endUtc },
        NOT: { OR: [{ returnBy: null }, { returnBy: "" }] },
      },
      select: {
        updatedAt: true,
        returnBy: true,
        lot_number: true,
        box_number: true,
        key: true,
      },
      orderBy: { updatedAt: "asc" },
    });

    const rows = list.map((f) => ({
      lotNumber: f.lot_number ?? "",
      boxNumber: f.box_number ?? "",
      serial: f.key ?? "",
      updatedAt: f.updatedAt.toISOString(),
      returnBy: f.returnBy ?? "",
    }));

    return NextResponse.json({ initialCount, finalCount, rows });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("POST /api/biopsy error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error("POST /api/biopsy unknown error:", error);
    return NextResponse.json({ error: "Failed to fetch biopsy data" }, { status: 500 });
  }
}
