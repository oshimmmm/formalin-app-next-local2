import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

export async function POST(req: Request) {
  const { items }: { items: { id: number; place: string; updatedBy: string; updatedAt: string; timestamp?: string }[] } =
    await req.json();
  if (!items?.length) return NextResponse.json({ error: "empty" }, { status: 400 });

  const now = new Date();
  const ids = items.map((i) => i.id);
  // 全件同じ出庫先なので、先頭要素から取得
  const place = items[0].place;
  const scheduledTimestamp = items[0].timestamp ? new Date(items[0].timestamp) : null;
  const timestampToUse =
    scheduledTimestamp && !Number.isNaN(scheduledTimestamp.getTime()) ? scheduledTimestamp : now;

  await prisma.$transaction([
    // ① まとめてステータス／場所／タイムスタンプを更新
    prisma.formalin.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "出庫済み",
        place,
        timestamp: timestampToUse,
      },
    }),

    // ② まとめて履歴テーブルにレコードを挿入
    prisma.history.createMany({
      data: items.map((i) => ({
        formalinId : i.id,
        key        : null,
        updated_by : i.updatedBy,
        updated_at : new Date(i.updatedAt),
        old_status : "入庫済み",
        new_status : "出庫済み",
        old_place  : "病理在庫",
        new_place  : i.place,
      })),
    }),
  ]);

  return NextResponse.json({ count: items.length });
}
