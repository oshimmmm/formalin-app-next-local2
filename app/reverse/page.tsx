// app/reverse/page.tsx
"use client";

import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { Formalin } from "../types/Formalin";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import FormalinTable from "../components/FormalinTable";
import { FormalinContext } from "../Providers/FormalinProvider";
import { getFormalinPage } from "../services/formalinService";

export default function ReversePage() {
  // ユーザー名
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // 更新(入庫済みに戻す)は Context の editFormalin を利用
  const { editFormalin } = React.useContext(FormalinContext)!;

  // 入力
  const inputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // ページング & データ
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Formalin[]>([]);
  const [loading, setLoading] = useState(false);

  // 初回フォーカス
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 一覧ロード（出庫済みのみ、サーバー側で timestamp DESC）
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFormalinPage(page, pageSize, { status: "出庫済み" });
      setRows(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  // バーコード読み取り(Enter)
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;

    const target = e.target as HTMLInputElement;
    const code = target.value.trim();
    target.value = "";
    if (!code) return;

    try {
      const parsed = parseFormalinCode(code);
      if (!parsed) {
        setErrorMessage("無効なコードです。");
        return;
      }
      setErrorMessage("");

      const { serialNumber, boxNumber, lotNumber, productCode } = parsed;

      // 全体から1件だけサーバー検索して確実に取得（ページ外でもOK）
      const lookup = await getFormalinPage(1, 1, {
        status: "出庫済み",
        lotNumber,
        boxNumber,
        key: serialNumber,
        productCode,
      });

      if (lookup.total === 0 || lookup.items.length === 0) {
        setErrorMessage("このホルマリンは出庫済みに見つかりません。出庫されていないか、既に戻入/提出済みです。");
        return;
      }

      const item = lookup.items[0];

      // 入庫済みに戻す
      await editFormalin(item.id, {
        key: serialNumber,
        status: "入庫済み",
        place: "病理在庫",
        timestamp: new Date(),
        updatedBy: username,
        updatedAt: new Date(),
        oldStatus: item.status,
        newStatus: "入庫済み",
        oldPlace: item.place,
        newPlace: "病理在庫",
      });

      // 再読込
      await load();
      setErrorMessage("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "戻入処理中に不明なエラーが発生しました。"
      );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">戻入する</h1>

      <div className="ml-10 mb-3 flex items-center gap-3">
        <input
          type="text"
          ref={inputRef}
          onKeyDown={handleScan}
          placeholder="二次元バーコードを読み込んでください"
          className="text-2xl border border-gray-300 rounded p-2 w-1/3"
        />

        {errorMessage && <p className="text-red-500">{errorMessage}</p>}

        {/* ページサイズ */}
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

        {/* ページャ */}
        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            前へ
          </button>
          <span className="text-gray-700">
            {page} / {totalPages}（全 {total} 件）
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            次へ
          </button>
        </div>
      </div>

      <h2 className="text-xl mx-10 mt-4 mb-2">出庫済みホルマリン一覧</h2>
      <div className="ml-10">
        <FormalinTable formalinList={rows} />
      </div>
    </div>
  );
}
