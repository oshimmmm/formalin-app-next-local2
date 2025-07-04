import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import ExcelJS from "exceljs";

function toJST(date: unknown): string {
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } else if (typeof date === "string") {
    const d = new Date(date);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const { startDate, endDate } = await request.json();

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 全formalinIdsを取得
    const allFormalinIds = await prisma.formalin.findMany({
      select: { id: true },
    }).then((rows) => rows.map((r) => r.id));

    // 期間開始前の状態を取得
    const initialWasCounted = new Map<number, boolean>();
    await Promise.all(
      allFormalinIds.map(async (formalinId) => {
        const lastHistory = await prisma.history.findFirst({
          where: {
            formalinId,
            updated_at: { lt: start },
          },
          orderBy: { updated_at: "desc" },
          select: { new_status: true },
        });
        const was = lastHistory
          ? lastHistory.new_status === "出庫済み" || lastHistory.new_status === "提出済み"
          : false;
        initialWasCounted.set(formalinId, was);
      })
    );

    // 期間内の履歴を取得
    const periodHistories = await prisma.history.findMany({
      where: {
        updated_at: {
          gte: start,
          lte: end,
        }
      },
      orderBy: [
        { formalinId: 'asc' },
        { updated_at: 'asc' }
      ],
      include: {
        formalin: true
      }
    });

    const validOutbounds: typeof periodHistories = [];
    let currentFormalinId: number | null = null;
    let wasCounted = false;

    for (const record of periodHistories) {
      if (record.formalinId === null) continue;
      const fId = record.formalinId;

      if (currentFormalinId !== fId) {
        currentFormalinId = fId;
        // 期間開始前の状態を照会して初期化
        wasCounted = initialWasCounted.get(fId) ?? false;
      }

      const oldS = record.old_status ?? "";
      const newS = record.new_status ?? "";

      // ── 真の出庫イベント ──
      if (
        !wasCounted &&
        oldS === "入庫済み" &&
        (newS === "出庫済み" || newS === "提出済み")
      ) {
        validOutbounds.push(record);
        wasCounted = true;
      }
      // ── 戻入イベント ──
      else if (wasCounted && oldS === "出庫済み" && newS === "入庫済み") {
        // 該当するformalinIdの出庫記録を削除
        const index = validOutbounds.findIndex(r => r.formalinId === fId);
        if (index !== -1) {
          validOutbounds.splice(index, 1);
        }
        wasCounted = false;
      }
      // ── 強制編集での戻入 ──
      else if (
        wasCounted &&
        oldS !== "" &&
        oldS !== "入庫済み" &&
        newS === "入庫済み"
      ) {
        const index = validOutbounds.findIndex(r => r.formalinId === fId);
        if (index !== -1) {
          validOutbounds.splice(index, 1);
        }
        wasCounted = false;
      }
      // ── 「提出済み → 出庫済み」の強制変更は無視 ──
      else if (oldS === "提出済み" && newS === "出庫済み") {
        // 何もしない
      }
    }

    // Excelワークブック作成
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("出庫詳細");

    // ヘッダー設定（不要なカラムを削除）
    worksheet.columns = [
      { header: "ホルマリンKey", key: "combinedKey", width: 20 },
      { header: "規格", key: "size", width: 12 },
      { header: "出庫者", key: "updated_by", width: 10 },
      { header: "更新日", key: "updated_at", width: 20 },
      { header: "出庫先", key: "new_place", width: 15 }
    ];

    worksheet.insertRow(1, ["出庫管理台帳"]);
    worksheet.mergeCells("A1:E1");
    const titleCell = worksheet.getCell("A1");
    titleCell.font = { size: 20, bold: true };
    titleCell.alignment = { horizontal: "left" };

    // データを古い日付順にソート
    validOutbounds.sort((a, b) =>
      new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    );

    // データを追加（不要なフィールドを削除）
    validOutbounds.forEach(record => {
      worksheet.addRow({
        combinedKey: record.formalin
          ? `${record.formalin.lot_number} - ${record.formalin.box_number} - ${record.formalin.key}`
          : "",
        size: record.formalin?.size || "",
        updated_by: record.updated_by,
        updated_at: toJST(record.updated_at),
        new_place: record.new_place
      });
    });

    // ④ 2行目以降にだけ罫線を適用
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // タイトル行(1)には何もしない、ヘッダー(2)とデータ(3以降)に罫線
      if (rowNumber >= 2) {
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      }
    });

    // バッファに変換してレスポンス
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="outbound-details_${startDate}_${endDate}.xlsx"`
      }
    });

  } catch (error) {
    console.error("Outbound details error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}