// app/api/formalin/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

// GET /api/formalin
export async function GET(request: Request) {
  const url = new URL(request.url);
  // クエリパラメータ ?includeSubmitted=true があれば「提出済みも含む」
  const includeSubmitted = url.searchParams.get('includeSubmitted') === 'true';

  try {
    const data = await prisma.formalin.findMany({
      where: includeSubmitted
        ? {}                             // 全件
        : { status: { not: '提出済み' } }, // 提出済み以外
      include: { histories: true },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// POST /api/formalin
// Body: { key, place, status, timestamp, size, expired, lotNumber, updatedBy, updatedAt, oldStatus, newStatus, oldPlace, newPlace }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      key,
      place,
      status,
      timestamp,
      size,
      expired,
      lotNumber,
      boxNumber,
      productCode,
      returnBy,
      updatedBy,
      updatedAt,
      oldStatus,
      newStatus,
      oldPlace,
      newPlace,
    } = body;

    // 1) formalin を作成
    const created = await prisma.formalin.create({
      data: {
        key: key ?? null,
        place: place ?? null,
        status: status ?? null,
        timestamp: timestamp ? new Date(timestamp) : null,
        size: size ?? null,
        expired: expired ? new Date(expired) : null,
        lot_number: lotNumber ?? null,
        box_number: boxNumber ?? null,
        productCode: productCode ?? null,
        returnBy: returnBy ?? "病理へ提出" // デフォルト値を設定
      },
    });

    // 2) historyを作成 (optional)
    if (updatedBy && updatedAt) {
      await prisma.history.create({
        data: {
          key: created.key,
          formalinId: created.id,
          updated_by: updatedBy,
          updated_at: new Date(updatedAt),
          old_status: oldStatus ?? "",
          new_status: newStatus ?? "",
          old_place: oldPlace ?? "",
          new_place: newPlace ?? "",
        },
      });
    }

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
