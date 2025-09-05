// app/list/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback, KeyboardEvent } from "react";
import FormalinTable from "../components/FormalinTable";
import Modal from "../components/Modal";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { HistoryEntry, Formalin } from "../types/Formalin";
import { getFormalinPage, getHistoriesByFormalinId } from "../services/formalinService";

export default function ListPage() {
  const [showSubmitted, setShowSubmitted] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Formalin[]>([]);
  const [loading, setLoading] = useState(false);

  const [filteredCount, setFilteredCount] = useState(0);

  // 履歴モーダル
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<number | null>(null);
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 検索モード
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(
    async (p = page, ps = pageSize, include = showSubmitted) => {
      setLoading(true);
      try {
        const res = await getFormalinPage(p, ps, include ? { includeSubmitted: true } : {});
        setRows(res.items);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, showSubmitted]
  );

  // 初回 & トグル変更時
  useEffect(() => {
    setPage(1);
  }, [showSubmitted]);

  useEffect(() => {
    void load(page, pageSize, showSubmitted);
  }, [page, pageSize, showSubmitted, load]);

  // 履歴フェッチ
  useEffect(() => {
    const run = async () => {
      if (!selectedHistoryKey) return;
      try {
        setHistoryLoading(true);
        const list = await getHistoriesByFormalinId(selectedHistoryKey);
        setHistoryList(list);
      } finally {
        setHistoryLoading(false);
      }
    };
    void run();
  }, [selectedHistoryKey]);

  // バーコードでグローバル検索（1件だけ）
  const handleBarcodeInput = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = (e.target as HTMLInputElement).value.trim();
    if (!code) return;

    try {
      const parsed = parseFormalinCode(code, { checkExpiration: false });
      if (!parsed) {
        setErrorMessage("無効なコードです。");
        setIsSearchActive(false);
        void load(1, pageSize, showSubmitted);
        return;
      }
      setErrorMessage("");

      const { lotNumber, boxNumber, serialNumber, productCode } = parsed;
      const res = await getFormalinPage(1, 1, {
        includeSubmitted: true,
        lotNumber,
        boxNumber,
        key: serialNumber,
        productCode,
      });

      if (res.total === 0) {
        setErrorMessage("該当のホルマリンは見つかりません。");
        setIsSearchActive(false);
        void load(1, pageSize, showSubmitted);
        return;
      }

      // 1件だけ表示（検索モード）
      setIsSearchActive(true);
      setRows(res.items);
      setTotal(1);
      setPage(1);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "検索に失敗しました");
      setIsSearchActive(false);
      void load(1, pageSize, showSubmitted);
    }
  };

  const clearSearch = async () => {
    setIsSearchActive(false);
    setErrorMessage("");
    setPage(1);
    await load(1, pageSize, showSubmitted);
  };

  const viewList = useMemo(() => rows, [rows]);

  const effectiveTotal = isSearchActive ? 1 : total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));

  return (
    <div className={selectedHistoryKey ? "modal-open" : ""}>
      <h1 className="text-3xl font-bold mt-4 mb-4 ml-10">ホルマリン一覧ページ</h1>

      <div className="ml-10 mb-4 flex items-center gap-3 hide-on-print">
        <button
          onClick={() => setShowSubmitted((v) => !v)}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          {showSubmitted ? "提出済みを除いて表示" : "提出済みも含めて表示"}
        </button>

        <input
          type="text"
          placeholder="バーコードを読ませると全体検索します（Enter）"
          onKeyDown={handleBarcodeInput}
          className="border border-gray-300 rounded p-2 w-1/3"
        />
        {isSearchActive && (
          <button onClick={clearSearch} className="px-3 py-2 border rounded">
            検索解除
          </button>
        )}
        {errorMessage && <p className="text-red-500 text-sm">{errorMessage}</p>}

        {!isSearchActive && (
          <>
            <label className="text-sm ml-4">件数/ページ:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-gray-300 rounded p-2"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={300}>300</option>
            </select>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={isSearchActive || page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            前へ
          </button>
          <span className="text-gray-700">
            {isSearchActive ? 1 : page} / {totalPages}（全 {effectiveTotal} 件）
          </span>
          <button
            disabled={isSearchActive || page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            次へ
          </button>
        </div>
      </div>

      <div className="ml-10">
        <FormalinTable
          formalinList={viewList}
          showLotNumber
          showHistoryButton
          onHistoryClick={(id) => setSelectedHistoryKey(id)}
          onFilteredCountChange={setFilteredCount}
        />
        <div className="text-sm text-gray-600 mt-2">表示件数: {filteredCount}件</div>
      </div>

      {selectedHistoryKey && (
        <Modal onClose={() => setSelectedHistoryKey(null)}>
          <div className="modal-print p-4">
            <h2 className="text-xl mb-4">更新履歴</h2>
            {historyLoading ? (
              <p>読み込み中...</p>
            ) : historyList.length === 0 ? (
              <p>履歴はありません</p>
            ) : (
              <ul className="list-disc list-inside space-y-2">
                {[...historyList]
                  .sort(
                    (a, b) =>
                      new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime()
                  )
                  .map((h, idx) => (
                    <li key={idx}>
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
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
