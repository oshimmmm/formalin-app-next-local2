import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

export async function POST(req: Request) {
  const { items }: { items: { id: number; place: string; updatedBy: string; updatedAt: string }[] } = await req.json();
  if (!items?.length) return NextResponse.json({ error: "empty" }, { status: 400 });

  const now = new Date();

  await prisma.$transaction([
    ...items.map((i) =>
      prisma.formalin.update({
        where: { id: i.id },
        data : { status: "出庫済み", place: i.place, timestamp: now },
      })
    ),
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
