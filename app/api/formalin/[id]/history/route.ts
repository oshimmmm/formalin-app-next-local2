// app/api/formalin/[id]/history/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formalinId = Number(id);
    if (!Number.isFinite(formalinId)) {
      return NextResponse.json({ message: "Invalid id" }, { status: 400 });
    }

    const histories = await prisma.history.findMany({
      where: { formalinId },
      orderBy: { updated_at: "desc" },
    });

    return NextResponse.json(histories);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
