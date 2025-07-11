"use client";

import React, { useState, useRef } from "react";
import { InventoryDataBySizeType } from "../types/inventory";

// 共通の印刷時詳細情報スタイルコンポーネント
const PrintDetailInfo = ({ children }: { children: React.ReactNode }) => (
  <div className="hidden print:!block mt-2 text-[9px] text-gray-600 border-t pt-1">
    {children}
  </div>
);

// 詳細情報の行コンポーネント
const DetailRow = ({ label, value }: { label: string; value: string | number }) => (
  <span className="inline-block mr-2">
    {label}：{value}
  </span>
);

export default function InventoryPage() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [inventoryData, setInventoryData] = useState<InventoryDataBySizeType | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handleCheck = async () => {
    if (!startDate || !endDate) {
      setError("開始日と終了日を入力してください。");
      return;
    }
    setError("");
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!response.ok) throw new Error("データの取得に失敗しました。");
      const data = await response.json();
      setInventoryData(data);
    } catch (err) {
      console.error(err);
      setError("データ取得中にエラーが発生しました。");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadOutboundDetails = async () => {
    if (!startDate || !endDate) {
      setError("開始日と終了日を入力してください。");
      return;
    }
    setError("");
    try {
      const response = await fetch("/api/inventory/outbound-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!response.ok) throw new Error("出庫詳細の取得に失敗しました。");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `outbound-details_${startDate}_${endDate}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("出庫詳細のダウンロード中にエラーが発生しました。");
    }
  };

  return (
    <div className="min-h-screen p-8">
      {/* 印刷時に非表示にする入力フォーム */}
      <div className="print:hidden">
        <h1 className="text-3xl font-bold mb-4">在庫確認</h1>
        <div className="flex gap-4 mb-4">
          <div>
            <label className="block mb-2">開始日:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border p-2 rounded"
            />
          </div>
          <div>
            <label className="block mb-2">終了日:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border p-2 rounded"
            />
          </div>
        </div>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleCheck}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            入出庫数確認
          </button>
          <button
            onClick={handleDownloadOutboundDetails}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
          >
            出庫詳細Excelダウンロード
          </button>
        </div>
      </div>

      {/* 印刷対象のコンテンツ */}
      {inventoryData && (
        <div ref={printRef}>
          {/* 印刷時のみ表示されるヘッダー */}
          <div className="hidden print:block mb-3">
            <h1 className="text-xl font-bold text-center">入庫・在庫確認結果</h1>
            <p className="text-center text-gray-600 mt-1 text-sm">
              集計期間：{startDate} 〜 {endDate}
            </p>
          </div>

          <div className="mt-4 bg-white rounded-lg shadow p-4 relative">
            {/* 印刷ボタン - 右上に配置 */}
            <div className="absolute top-4 right-4 print:hidden">
              <button
                onClick={handlePrint}
                className="bg-green-500 text-white px-4 py-1.5 rounded hover:bg-green-600 transition-colors text-sm"
              >
                印刷する
              </button>
            </div>

            <h2 className="text-lg font-bold mb-4 border-b pb-2">規格別集計結果</h2>
            <div className="space-y-4">
              {Object.entries(inventoryData).map(([size, data]) => {
                // ── 入庫詳細をグループ化して合計 ──
                const groupedInbound = data.inboundDetails.reduce<Record<string, { lotNumber: string; inboundDate: string; updatedBy: string; count: number }>>((acc, detail) => {
                  const key = `${detail.lotNumber}-${detail.inboundDate}-${detail.updatedBy}`;
                  if (!acc[key]) {
                    acc[key] = { ...detail };
                  } else {
                    acc[key].count += detail.count;
                  }
                  return acc;
                }, {});
                const uniqueInboundDetails = Object.values(groupedInbound);

                // 出庫・在庫は既存の一意化ロジックが必要なら同様に実装
                const uniqueStockDetails = data.stockDetails;

                return (
                  <div key={size} className="border-b last:border-b-0 pb-3">
                    <h3 className="text-base font-semibold mb-2 text-gray-700">{size}</h3>
                    <div className="grid grid-cols-3 gap-3 pl-2 print:!gap-1.5">

                      {/* 入庫カード */}
                      <div className="bg-gray-50 p-2 rounded relative group print:!p-1.5 print:!rounded-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="block text-xs text-gray-600">入庫数</span>
                            <span className="text-lg font-bold">{data.inCount}</span>
                          </div>

                          {/* 画面表示時 */}
                          <div className="hidden group-hover:block print:hidden ml-4 text-xs text-gray-600">
                            {uniqueInboundDetails.map((detail, idx) => (
                              <div key={idx} className="mb-1">
                                <div>ロットナンバー：{detail.lotNumber}</div>
                                <div className="ml-1">
                                  入庫日：{detail.inboundDate}
                                  <span className="ml-1">入庫者：{detail.updatedBy}</span>
                                  <span className="ml-1">入庫数：{detail.count}個</span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* 印刷時 */}
                          <PrintDetailInfo>
                            {uniqueInboundDetails.map((detail, idx) => (
                              <div key={idx} className="mb-0.5">
                                <div className="font-semibold">ロットナンバー：{detail.lotNumber}</div>
                                <div className="ml-1">
                                  <DetailRow label="入庫日" value={detail.inboundDate} />
                                  <DetailRow label="入庫者" value={detail.updatedBy} />
                                  <DetailRow label="入庫数" value={`${detail.count}個`} />
                                </div>
                              </div>
                            ))}
                          </PrintDetailInfo>
                        </div>
                      </div>

                      {/* 出庫カード */}
                      <div className="bg-gray-50 p-2 rounded relative group print:p-1.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="block text-xs text-gray-600">出庫数</span>
                            <span className="text-lg font-bold">{data.outCount}</span>
                          </div>

                          {/* 画面表示時 */}
                          <div className="hidden group-hover:block print:hidden ml-4 text-xs text-gray-600">
                            {data.outboundDetails
                              .filter((d) => d.outCount > 0)
                              .map((d, idx) => (
                                <div key={idx} className="mb-1">
                                  <div>ロットナンバー：{d.lotNumber}</div>
                                  <div className="ml-1">出庫数：{d.outCount}個</div>
                                </div>
                              ))}
                          </div>

                          {/* 印刷時 */}
                          <PrintDetailInfo>
                            {data.outboundDetails
                              .filter((d) => d.outCount > 0)
                              .map((d, idx) => (
                                <div key={idx} className="mb-0.5">
                                  <div className="font-semibold">ロットナンバー：{d.lotNumber}</div>
                                  <div className="ml-1">
                                    <DetailRow label="出庫数" value={`${d.outCount}個`} />
                                  </div>
                                </div>
                              ))}
                          </PrintDetailInfo>
                        </div>
                      </div>

                      {/* 在庫カード */}
                      <div className="bg-gray-50 p-2 rounded relative group print:p-1.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="block text-xs text-gray-600">在庫数</span>
                            <span className="text-lg font-bold">{data.stockCount}</span>
                          </div>

                          {/* 画面表示時 */}
                          <div className="hidden group-hover:block print:hidden ml-4 text-xs text-gray-600">
                            {uniqueStockDetails.map((detail, idx) => (
                              <div key={idx} className="mb-1">
                                <span>ロットナンバー：{detail.lotNumber}</span>
                                <span className="ml-2">在庫数：{detail.count}個</span>
                              </div>
                            ))}
                          </div>

                          {/* 印刷時 */}
                          <PrintDetailInfo>
                            {uniqueStockDetails.map((detail, idx) => (
                              <div key={idx} className="mb-0.5">
                                <div className="font-semibold">ロットナンバー：{detail.lotNumber}</div>
                                <div className="ml-1">
                                  <DetailRow label="在庫数" value={`${detail.count}個`} />
                                </div>
                              </div>
                            ))}
                          </PrintDetailInfo>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
