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

/**
 * items の複合キーを文字列にするヘルパー
 * null の場合は空文字に変換しておく
 */
const makeKey = (i: Item) =>
  `${i.key}-${i.lotNumber ?? ""}-${i.boxNumber ?? ""}-${i.productCode ?? ""}`;

export async function POST(req: Request) {
  const { items }: { items: Item[] } = await req.json();
  if (!items?.length) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  // まとめて処理を行うためトランザクションに包む
  await prisma.$transaction(async (tx) => {
    // 1. 既存の Formalin レコードを複合キーで取得
    const existing = await tx.formalin.findMany({
      where: {
        OR: items.map((i) => ({
          key: i.key,
          lot_number: i.lotNumber,
          box_number: i.boxNumber,
          productCode: i.productCode,
        })),
      },
      select: {
        id: true,
        key: true,
        lot_number: true,
        box_number: true,
        productCode: true,
      },
    });
    // 既存レコードの複合キー → id のマップ
    const existingMap = new Map(
      existing.map((f) => [
        `${f.key}-${f.lot_number ?? ""}-${f.box_number ?? ""}-${f.productCode ?? ""}`,
        f.id,
      ]),
    );

    // 2. まだ存在しないレコードのみを抽出して一括作成
    const newItems = items.filter((i) => !existingMap.has(makeKey(i)));
    if (newItems.length > 0) {
      await tx.formalin.createMany({
        data: newItems.map((i) => ({
          key: i.key,
          place: i.place,
          status: "入庫済み",
          timestamp: new Date(i.timestamp),
          size: i.size,
          expired: i.expired ? new Date(i.expired) : null,
          lot_number: i.lotNumber,
          box_number: i.boxNumber,
          productCode: i.productCode,
        })),
        // 念のため二重スキャン対策として skipDuplicates を付ける
        skipDuplicates: true,
      });
    }

    // 3. 作成済み／新規レコードをまとめて取得し id をマッピング
    const allRecords = await tx.formalin.findMany({
      where: {
        OR: items.map((i) => ({
          key: i.key,
          lot_number: i.lotNumber,
          box_number: i.boxNumber,
          productCode: i.productCode,
        })),
      },
      select: {
        id: true,
        key: true,
        lot_number: true,
        box_number: true,
        productCode: true,
      },
    });
    const idMap = new Map(
      allRecords.map((f) => [
        `${f.key}-${f.lot_number ?? ""}-${f.box_number ?? ""}-${f.productCode ?? ""}`,
        f.id,
      ]),
    );

    // 4. 履歴テーブルへ一括登録（すべての items を対象に複合キーで id を取得）
    await tx.history.createMany({
      data: items.map((i) => ({
        formalinId: idMap.get(makeKey(i)) ?? null,
        key: i.key,
        updated_by: i.updatedBy,
        updated_at: new Date(i.updatedAt),
        old_status: "",
        new_status: "入庫済み",
        old_place: "",
        new_place: i.place ?? "",
      })),
    });
  });

  return NextResponse.json({ count: items.length }, { status: 201 });
}
