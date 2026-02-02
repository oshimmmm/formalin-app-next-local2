// app/api/formalin/[id]/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";

// 文字列(ISO) → Date（不正なら undefined）
const toDate = (v: unknown) =>
  typeof v === "string" ? new Date(v) : v instanceof Date ? v : undefined;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // ★ Next.js 15以降は Promise
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid id" },
        { status: 400 }
      );
    }

    const body = await request.json();
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
      returnBy,      // 未送信(undefined)なら未変更
      updatedBy,
      updatedAt,
      oldStatus,
      newStatus,
      oldPlace,
      newPlace,
    } = body ?? {};

    const parsedTimestamp = timestamp ? toDate(timestamp) : undefined;
    if (parsedTimestamp && Number.isNaN(parsedTimestamp.getTime())) {
      return NextResponse.json(
        { success: false, message: "timestamp is invalid" },
        { status: 400 }
      );
    }
    const timestampToUse =
      parsedTimestamp ??
      (status === "出庫済み" ? new Date() : undefined);

    const updated = await prisma.formalin.update({
      where: { id },
      data: {
        key:         key        ?? undefined,
        place:       place      ?? undefined,
        status:      status     ?? undefined,
        timestamp:   timestampToUse,
        size:        size       ?? undefined,
        expired:     expired    ? toDate(expired)   : undefined,
        lot_number:  lotNumber  ?? undefined,
        box_number:  boxNumber  ?? undefined,
        productCode: productCode?? undefined,
        returnBy:    returnBy === undefined ? undefined : returnBy,
      },
    });

    // 履歴（任意）
    if (updatedBy && updatedAt) {
      const ua = toDate(updatedAt);
      if (!ua || isNaN(ua.getTime())) {
        return NextResponse.json(
          { success: false, message: "updatedAt is invalid" },
          { status: 400 }
        );
      }
      await prisma.history.create({
        data: {
          key: updated.key ?? null,
          formalinId: updated.id,
          updated_by: updatedBy,
          updated_at: ua,
          old_status: oldStatus ?? "",
          new_status: newStatus ?? "",
          old_place:  oldPlace  ?? "",
          new_place:  newPlace  ?? "",
        },
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    // Prismaの既知エラー（例：更新対象なし）
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { success: false, message: "Record to update not found" },
        { status: 404 }
      );
    }
    if (error instanceof Error) {
      console.error("PUT /api/formalin/[id] error:", error.message);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }
    console.error("PUT /api/formalin/[id] unknown error:", error);
    return NextResponse.json(
      { success: false, message: "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid id" },
        { status: 400 }
      );
    }

    await prisma.history.deleteMany({ where: { formalinId: id } });
    await prisma.formalin.delete({ where: { id } });

    // 204 はボディ無し
    return new Response(null, { status: 204 });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("DELETE /api/formalin/[id] error:", error.message);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }
    console.error("DELETE /api/formalin/[id] unknown error:", error);
    return NextResponse.json(
      { success: false, message: "Unknown error" },
      { status: 500 }
    );
  }
}
