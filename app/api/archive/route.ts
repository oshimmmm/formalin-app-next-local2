// app/api/archive/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

export async function POST(request: Request) {
  try {
    const { startDate, endDate } = await request.json();
    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, message: "開始日と終了日を指定してください。" },
        { status: 400 }
      );
    }

    // 入力された日付文字列を Date に変換
    const start = new Date(startDate);
    const end = new Date(endDate);
    // 終了日は丸一日分含めるために、23:59:59に設定
    end.setHours(23, 59, 59, 999);

    // まず History テーブルから、updated_at が範囲内のレコードを削除
    const historyDeletion = await prisma.history.deleteMany({
      where: {
        updated_at: {
          gte: start,
          lte: end,
        },
      },
    });

    // 次に Formalin テーブルから、createdAt が範囲内のレコードを削除
    const formalinDeletion = await prisma.formalin.deleteMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedHistoryCount: historyDeletion.count,
      deletedFormalinCount: formalinDeletion.count,
    });
  } catch (error: unknown) {
    console.error("Archive error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
