"use client";

import React, { useState, useRef } from "react";
import { InventoryDataBySizeType } from "../types/inventory";

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!response.ok) {
        throw new Error("データの取得に失敗しました。");
      }

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
        <button
          onClick={handleCheck}
          className="bg-blue-500 text-white px-4 py-2 rounded mb-4 hover:bg-blue-600 transition-colors"
        >
          入出庫数確認
        </button>
      </div>

      {/* 印刷対象のコンテンツ */}
      {inventoryData && (
        <div ref={printRef}>
          {/* 印刷時のみ表示されるヘッダー */}
          <div className="hidden print:block mb-3">
            <h1 className="text-xl font-bold text-center">在庫確認結果</h1>
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
              {Object.entries(inventoryData).map(([size, data]) => (
                <div key={size} className="border-b last:border-b-0 pb-3">
                  <h3 className="text-base font-semibold mb-2 text-gray-700">{size}</h3>
                  <div className="grid grid-cols-4 gap-3 pl-2">
                    <div className="bg-gray-50 p-2 rounded">
                      <span className="block text-xs text-gray-600">入庫数</span>
                      <span className="text-lg font-bold">{data.inCount}</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <span className="block text-xs text-gray-600">出庫数</span>
                      <span className="text-lg font-bold">{data.outCount + data.submissionCount}</span>
                      <span className="block text-xs text-gray-500">
                        （出庫済み数：{data.outCount} + 提出済み数：{data.submissionCount}）
                      </span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <span className="block text-xs text-gray-600">在庫数</span>
                      <span className="text-lg font-bold">{data.stockCount}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}