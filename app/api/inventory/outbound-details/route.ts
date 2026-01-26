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
    // 列定義（共通）: 元の詳細版（1本1行）
    const columns = [
      { header: "ホルマリンKey", key: "combinedKey", width: 20 },
      { header: "規格", key: "size", width: 12 },
      { header: "出庫者", key: "updated_by", width: 10 },
      { header: "更新日", key: "updated_at", width: 20 },
      { header: "出庫先", key: "new_place", width: 15 },
    ];

    const sizes = ["25ml中性緩衝", "生検用 30ml", "リンパ節用 40ml"] as const;
    const titleBySize: Record<(typeof sizes)[number], string> = {
      "25ml中性緩衝": "出庫管理台帳（集計）25ml中性緩衝ホルマリン",
      "生検用 30ml": "出庫管理台帳（集計）生検用 30mlホルマリン",
      "リンパ節用 40ml": "出庫管理台帳（集計）リンパ節用 40mlホルマリン",
    };
    const noteText = "※数量は、出庫した実績回数です";

    // SIZES 配列に従ってシートを追加
    for (const size of sizes) {
      // ① シート作成（シート名をサイズに）
      const sheet = workbook.addWorksheet(size);

      // ② ヘッダー行を定義（これが 1 行目に入る）
      sheet.columns = columns;

      // ③ タイトル行を先頭に挿入
      sheet.insertRow(1, [titleBySize[size]]);
      sheet.mergeCells("A1:E1");
      const titleCell = sheet.getCell("A1");
      titleCell.font = { size: 15, bold: true };
      titleCell.alignment = { horizontal: "left" };

      // ④ このサイズの出庫レコードだけ取り出し、時系列で並べる
      const rows = validOutbounds
        .filter((r) => r.formalin?.size === size)
        .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());

      // ⑤ データ行を 3 行目以降に追加（詳細版）
      for (const record of rows) {
        sheet.addRow({
          combinedKey: record.formalin
            ? `${record.formalin.lot_number} - ${record.formalin.box_number} - ${record.formalin.key}`
            : "",
          size: record.formalin?.size || "",
          updated_by: record.updated_by,
          updated_at: toJST(record.updated_at),
          new_place: record.new_place,
        });
      }

      // ⑥ 2 行目以降にだけ罫線を適用
      const dataEndRowNumber = 2 + rows.length;
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
