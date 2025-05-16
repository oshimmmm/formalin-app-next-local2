"use client";
import React, { useContext, useState, KeyboardEvent } from "react";
import FormalinTable from "../components/FormalinTable";
import Modal from "../components/Modal";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { HistoryEntry } from "../types/Formalin";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function ListPage() {
  const { formalinList } = useContext(FormalinContext)!;

  // searchUniqueId: "lotNumber - boxNumber - serialNumber" の形式の一意識別子
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<number | null>(null);
  const [searchCode, setSearchCode] = useState("");
  const [searchUniqueId, setSearchUniqueId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // バーコード入力処理
  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      try {
        // 期限チェックをスキップするオプションを付与
        const parsed = parseFormalinCode(code, { checkExpiration: false });
        if (parsed === null) {
          setErrorMessage("このホルマリンはリストにありません。");
          setSearchUniqueId(null);
        } else {
          setErrorMessage("");
          // lotNumber, boxNumber, serialNumber, productCode の4つを組み合わせた一意識別子を作成
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

  // 検索窓用
  // searchUniqueId がセットされている場合、その組み合わせに合致するものだけフィルタリング
  const filteredList = searchUniqueId
    ? formalinList.filter(
        (f) => `${f.lotNumber} - ${f.boxNumber} - ${f.key} - ${f.productCode}` === searchUniqueId
      )
    : formalinList;

  
    // 履歴ボタン
  const handleHistoryClick = (key: number) => {
    setSelectedHistoryKey(key);
  };

  // データベースのHistoryテーブルにlot_numberとbox_NumberをINSERTしていないのでsearchUniqueIdを使って該当のHistoryを取得できない。
  // そのため、selectedHistoryKeyを使ってFormalinのidを取得して、Formalinのhistoriesを取得している。
  // 選択されたキーで formalin を探す
  const selectedFormalin = selectedHistoryKey
    ? formalinList.find((f) => f.id === selectedHistoryKey)
    : null;
  const history: HistoryEntry[] = selectedFormalin?.histories ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">ホルマリン一覧ページ</h1>
      <div className="ml-10">
        <div className="flex items-center space-x-2 hide-on-print mb-2">
          <input
            type="text"
            placeholder="バーコードを読ませると検索できます"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            onKeyDown={handleBarcodeInput}
            className="border border-gray-300 rounded p-2 w-1/4"
          />
          <button
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            印刷
          </button>
        </div>
  
        {errorMessage && <p className="text-red-500 text-xl">{errorMessage}</p>}
  
        <FormalinTable
          formalinList={filteredList}
          showLotNumber={true}
          showHistoryButton={true}
          onHistoryClick={handleHistoryClick}
        />
      </div>
  
      {/* 履歴モーダル */}
      {selectedHistoryKey && (
        <Modal onClose={() => setSelectedHistoryKey(null)}>
          <h2 className="text-xl mb-4">更新履歴: {selectedFormalin ? `${selectedFormalin.lotNumber}-${selectedFormalin.boxNumber}-${selectedFormalin.key}-${selectedFormalin.size}` : ""}</h2>
          {(() => {
            if (history.length === 0) {
              return <p>履歴はありません</p>;
            }
            // 配列をコピーして日時降順にソート
            const sortedHistory = [...history].sort((a, b) => {
              const aTime = new Date(a.updatedAt ?? "").getTime();
              const bTime = new Date(b.updatedAt ?? "").getTime();
              return bTime - aTime;
            });

            return (
              <ul className="list-disc list-inside">
                {sortedHistory.map((h, index) => (
                  <li key={index}>
                    <div>更新者: {h.updatedBy}</div>
                    <div>
                      更新日時:{" "}
                      {h.updatedAt
                        ? new Date(h.updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
                        : "不明"}
                    </div>
                    <div>旧ステータス: {h.oldStatus}</div>
                    <div>新ステータス: {h.newStatus}</div>
                    <div>旧場所: {h.oldPlace}</div>
                    <div>新場所: {h.newPlace}</div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
