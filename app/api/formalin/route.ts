// app/api/formalin/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // 旧互換: 提出済みを含める？
  const includeSubmitted = url.searchParams.get("includeSubmitted") === "true";

  // ページング
  const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSizeParam = parseInt(url.searchParams.get("pageSize") ?? "100", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const rawPageSize = Number.isFinite(pageSizeParam) && pageSizeParam >= 0 ? pageSizeParam : 100;
  const pageSize = Math.min(rawPageSize, 500); // 上限

  // 並び順（追加）：timestampAsc（古い順）/ timestampDesc（新しい順, 既定）
  const sortParam = (url.searchParams.get("sort") ?? "timestampDesc") as
    | "timestampAsc"
    | "timestampDesc";

  // 絞り込み
  const status = url.searchParams.get("status") || undefined;
  const statusInStr = url.searchParams.get("statusIn") || undefined; // カンマ区切り
  const statusIn = statusInStr ? statusInStr.split(",") : undefined;
  const notStatus = url.searchParams.get("notStatus") || undefined;

  const lotNumber = url.searchParams.get("lotNumber") || undefined;
  const boxNumber = url.searchParams.get("boxNumber") || undefined;
  const keyStr = url.searchParams.get("key") || undefined;
  const productCode = url.searchParams.get("productCode") || undefined;
  const size = url.searchParams.get("size") || undefined;

  const updatedAtFromStr = url.searchParams.get("updatedAtFrom") || undefined;
  const updatedAtToStr = url.searchParams.get("updatedAtTo") || undefined;
  const updatedAtFrom = updatedAtFromStr ? new Date(updatedAtFromStr) : undefined;
  const updatedAtTo = updatedAtToStr ? new Date(updatedAtToStr) : undefined;

  const countOnly = url.searchParams.get("countOnly") === "true";

  // status系の指定があるなら includeSubmitted は無視
  const hasStatusFilter = !!(status || statusIn || notStatus);

  // Prisma 型に合うように status フィルタを一意に決定
  const statusFilter: Prisma.StringNullableFilter | string | undefined = (() => {
    if (status) return status;
    if (statusIn) return { in: statusIn };
    if (notStatus) return { not: notStatus };
    if (!hasStatusFilter && !includeSubmitted) return { not: "提出済み" };
    return undefined;
  })();

  const where: Prisma.FormalinWhereInput = {
    ...(statusFilter !== undefined ? { status: statusFilter } : {}),
    ...(lotNumber ? { lot_number: lotNumber } : {}),
    ...(boxNumber ? { box_number: boxNumber } : {}),
    ...(productCode ? { productCode } : {}),
    ...(keyStr ? { key: keyStr } : {}),
    ...(size ? { size } : {}),
    ...(updatedAtFrom || updatedAtTo
      ? {
          timestamp: {
            ...(updatedAtFrom ? { gte: updatedAtFrom } : {}),
            ...(updatedAtTo ? { lt: updatedAtTo } : {}),
          },
        }
      : {}),
  };

  // 並び順を構築（NULL は最後へ）
  const orderBy: Prisma.FormalinOrderByWithRelationInput[] =
    sortParam === "timestampAsc"
      ? [
          { timestamp: { sort: "asc", nulls: "last" } },
          { updatedAt: "asc" },
          { id: "asc" },
        ]
      : [
          { timestamp: { sort: "desc", nulls: "last" } },
          { updatedAt: "desc" },
          { id: "desc" },
        ];

  try {
    // 件数だけ欲しいケース
    if (countOnly || pageSize === 0) {
      const total = await prisma.formalin.count({ where });
      return NextResponse.json({ items: [], total, page, pageSize: 0 });
    }

    const [items, total] = await prisma.$transaction([
      prisma.formalin.findMany({
        where,
        orderBy, // ← ここで昇順/降順を反映
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.formalin.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}

// POST は既存のままでOK
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      key, place, status, timestamp, size, expired,
      lotNumber, boxNumber, productCode, returnBy,
      updatedBy, updatedAt, oldStatus, newStatus, oldPlace, newPlace,
    } = body;

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
        returnBy: returnBy ?? "病理へ提出",
      },
    });

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
