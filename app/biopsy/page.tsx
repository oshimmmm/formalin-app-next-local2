"use client";

import React, { useState, useContext, useEffect, KeyboardEvent } from "react";
import { FormalinContext } from "../Providers/FormalinProvider";
import FormalinTable from "../components/FormalinTable";
import Modal from "../components/Modal";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { HistoryEntry } from "../types/Formalin";

const SIZE = "生検用 30ml";

type BiopsyRow = {
  lotNumber: string;
  boxNumber: string;
  serial: string;
  updatedAt: string; // ISO
  returnBy: string;
};

const formatJST = (iso: string) => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

export default function BiopsyPage() {
  const { formalinList, fetchFormalinList } = useContext(FormalinContext)!;

  // --- 指定日ベースの集計/一覧 ---
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [initialCount, setInitialCount] = useState<number | null>(null);
  const [finalCount, setFinalCount] = useState<number | null>(null);
  const [rows, setRows] = useState<BiopsyRow[]>([]);

  // --- 右側：サイズ限定テーブル（list風 UI） ---
  const [showSizeTable, setShowSizeTable] = useState(false);
  const [showSubmitted, setShowSubmitted] = useState(false); // 提出済みトグル
  const [filteredCount, setFilteredCount] = useState(0);

  // バーコード検索
  const [searchCode, setSearchCode] = useState("");
  const [searchUniqueId, setSearchUniqueId] = useState<string | null>(null);
  const [sizeTableErrorMessage, setSizeTableErrorMessage] = useState("");

  // 履歴モーダル
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<number | null>(null);

  // 指定日データ取得
  const fetchAll = async () => {
    if (!date) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/biopsy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }), // YYYY-MM-DD（JST想定）
      });
      const json = (await res.json()) as {
        initialCount?: number;
        finalCount?: number;
        rows?: BiopsyRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "取得に失敗しました。");

      setInitialCount(json.initialCount ?? 0);
      setFinalCount(json.finalCount ?? 0);
      setRows(json.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "データの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // 「一覧を表示」クリック：サイズ限定テーブル（生検用 30ml）を表示＋データ取得
  const handleShowSizeTable = async () => {
    setShowSizeTable(true);
    await fetchFormalinList(showSubmitted);
  };

  // トグル変更時に再取得（テーブル表示中のみ）
  useEffect(() => {
    if (showSizeTable) {
      fetchFormalinList(showSubmitted);
    }
  }, [showSubmitted, showSizeTable, fetchFormalinList]);

  // バーコード読み込み
  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = (e.target as HTMLInputElement).value.trim();
    try {
      const parsed = parseFormalinCode(code, { checkExpiration: false });
      if (parsed) {
        setSizeTableErrorMessage("");
        const uniqueId = `${parsed.lotNumber} - ${parsed.boxNumber} - ${parsed.serialNumber} - ${parsed.productCode}`;
        setSearchUniqueId(uniqueId);
      } else {
        setSizeTableErrorMessage("このホルマリンはリストにありません。");
        setSearchUniqueId(null);
      }
    } catch (err) {
      setSizeTableErrorMessage(
        err instanceof Error ? err.message : "不明なエラーが発生しました"
      );
      setSearchUniqueId(null);
    }
  };

  // サイズ限定リスト
  const biopsyOnlyList = formalinList.filter((f) => f.size === SIZE);

  // 一意識別子で絞り込み
  const filteredList = searchUniqueId
    ? biopsyOnlyList.filter(
      (f) =>
        `${f.lotNumber} - ${f.boxNumber} - ${f.key} - ${f.productCode}` ===
        searchUniqueId
    )
    : biopsyOnlyList;

  const formatStartOfDayLabelJST = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map((v) => Number(v));
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}年${mm}月${dd}日 00:00`;
  };

  const formatEndOfDayLabelJST = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map((v) => Number(v));
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}年${mm}月${dd}日 00:00`;
  };

  // 履歴表示用
  const selectedFormalin = selectedHistoryKey
    ? formalinList.find((f) => f.id === selectedHistoryKey)
    : null;
  const history: HistoryEntry[] = selectedFormalin?.histories ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 ml-10">生検用 30ml 専用ページ</h1>

      {/* 上部バー（左：日付＋表示 / 右：一覧を表示） */}
      <div className="flex items-center justify-between mb-6 mt-6 w-full max-w-4xl mx-auto px-2">
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded p-2"
          />
          <button
            onClick={fetchAll}
            disabled={!date || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? "読み込み中…" : "この日の手術室状況を表示"}
          </button>
        </div>

        <div>
          <button
            onClick={handleShowSizeTable}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition"
          >
            一覧を表示
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {/* 指定日 集計/一覧 */}
      {initialCount !== null && finalCount !== null && (
        <div className="space-y-6 mb-10">
          {/* ① 開始時点（JST 00:00） */}
          <div className="bg-white shadow rounded p-4">
            <h2 className="font-semibold mb-2">
              {formatStartOfDayLabelJST(date)}時点の手術室・出庫済み個数（{SIZE}）
            </h2>
            <p className="text-3xl">{initialCount} 本</p>
          </div>

          {/* ② 指定日 一覧（3列：識別子 / 更新日時 / 提出元） */}
          <div className="bg-white shadow rounded p-4">
            <h2 className="font-semibold mb-3">手術室からの提出 一覧</h2>
            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-3 py-2 text-left">
                      ホルマリン（lot - box - key）
                    </th>
                    <th className="border px-3 py-2 text-left">提出日時</th>
                    <th className="border px-3 py-2 text-left">提出元</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="border px-3 py-2 text-center" colSpan={3}>
                        データなし
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={i}>
                        <td className="border px-3 py-2">
                          {`${r.lotNumber || ""} - ${r.boxNumber || ""} - ${r.serial || ""}`}
                        </td>
                        <td className="border px-3 py-2">
                          {formatJST(r.updatedAt)}
                        </td>
                        <td className="border px-3 py-2">{r.returnBy || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ③ 終了時点（JST 23:59:59.999） */}
          <div className="bg-white shadow rounded p-4">
            <h2 className="font-semibold mb-2">
              {formatEndOfDayLabelJST(date)}時点の手術室・出庫済み個数（{SIZE}）
            </h2>
            <p className="text-3xl">{finalCount} 本</p>
          </div>
        </div>
      )}

      {/* サイズ=生検用 30ml の FormalinTable（履歴ボタン付き） */}
      {showSizeTable && (
        <div className="bg-white shadow rounded p-4">
          <div className="mb-4 flex items-center space-x-2">
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

            {/* 件数 */}
            <span className="text-gray-600 ml-2">表示件数: {filteredCount}件</span>
          </div>

          {sizeTableErrorMessage && (
            <p className="text-red-500 text-sm mb-2">{sizeTableErrorMessage}</p>
          )}

          <FormalinTable
            formalinList={filteredList}
            showLotNumber={true}
            showHistoryButton={true}
            onHistoryClick={(id) => setSelectedHistoryKey(id)}
            onFilteredCountChange={setFilteredCount}
          />
        </div>
      )}

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
