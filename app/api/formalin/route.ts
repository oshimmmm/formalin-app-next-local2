// app/api/formalin/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

// GET /api/formalin
export async function GET() {
  try {
    // formalin と history を左結合するイメージ: 
    // Prismaの場合、 `include: { histories: true }` で一括取得
    const data = await prisma.formalin.findMany({
      include: {
        histories: true,
      },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("GET /api/formalin error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
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
