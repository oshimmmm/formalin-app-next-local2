import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";

type Item = {
  key: string;
  place: string | null;
  size: string | null;
  expired: string | null;
  lotNumber: string | null;
  boxNumber: string | null;
  productCode: string | null;
  timestamp: string;
  updatedBy: string;
  updatedAt: string;
};

export async function POST(req: Request) {
  const { items }: { items: Item[] } = await req.json();
  if (!items?.length) return NextResponse.json({ error: "empty" }, { status: 400 });

  /* 1) createMany -------------------------------------------------- */
  await prisma.formalin.createMany({
    data: items.map((i) => ({
      key        : i.key,
      place      : i.place,
      status     : "入庫済み",
      timestamp  : new Date(i.timestamp),
      size       : i.size,
      expired    : i.expired ? new Date(i.expired) : null,
      lot_number : i.lotNumber,
      box_number : i.boxNumber,
      productCode: i.productCode,
    })),
    skipDuplicates: true,
  });

  /* 2) INSERT した id を取る -------------------------------------- */
  const created = await prisma.formalin.findMany({
    where: { key: { in: items.map((i) => i.key) } },
    select: { id: true, key: true },
  });
  const idMap = new Map(created.map((c) => [c.key, c.id]));

  /* 3) 履歴まとめて createMany ------------------------------------ */
  await prisma.history.createMany({
    data: items.map((i) => ({
      formalinId : idMap.get(i.key)!,
      key        : i.key,
      updated_by : i.updatedBy,
      updated_at : new Date(i.updatedAt),
      old_status : "",
      new_status : "入庫済み",
      old_place  : "",
      new_place  : i.place ?? "",
    })),
  });

  return NextResponse.json({ count: items.length }, { status: 201 });
}
