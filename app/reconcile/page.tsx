"use client";

import React, { useState, useEffect } from "react";
import {
  ReconcileBySizeType,
  ReconcileSizeData,
  InventoryDataBySizeType,
} from "../types/inventory";

export default function ReconcilePage() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<ReconcileBySizeType | null>(null);
  // 在庫確認ページ（本番API）の出庫数。独立した経路で突き合わせるために取得する。
  const [realOutCount, setRealOutCount] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  // 印刷対象の規格（null のときは通常表示）
  const [printSize, setPrintSize] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!startDate || !endDate) {
      setError("開始日と終了日を入力してください。");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      const body = JSON.stringify({ startDate, endDate });
      const opts = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      };
      // 照合用集計と、本番の在庫確認APIを並行取得して突き合わせる
      const [reconcileRes, inventoryRes] = await Promise.all([
        fetch("/api/inventory/reconcile", opts),
        fetch("/api/inventory", opts),
      ]);
      if (!reconcileRes.ok || !inventoryRes.ok) {
        throw new Error("データの取得に失敗しました。");
      }
      const reconcileJson: ReconcileBySizeType = await reconcileRes.json();
      const inventoryJson: InventoryDataBySizeType = await inventoryRes.json();

      const realMap: Record<string, number> = {};
      for (const [size, sd] of Object.entries(inventoryJson)) {
        realMap[size] = sd.outCount;
      }
      setData(reconcileJson);
      setRealOutCount(realMap);
    } catch (err) {
      console.error(err);
      setError("集計中にエラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  };

  // 印刷対象がセットされたら、その規格カードだけを印刷する
  useEffect(() => {
    if (!printSize) return;
    const onAfterPrint = () => {
      document.body.classList.remove("printing-single");
      setPrintSize(null);
    };
    window.addEventListener("afterprint", onAfterPrint, { once: true });
    document.body.classList.add("printing-single");
    window.print();
    return () => {
      window.removeEventListener("afterprint", onAfterPrint);
      document.body.classList.remove("printing-single");
    };
  }, [printSize]);

  // 1規格ぶんのカードを描画（画面用・印刷用で共通利用）
  const renderCard = (size: string, sd: ReconcileSizeData) => {
    const real = realOutCount[size];
    // 在庫確認API と本画面の出庫数が一致するか（独立した経路の突き合わせ）
    const agreesWithInventory = real === undefined ? false : real === sd.outCount;
    return (
      <div className="reconcile-card bg-white rounded-lg shadow p-4">
        {/* 印刷時のみ表示：カード単体で意味が通るように集計期間を出す */}
        <div className="hidden print:block mb-2 text-xs text-gray-600">
          集計期間：{startDate} 〜 {endDate}
        </div>

        <div className="flex items-center justify-between border-b pb-2 mb-3">
          <h2 className="text-lg font-bold">{size}</h2>
          <div className="flex items-center gap-3">
            {agreesWithInventory ? (
              <span className="text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
                ✓ 在庫確認ページの出庫数と一致
              </span>
            ) : (
              <span className="text-sm font-semibold text-red-700 bg-red-100 px-3 py-1 rounded-full">
                ⚠ 在庫確認と不一致（在庫確認: {real ?? "?"}）
              </span>
            )}
            <button
              type="button"
              onClick={() => setPrintSize(size)}
              className="print:hidden bg-green-500 text-white text-sm px-3 py-1 rounded hover:bg-green-600 transition-colors"
            >
              印刷
            </button>
          </div>
        </div>

        {/* 規格合計の検算 */}
        <div className="flex flex-wrap items-center gap-2 text-base mb-4">
          <span className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            Excel合計 <strong className="text-lg ml-1">{sd.excelTotal}</strong>
          </span>
          <span className="text-gray-500">−</span>
          <span className="bg-amber-50 border border-amber-200 rounded px-3 py-2">
            月またぎ戻入 <strong className="text-lg ml-1">{sd.crossReturns}</strong>
          </span>
          <span className="text-gray-500">＝</span>
          <span className="bg-blue-50 border border-blue-200 rounded px-3 py-2">
            出庫数 <strong className="text-lg ml-1">{sd.outCount}</strong>
          </span>
        </div>

        {/* ロット別内訳 */}
        {sd.lots.length === 0 ? (
          <p className="text-sm text-gray-500">この期間の対象データはありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="border px-3 py-2">ロット番号</th>
                  <th className="border px-3 py-2 text-right">Excel合計</th>
                  <th className="border px-3 py-2 text-right">月またぎ戻入</th>
                  <th className="border px-3 py-2 text-right">出庫数（在庫確認）</th>
                  <th className="border px-3 py-2 text-right text-gray-500">
                    参考: 月内戻入
                  </th>
                </tr>
              </thead>
              <tbody>
                {sd.lots.map((lot) => (
                  <tr
                    key={lot.lotNumber}
                    className={lot.crossReturns > 0 ? "bg-amber-50" : ""}
                  >
                    <td className="border px-3 py-2">{lot.lotNumber}</td>
                    <td className="border px-3 py-2 text-right">{lot.excelTotal}</td>
                    <td className="border px-3 py-2 text-right">
                      {lot.crossReturns > 0 ? (
                        <span className="text-amber-700 font-semibold">
                          {lot.crossReturns}
                        </span>
                      ) : (
                        lot.crossReturns
                      )}
                    </td>
                    <td className="border px-3 py-2 text-right font-medium">
                      {lot.outCount}
                    </td>
                    <td className="border px-3 py-2 text-right text-gray-500">
                      {lot.inPeriodReturns}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">
              ※ 各行とも「Excel合計 − 月またぎ戻入 ＝ 出庫数」が成立します。
              月またぎ戻入があるロット（黄色）が、Excel合計と出庫数がズレる原因箇所です。
            </p>
          </div>
        )}

        {/* 参考: 識別可能な強制編集（手動の状態変更）件数 */}
        <div className="mt-4 border-t pt-3 text-sm text-gray-600">
          <p className="font-semibold text-gray-700 mb-1">
            参考: 強制編集（手動の状態変更）件数
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              提出済み → 出庫済み:{" "}
              <strong>{sd.forcedEdits.submittedToOutbound}</strong> 件
              <span className="text-gray-400 ml-1">
                （出庫数・Excelには影響しません）
              </span>
            </li>
            <li>
              提出済み → 入庫済み:{" "}
              <strong>{sd.forcedEdits.submittedToInbound}</strong> 件
              <span className="text-gray-400 ml-1">
                （強制戻入。上の戻入集計に含まれます）
              </span>
            </li>
          </ul>
          <p className="text-xs text-gray-400 mt-1">
            ※ 入庫済み→出庫済み（強制出庫）や 出庫済み→入庫済み（戻入）の手動編集は、
            通常の出庫／戻入と記録が同一のため区別できず、ここには含みません
            （いずれも出庫数とExcelの両方に同じ影響）。
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-8">
      {/* 画面表示用（印刷時は丸ごと非表示） */}
      <div className="reconcile-screen">
        {/* 処理中オーバーレイ */}
        {isLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-lg shadow px-6 py-4 text-center">
              <div className="flex items-center gap-3 justify-center">
                <div className="h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                <div className="text-gray-800 font-medium">集計中…</div>
              </div>
              <div className="mt-1 text-xs text-gray-500">画面を閉じずにお待ちください</div>
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold mb-4">出庫数照合（戻入集計）</h1>

        {/* 説明 */}
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700 leading-relaxed">
          <p className="font-semibold text-gray-800 mb-1">この画面でわかること</p>
          <p>
            「出庫詳細まとめVer」Excelの<strong>数量合計</strong>と、在庫確認ページの
            <strong>出庫数</strong>の関係を検算します。関係式は次のとおりです。
          </p>
          <p className="my-2 text-center font-mono text-base bg-white border rounded py-2">
            出庫数 ＝ まとめVer Excel合計 − 月またぎ戻入数
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>月またぎ戻入</strong>：前の月に出庫したホルマリンを、当月に戻入処理した本数。
              在庫確認の出庫数は当期間で −1 されますが、Excel には載らないため、これが両者の差の正体です。
            </li>
            <li>
              期内に「出庫→戻入」した往復分や、強制編集での出庫（入庫済み→出庫済み）は、
              Excel・出庫数の<strong>両方で同じ扱い</strong>になるため差を生みません
              （＝引く必要はありません）。
            </li>
            <li>
              「Excel合計」列は「出庫詳細まとめVer」Excelの数量合計と同じ計算です
            </li>
          </ul>
        </div>

        {/* 入力フォーム */}
        <div className="flex gap-4 mb-4 items-end">
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
          <button
            onClick={handleCheck}
            disabled={isLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            照合する
          </button>
        </div>
        {error && <p className="text-red-500 mb-4">{error}</p>}

        {/* 結果 */}
        {data && (
          <div className="mt-4 space-y-6">
            {Object.entries(data).map(([size, sd]) => (
              <div key={size}>{renderCard(size, sd)}</div>
            ))}
          </div>
        )}
      </div>

      {/* 印刷専用エリア（選択した規格カードのみ。印刷時だけ表示） */}
      {data && printSize && data[printSize] && (
        <div className="reconcile-print-area">{renderCard(printSize, data[printSize])}</div>
      )}

      {/* 単一カード印刷用のスタイル（body.printing-single のときだけ有効） */}
      <style jsx global>{`
        .reconcile-print-area {
          display: none;
        }
        @media print {
          body.printing-single .reconcile-screen {
            display: none !important;
          }
          body.printing-single header {
            display: none !important;
          }
          body.printing-single .reconcile-print-area {
            display: block !important;
          }
          body.printing-single .reconcile-card {
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
