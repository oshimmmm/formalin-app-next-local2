"use client";

import React, { useContext, useState, useEffect, KeyboardEvent } from "react";
import FormalinTable from "../components/FormalinTable";
import Modal from "../components/Modal";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { HistoryEntry } from "../types/Formalin";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function ListPage() {
  const { formalinList, fetchFormalinList } = useContext(FormalinContext)!;
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [filteredCount, setFilteredCount] = useState(0);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<number | null>(null);
  const [searchCode, setSearchCode] = useState("");
  const [searchUniqueId, setSearchUniqueId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // status !== '提出済み' / 全件 の切り替えフェッチ
  useEffect(() => {
    fetchFormalinList(showSubmitted);
  }, [showSubmitted, fetchFormalinList]);

  // バーコード入力処理
  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      try {
        const parsed = parseFormalinCode(code, { checkExpiration: false });
        if (parsed === null) {
          setErrorMessage("このホルマリンはリストにありません。");
          setSearchUniqueId(null);
        } else {
          setErrorMessage("");
          const uniqueId = `${parsed.lotNumber} - ${parsed.boxNumber} - ${parsed.serialNumber} - ${parsed.productCode}`;
          setSearchUniqueId(uniqueId);
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("不明なエラーが発生しました");
        }
        setSearchUniqueId(null);
      }
    }
  };

  // 一意識別子によるフィルタリング
  const filteredList = searchUniqueId
    ? formalinList.filter(
        (f) =>
          `${f.lotNumber} - ${f.boxNumber} - ${f.key} - ${f.productCode}` ===
          searchUniqueId
      )
    : formalinList;

  // 「履歴を見る」ボタン
  const handleHistoryClick = (key: number) => {
    setSelectedHistoryKey(key);
  };

  // 選択された試薬の履歴取得
  const selectedFormalin = selectedHistoryKey
    ? formalinList.find((f) => f.id === selectedHistoryKey)
    : null;
  const history: HistoryEntry[] = selectedFormalin?.histories ?? [];

  return (
    <div className={selectedHistoryKey ? "modal-open" : ""}>
      <h1 className="text-3xl font-bold mt-4 mb-4 ml-10">
        ホルマリン一覧ページ
      </h1>

      <div className="ml-10 mb-4 flex items-center space-x-2 hide-on-print">
        {/* 提出済みトグル */}
        <button
          onClick={() => setShowSubmitted((prev) => !prev)}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          {showSubmitted ? "提出済みを除いて表示" : "提出済みも含めて表示"}
        </button>

        {/* バーコード検索 */}
        <input
          type="text"
          placeholder="バーコードを読ませると検索できます"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          onKeyDown={handleBarcodeInput}
          className="border border-gray-300 rounded p-2 w-1/4"
        />

        {/* 印刷ボタン */}
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          印刷
        </button>

        {/* 表示件数 */}
        <span className="text-gray-600 ml-2">
          表示件数: {filteredCount}件
        </span>
      </div>

      {errorMessage && (
        <p className="text-red-500 text-xl ml-10">{errorMessage}</p>
      )}

      <div className="ml-10">
        <FormalinTable
          formalinList={filteredList}
          showLotNumber={true}
          showHistoryButton={true}
          onHistoryClick={handleHistoryClick}
          onFilteredCountChange={setFilteredCount}
        />
      </div>

      {/* 履歴モーダル */}
      {selectedHistoryKey && (
        <Modal onClose={() => setSelectedHistoryKey(null)}>
          <div className="modal-print p-4">
            <h2 className="text-xl mb-4">
              更新履歴:{" "}
              {selectedFormalin
                ? `${selectedFormalin.lotNumber}-${selectedFormalin.boxNumber}-${selectedFormalin.key}-${selectedFormalin.size}`
                : ""}
            </h2>

            {history.length === 0 ? (
              <p>履歴はありません</p>
            ) : (
              <ul className="list-disc list-inside space-y-2">
                {[...history]
                  .sort(
                    (a, b) =>
                      new Date(b.updatedAt || "").getTime() -
                      new Date(a.updatedAt || "").getTime()
                  )
                  .map((h, idx) => (
                    <li key={idx}>
                      <div>更新者: {h.updatedBy}</div>
                      <div>
                        更新日時:{" "}
                        {h.updatedAt
                          ? new Date(h.updatedAt).toLocaleString("ja-JP", {
                              timeZone: "Asia/Tokyo",
                            })
                          : "不明"}
                      </div>
                      <div>旧ステータス: {h.oldStatus}</div>
                      <div>新ステータス: {h.newStatus}</div>
                      <div>旧場所: {h.oldPlace}</div>
                      <div>新場所: {h.newPlace}</div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
