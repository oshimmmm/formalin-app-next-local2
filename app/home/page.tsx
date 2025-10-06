// app/home/page.tsx
"use client";

import { useState, useCallback, useEffect, useMemo, KeyboardEvent } from "react";
import FormalinTable from "../components/FormalinTable";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { Formalin } from "../types/Formalin";
import { getFormalinPage } from "../services/formalinService";

export default function HomePage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Formalin[]>([]);
  const [loading, setLoading] = useState(false);

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchRows, setSearchRows] = useState<Formalin[]>([]);

  const [searchCode, setSearchCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // ★ 全ページ通して古い順（timestamp ASC, NULLS LAST）
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFormalinPage(page, pageSize, {
        status: "出庫済み",
        sort: "timestampAsc", // ← これだけでOK
      });
      setRows(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  // バーコード検索（全体検索 → 1件だけ）
  const handleBarcodeInput = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = (e.target as HTMLInputElement).value.trim();

    try {
      const parsed = parseFormalinCode(code, { checkExpiration: false });
      if (!parsed) {
        setErrorMessage("無効なコードです。");
        setIsSearchActive(false);
        setSearchRows([]);
        return;
      }
      setErrorMessage("");

      const { lotNumber, boxNumber, serialNumber, productCode } = parsed;
      const res = await getFormalinPage(1, 1, {
        lotNumber,
        boxNumber,
        key: serialNumber,
        productCode,
      });
      if (res.total === 0) {
        setErrorMessage("該当のホルマリンは見つかりません。");
        setIsSearchActive(false);
        setSearchRows([]);
        return;
      }
      setIsSearchActive(true);
      setSearchRows(res.items);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "検索に失敗しました。");
      setIsSearchActive(false);
      setSearchRows([]);
    }
  };

  // 表示用（検索時はそのまま、通常は 25ml中性緩衝 を除外）
  const viewList = useMemo(() => {
    if (isSearchActive) return searchRows;
    return rows.filter((f) => f.size !== "25ml中性緩衝");
  }, [isSearchActive, rows, searchRows]);

  const effectiveTotal = isSearchActive ? 1 : total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 ml-10">ホーム</h1>
      <p className="text-base text-gray-500 mb-4 ml-10">
        ＊どこかに出庫して、返ってきていないホルマリン（25ml中性緩衝を除く）を表示
      </p>

      <div className="ml-10 mb-3 flex items-center gap-3">
        <input
          type="text"
          placeholder="バーコードを読ませると全体検索します（Enter）"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          onKeyDown={handleBarcodeInput}
          className="border border-gray-300 rounded p-2 w-1/3 hide-on-print"
        />
        {isSearchActive && (
          <button
            className="px-3 py-1 border rounded"
            onClick={() => {
              setIsSearchActive(false);
              setSearchRows([]);
              setErrorMessage("");
              setSearchCode("");
              setPage(1);
              void load();
            }}
          >
            検索解除
          </button>
        )}
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}

        {!isSearchActive && (
          <>
            <label className="ml-6 text-sm text-gray-600">件数/ページ:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
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
        <FormalinTable formalinList={viewList} showScheduledDate />
      </div>
    </div>
  );
}
