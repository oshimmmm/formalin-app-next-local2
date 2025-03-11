// app/api/backup/route.ts
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import ExcelJS from "exceljs";

// ヘルパー関数: 有効な Date オブジェクトまたは文字列から日本時間文字列を返す
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
    const formalinSheet = workbook.addWorksheet("ホルマリン一覧");
    formalinSheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "ホルマリンKey", key: "key", width: 15 },
      { header: "出庫先", key: "place", width: 15 },
      { header: "ステータス", key: "status", width: 15 },
      { header: "有効期限", key: "expired", width: 20 },
      { header: "最終更新日", key: "timestamp", width: 20 },
      { header: "規格", key: "size", width: 10 },
      { header: "ロットナンバー", key: "lot_number", width: 15 },
      { header: "入庫日", key: "createdAt", width: 20 },
    ];

    formalinData.forEach((record) => {
      formalinSheet.addRow({
        id: record.id,
        key: record.key,
        place: record.place,
        status: record.status,
        expired: toJST(record.expired),
        timestamp: toJST(record.timestamp),
        size: record.size,
        lot_number: record.lot_number,
        createdAt: toJST(record.createdAt),
      });
    });

    // Historyシート作成
    const historySheet = workbook.addWorksheet("履歴");
    historySheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "ホルマリンKey", key: "key", width: 15 },
      { header: "更新者", key: "updated_by", width: 10 },
      { header: "更新日", key: "updated_at", width: 15 },
      { header: "変更前ステータス", key: "old_status", width: 20 },
      { header: "変更後ステータス", key: "new_status", width: 20 },
      { header: "変更前出庫先", key: "old_place", width: 15 },
      { header: "変更後出庫先", key: "new_place", width: 15 },
    ];

    historyData.forEach((record) => {
      historySheet.addRow({
        id: record.id,
        key: record.key,
        updated_by: record.updated_by,
        updated_at: toJST(record.updated_at),
        old_status: record.old_status,
        new_status: record.new_status,
        old_place: record.old_place,
        new_place: record.new_place,
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
