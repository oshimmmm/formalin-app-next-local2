// app/api/formalin/[id]/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

/**
 * PUT /api/formalin/:id
 * Body: { key, place, status, timestamp, size, expired, lotNumber, updatedBy, updatedAt, ... }
 */
export async function PUT(
  request: Request,
  context: unknown
) {
  try {
    const { params } = context as { params: { id: string } };
    const id = Number(params.id);
    const body = await request.json();
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

    await prisma.formalin.update({
      where: { id },
      data: {
        key: key ?? undefined,
        place: place ?? undefined,
        status: status ?? undefined,
        timestamp: timestamp ? new Date(timestamp) : undefined,
        size: size ?? undefined,
        expired: expired ? new Date(expired) : undefined,
        lot_number: lotNumber ?? undefined,
      },
    });

    if (updatedBy && updatedAt) {
      await prisma.history.create({
        data: {
          formalinId: id,
          updated_by: updatedBy,
          updated_at: new Date(updatedAt),
          old_status: oldStatus ?? "",
          new_status: newStatus ?? "",
          old_place: oldPlace ?? "",
          new_place: newPlace ?? "",
        },
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/**
 * DELETE /api/formalin/:id
 */
export async function DELETE(
  request: Request,
  context: unknown
) {
  try {
    const { params } = context as { params: { id: string } };
    const id = Number(params.id);

    // 1) history の削除
    await prisma.history.deleteMany({ where: { formalinId: id } });
    // 2) formalin の削除
    await prisma.formalin.delete({ where: { id } });

    // 204 (No Content) で応答
    return NextResponse.json({}, { status: 204 });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
