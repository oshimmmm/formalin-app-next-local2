"use client";
import React, { useContext, useState, KeyboardEvent } from "react";
import FormalinTable from "../components/FormalinTable";
import Modal from "../components/Modal";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { HistoryEntry } from "../types/Formalin"; // 型をimport
import { FormalinContext } from "../Providers/FormalinProvider";

export default function ListPage() {
  const { formalinList } = useContext(FormalinContext)!;

  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(null);
  const [searchCode, setSearchCode] = useState("");
  const [searchSerialNumber, setSearchSerialNumber] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Enter押下でバーコード解析
  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      const parsed = parseFormalinCode(code);
      if (parsed) {
        setErrorMessage("");
        setSearchSerialNumber(parsed.serialNumber);
      } else {
        setErrorMessage("このホルマリンはリストにありません。");
        setSearchSerialNumber(null);
      }
    }
  };

  // serialNumber があればそれに合致するものだけフィルタ
  const filteredList = searchSerialNumber
    ? formalinList.filter((f) => f.key === searchSerialNumber)
    : formalinList;

  // 履歴ボタン
  const handleHistoryClick = (key: string) => {
    setSelectedHistoryKey(key);
  };

  // 選択されたキーで formalin を探す
  const selectedFormalin = selectedHistoryKey
    ? formalinList.find((f) => f.key === selectedHistoryKey)
    : null;

  // formalin の履歴配列 (HistoryData[])
  const history: HistoryEntry[] = selectedFormalin?.histories ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">詳細一覧ページ</h1>
      <div className="ml-10">
        <input
          type="text"
          placeholder="バーコードを読み込んでください"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          onKeyDown={handleBarcodeInput} // onKeyPress → onKeyDown
          className="border border-gray-300 rounded p-2 mb-2 w-1/4"
        />
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}

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
          <h2 className="text-xl mb-4">更新履歴: {selectedHistoryKey}</h2>
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
