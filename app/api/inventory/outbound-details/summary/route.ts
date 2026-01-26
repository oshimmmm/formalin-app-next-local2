import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import ExcelJS from "exceljs";

// 日付のみ（JST）を文字列で返す
function toJSTDate(date: unknown): string {
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
  } else if (typeof date === "string") {
    const d = new Date(date);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
  }
  return "";
}

// 並び替え用のJST日付キー（YYYY-MM-DD）
function toJSTDateKey(date: unknown): string {
  const d = typeof date === "string" ? new Date(date) : (date instanceof Date ? date : null);
  if (!d || isNaN(d.getTime())) return "";
  const tzDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, "0");
  const day = String(tzDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(request: Request) {
  try {
    const { startDate, endDate } = await request.json();

    // JSTの日付範囲をUTCに変換して検索（DBはUTC相当で格納）
    const start = new Date(`${startDate}T00:00:00+09:00`);
    const end = new Date(`${endDate}T23:59:59.999+09:00`);

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

    // 期間中の履歴を取得
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
        wasCounted = initialWasCounted.get(fId) ?? false;
      }

      const oldS = record.old_status ?? "";
      const newS = record.new_status ?? "";

      // 真の出庫イベント
      if (
        !wasCounted &&
        oldS === "入庫済み" &&
        (newS === "出庫済み" || newS === "提出済み")
      ) {
        validOutbounds.push(record);
        wasCounted = true;
      }
      // 戻入イベント
      else if (wasCounted && oldS === "出庫済み" && newS === "入庫済み") {
        const index = validOutbounds.findIndex(r => r.formalinId === fId);
        if (index !== -1) {
          validOutbounds.splice(index, 1);
        }
        wasCounted = false;
      }
      // 強制変更での戻入
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
      // 「提出済み → 出庫済み」の強制変更は無視
      else if (oldS === "提出済み" && newS === "出庫済み") {
        // 何もしない
      }
    }

    // Excelワークブック作成（集計版）
    const workbook = new ExcelJS.Workbook();
    const columns = [
      { header: "ロット番号", key: "lot_number", width: 14 },
      { header: "日付", key: "date", width: 12 },
      { header: "出庫先", key: "new_place", width: 18 },
      { header: "出庫者", key: "updated_by", width: 12 },
      { header: "数量", key: "count", width: 8 },
    ];

    const sizes = ["25ml中性緩衝", "生検用 30ml", "リンパ節用 40ml"] as const;
    const titleBySize: Record<(typeof sizes)[number], string> = {
      "25ml中性緩衝": "出庫管理台帳（集計）25ml中性緩衝ホルマリン",
      "生検用 30ml": "出庫管理台帳（集計）生検用 30mlホルマリン",
      "リンパ節用 40ml": "出庫管理台帳（集計）リンパ節用 40mlホルマリン",
    };
    const noteText = "※数量は、出庫した実績回数です";

    for (const size of sizes) {
      const sheet = workbook.addWorksheet(size);
      sheet.columns = columns;

      sheet.insertRow(1, [titleBySize[size]]);
      sheet.mergeCells("A1:E1");
      const titleCell = sheet.getCell("A1");
      titleCell.font = { size: 15, bold: true };
      titleCell.alignment = { horizontal: "left" };

      const targetRows = validOutbounds.filter((r) => r.formalin?.size === size);

      type GroupRow = {
        lot_number: string;
        date: string;
        new_place: string;
        updated_by: string;
        count: number;
        _dateKey: string; // ソート用
      };

      const groupMap = new Map<string, GroupRow>();

      for (const record of targetRows) {
        const lot = record.formalin?.lot_number ?? "";
        const dateOnly = toJSTDate(record.updated_at);
        const dateKey = toJSTDateKey(record.updated_at);
        const place = record.new_place ?? "";
        const user = record.updated_by ?? "";

        const key = `${lot}|${user}|${dateKey}|${place}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            lot_number: lot,
            date: dateOnly,
            new_place: place,
            updated_by: user,
            count: 1,
            _dateKey: dateKey,
          });
        } else {
          const g = groupMap.get(key)!;
          g.count += 1;
        }
      }

      const aggregated = Array.from(groupMap.values()).sort((a, b) => {
        if (a._dateKey !== b._dateKey) return a._dateKey.localeCompare(b._dateKey);
        if (a.lot_number !== b.lot_number) return a.lot_number.localeCompare(b.lot_number, "ja");
        if (a.updated_by !== b.updated_by) return a.updated_by.localeCompare(b.updated_by, "ja");
        return a.new_place.localeCompare(b.new_place, "ja");
      });

      for (const row of aggregated) {
        sheet.addRow(row);
      }

      const dataEndRowNumber = 2 + aggregated.length;
      for (let rowNumber = 2; rowNumber <= dataEndRowNumber; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }

      const noteRow = sheet.addRow([noteText]);
      sheet.mergeCells(`A${noteRow.number}:E${noteRow.number}`);
      noteRow.getCell(1).alignment = { horizontal: "left" };
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="outbound-details-summary_${startDate}_${endDate}.xlsx"`
      }
    });

  } catch (error) {
    console.error("Outbound details summary error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
