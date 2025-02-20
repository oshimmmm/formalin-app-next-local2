// app/api/backup/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import ExcelJS from "exceljs";

// ヘルパー関数: 値が有効な Date オブジェクトか、文字列の場合は Date に変換して ISO 文字列を返す
function toISO(date: unknown): string {
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.toISOString();
  } else if (typeof date === "string") {
    const d = new Date(date);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  return "";
}

// POST /api/backup
export async function POST(request: Request) {
  try {
    const { startDate, endDate } = await request.json();
    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, message: "開始日と終了日を指定してください。" },
        { status: 400 }
      );
    }

    // 受け取った日付文字列を Date に変換
    const start = new Date(startDate);
    const end = new Date(endDate);
    // 終了日のデータを丸一日分含めるため、23:59:59に設定
    end.setHours(23, 59, 59, 999);

    // Formalinテーブルのデータを、たとえば createdAt でフィルタ
    const formalinData = await prisma.formalin.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
    });
    formalinData.forEach((record) => {
        console.log("Record ID:", record.id);
        console.log("lot_number type:", typeof record.lot_number, record.lot_number);
        console.log("expired type:", record.expired instanceof Date ? "Date" : typeof record.expired, record.expired);
      });
    console.log("Formalin Data:", formalinData);

    // Historyテーブルのデータも、たとえば updated_at でフィルタ
    const historyData = await prisma.history.findMany({
      where: {
        updated_at: {
          gte: start,
          lte: end,
        },
      },
    });
    console.log("History Data:", historyData); 

    // ExcelJS でワークブック作成
    const workbook = new ExcelJS.Workbook();

    // Formalinシート作成
    const formalinSheet = workbook.addWorksheet("Formalin");
    formalinSheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Key", key: "key", width: 15 },
      { header: "Place", key: "place", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Expired", key: "expired", width: 20 },
      { header: "Timestamp", key: "timestamp", width: 20 },
      { header: "Size", key: "size", width: 10 },
      { header: "Lot Number", key: "lot_number", width: 15 },
      { header: "CreatedAt", key: "createdAt", width: 20 },
      { header: "UpdatedAt", key: "updatedAt", width: 20 },
    ];

    formalinData.forEach((record) => {
      formalinSheet.addRow({
        id: record.id,
        key: record.key,
        place: record.place,
        status: record.status,
        expired: toISO(record.expired),
        timestamp: toISO(record.timestamp),
        size: record.size,
        lot_number: record.lot_number,
        createdAt: toISO(record.createdAt),
        updatedAt: toISO(record.updatedAt),
      });
    });

    // Historyシート作成
    const historySheet = workbook.addWorksheet("履歴");
    historySheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Key", key: "key", width: 15 },
      { header: "Updated By", key: "updated_by", width: 15 },
      { header: "Updated At", key: "updated_at", width: 20 },
      { header: "Old Status", key: "old_status", width: 15 },
      { header: "New Status", key: "new_status", width: 15 },
      { header: "Old Place", key: "old_place", width: 15 },
      { header: "New Place", key: "new_place", width: 15 },
      { header: "CreatedAt", key: "createdAt", width: 20 },
      { header: "UpdatedAt (Auto)", key: "updatedAtAuto", width: 20 },
    ];

    historyData.forEach((record) => {
      historySheet.addRow({
        id: record.id,
        key: record.key,
        updated_by: record.updated_by,
        updated_at: toISO(record.updated_at),
        old_status: record.old_status,
        new_status: record.new_status,
        old_place: record.old_place,
        new_place: record.new_place,
        createdAt: toISO(record.createdAt),
        updatedAtAuto: toISO(record.updatedAt),
      });
    });

    // ワークブックをバッファに変換
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="backup_${startDate}_${endDate}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
        console.error("Backup error:", error.message);
        console.error(error.stack); // ここでスタックトレースを出力
      } else {
        console.error("Backup error: Unknown error");
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
