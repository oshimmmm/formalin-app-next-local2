"use client";

import React, { useEffect, useMemo, useRef, useState, KeyboardEvent, useContext } from "react";
import { useSession } from "next-auth/react";
import FormalinTable from "@/app/components/FormalinTable";
import { Formalin } from "@/app/types/Formalin";
import { parseFormalinCode } from "@/app/utils/parseFormalinCode";
import { getFormalinPage, getFormalinCount } from "@/app/services/formalinService";
import { FormalinContext } from "@/app/Providers/FormalinProvider";

export default function InboundClient() {
  /* セッション / CRUD (一覧は使わない) */
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";
  const { createFormalin } = useContext(FormalinContext)!;

  /* 画面状態 */
  const [rows, setRows] = useState<Formalin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ページャ（必要なら UI を追加）
  const [page] = useState(1);
  const [pageSize] = useState(200);

  // 在庫カウンタ（正確値を DB から取得）
  const [biopsyCount, setBiopsyCount] = useState(0); // 生検用 30ml
  const [lymphCount, setLymphCount] = useState(0);   // リンパ節用 40ml
  const [bkCount, setBkCount] = useState(0);         // 25ml中性緩衝

  // 初期フォーカス
  useEffect(() => { inputRef.current?.focus(); }, []);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await getFormalinPage(p, pageSize, { status: "入庫済み" });
      setRows(res.items);
      setTotal(res.total);

      const [c1, c2, c3] = await Promise.all([
        getFormalinCount({ status: "入庫済み", size: "生検用 30ml" }),
        getFormalinCount({ status: "入庫済み", size: "リンパ節用 40ml" }),
        getFormalinCount({ status: "入庫済み", size: "25ml中性緩衝" }),
      ]);
      setBiopsyCount(c1);
      setLymphCount(c2);
      setBkCount(c3);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(1); }, []);

  const ingressedList = useMemo(() => rows, [rows]);

  const expectedByProductCode = (productCode: string): number => {
    switch (productCode) {
      case "4580161081859":
      case "FS0M20QA0W30S430": // 生検用 30ml
        return 300;
      case "4580161081521":   // 25 ml 中性緩衝
        return 100;
      case "4580161083907":   // 3号 40 ml
        return 150;
      default:
        return 0;
    }
  };

  /* バーコード処理 */
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLInputElement;
    const code = target.value.trim();
    target.value = "";

    if (!code || loading) {
      if (loading) setErrorMessage("処理中です。しばらくお待ちください。");
      return;
    }

    const parsed = parseFormalinCode(code);
    if (!parsed) {
      setErrorMessage("無効なコードです。");
      return;
    }
    setErrorMessage("");

    const { serialNumber, boxNumber, size, expirationDate, lotNumber, productCode } = parsed;

    // ① 箱バーコード
    if (serialNumber === "0000") {
      const expected = expectedByProductCode(productCode);
      if (expected === 0) {
        setErrorMessage("この箱バーコードは一括登録に対応していません。");
        return;
      }

      // 既存データ混入チェック（提出済み含む全体）
      const existingTotal = await getFormalinCount({
        includeSubmitted: true,
        lotNumber, boxNumber, productCode,
      });
      if (existingTotal > 0) {
        setErrorMessage("この箱は既に入庫済みか、一部が入庫されています。");
        return;
      }

      // 一括インポート
      try {
        const nowIso = new Date().toISOString();
        const items = Array.from({ length: expected }, (_, i) => ({
          key: (i + 1).toString().padStart(4, "0"),
          place: "病理在庫",
          status: "入庫済み",
          timestamp: nowIso,
          size,
          expired: expirationDate,
          lotNumber,
          boxNumber,
          productCode,
          updatedBy: username,
          updatedAt: nowIso,
          oldStatus: "",
          newStatus: "入庫済み",
          oldPlace: "",
          newPlace: "病理在庫",
        }));

        const res = await fetch("/api/formalin/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });

        if (!res.ok) {
          const { error, message } = await res.json().catch(() => ({} as { error?: string; message?: string }));
          throw new Error(error ?? message ?? "登録に失敗しました");
        }

        await load(1); // ★ 再読込
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "不明なエラーが発生しました");
      }
      return;
    }

    // ② 個別入庫：重複チェック（全ステータス対象）
    const dupRes = await getFormalinPage(1, 1, {
      includeSubmitted: true,
      lotNumber, boxNumber, productCode, key: serialNumber,
    });
    const dup = dupRes.items[0];
    if (dup) {
      switch (dup.status) {
        case "入庫済み": setErrorMessage("このホルマリンは既に入庫済です。"); break;
        case "出庫済み": setErrorMessage("このホルマリンは出庫済です。"); break;
        case "提出済み": setErrorMessage("このホルマリンは既に提出済です。"); break;
        default: setErrorMessage(`現在 ${dup.status} の状態です。`);
      }
      return;
    }

    // 登録
    try {
      await createFormalin({
        key: serialNumber,
        place: "病理在庫",
        status: "入庫済み",
        timestamp: new Date(),
        size,
        expired: expirationDate,
        lotNumber,
        boxNumber,
        productCode,
        updatedBy: username,
        updatedAt: new Date(),
        oldStatus: "",
        newStatus: "入庫済み",
        oldPlace: "",
        newPlace: "病理在庫",
      });
      await load(1); // ★ 再読込
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "登録に失敗しました");
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">入庫する</h1>

      {/* 在庫数（正確） */}
      <div className="ml-10 mb-6 space-x-8 text-lg">
        <span>生検用：<strong>{biopsyCount}</strong>個</span>
        <span>リンパ節用：<strong>{lymphCount}</strong>個</span>
        <span className={`px-2 py-1 rounded ${bkCount <= 25 ? "bg-red-200" : ""}`}>
          BK用：<strong>{bkCount}</strong>個
        </span>
      </div>
      {bkCount <= 25 && (
        <p className="ml-10 mb-4 text-red-700 font-semibold">BK用ホルマリンの個数が25個以下の場合は発注してください</p>
      )}

      {/* 入力 */}
      <div className="relative ml-10">
        <input
          type="text"
          ref={inputRef}
          onKeyDown={handleScan}
          placeholder="二次元バーコードを読み込んでください"
          disabled={loading}
          className={`text-2xl border border-gray-300 rounded p-2 w-1/3 ${loading ? "bg-gray-100" : ""}`}
        />
        {loading && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-70 text-white px-6 py-3 rounded-lg shadow-lg z-50">
            <div className="flex items-center space-x-3">
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              <span className="text-lg font-semibold">読み込み中...</span>
            </div>
          </div>
        )}
      </div>

      {errorMessage && <p className="text-red-500 ml-10 mt-2">{errorMessage}</p>}

      {/* 一覧（ページネーションUIが必要なら追加） */}
      <h2 className="text-xl mx-10 mt-8 mb-2">
        入庫済みホルマリン一覧 <span className="ml-2 text-gray-600">（全 {total} 個）</span>
      </h2>
      <div className="ml-10 bg-blue-50">
        <FormalinTable formalinList={ingressedList} />
      </div>
    </div>
  );
}
