// app/outbound/page.tsx
"use client";

import React, { useContext, useEffect, useRef, useState, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { Formalin } from "../types/Formalin";
import FormalinTable from "../components/FormalinTable";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import ErrorModal from "../components/ErrorModal";
import { getFormalinPage, getFormalinCount } from "@/app/services/formalinService";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function OutboundPage() {
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  const { editFormalin } = useContext(FormalinContext)!;

  const [rows, setRows] = useState<Formalin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [selectedPlace, setSelectedPlace] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [filteredCount, setFilteredCount] = useState(0);
  const [modalMessage, setModalMessage] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // ★ バーコード入力へフォーカスするユーティリティ
  const focusInput = () => {
    // DOM更新直後でも確実に当てる
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // 初期フォーカスはバーコード入力欄へ
  useEffect(() => {
    focusInput();
  }, []);

  // モーダル開閉・ローディング状態の変化後にも自動で入力欄へ戻す
  useEffect(() => {
    if (!isModalOpen && !loading) {
      focusInput();
    }
  }, [isModalOpen, loading]);

  // 以前は select に初期フォーカスしていたが、要望に合わせて削除
  // useEffect(() => selectRef.current?.focus(), []);

  // モーダル効果音
  useEffect(() => {
    if (isModalOpen) {
      const audio = new Audio("/se_amb01.wav");
      audio.play().catch(() => {});
    }
  }, [isModalOpen]);

  const [page] = useState(1);
  const [pageSize] = useState(200);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getFormalinPage(page, pageSize, { status: "出庫済み" });
      setRows(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const egressedList = rows;

  const expectedByProductCode = (productCode: string): number => {
    switch (productCode) {
      case "4580161081859":
      case "FS0M20QA0W30S430": // 生検用 30ml
        return 300;
      case "4580161081521": // 25 ml 中性緩衝
        return 100;
      case "4580161083907": // 3号 40 ml
        return 150;
      default:
        return 0;
    }
  };

  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLInputElement;

    if (loading) {
      setErrorMessage("処理中です。しばらくお待ちください。");
      target.value = "";
      focusInput();
      return;
    }

    const code = target.value.trim();
    target.value = "";
    if (!code) {
      focusInput();
      return;
    }

    const parsed = parseFormalinCode(code);
    if (!parsed) {
      setModalMessage("無効なコードです。");
      setIsModalOpen(true);
      // フォーカスはモーダル閉鎖時に onClose で戻します
      return;
    }

    const { serialNumber, boxNumber, lotNumber, productCode, size } = parsed;

    if (!selectedPlace) {
      setModalMessage("出庫先を選択してください。");
      setIsModalOpen(true);
      // フォーカスはモーダル閉鎖時に onClose で戻します
      return;
    }

    // ① 箱バーコード
    if (serialNumber === "0000") {
      const expected = expectedByProductCode(productCode);
      if (expected === 0) {
        setModalMessage("この規格は一括出庫に対応していません。");
        setIsModalOpen(true);
        return;
      }

      try {
        const [totalBox, inCount] = await Promise.all([
          getFormalinCount({ includeSubmitted: true, lotNumber, boxNumber, productCode }),
          getFormalinCount({ status: "入庫済み", lotNumber, boxNumber, productCode }),
        ]);

        if (totalBox === 0) {
          setModalMessage("この箱は入庫されていません。");
          setIsModalOpen(true);
          return;
        }
        if (inCount !== totalBox) {
          setModalMessage("この箱の中に既に出庫済み/提出済みのホルマリンがあります。");
          setIsModalOpen(true);
          return;
        }
        if (inCount !== expected) {
          setModalMessage("箱の内容数が想定と一致しません。");
          setIsModalOpen(true);
          return;
        }

        const ok = window.confirm(`${selectedPlace} に ${size} を ${inCount} 個出庫します。よろしいですか？`);
        if (!ok) {
          focusInput();
          return;
        }

        setLoading(true);
        try {
          const nowIso = new Date().toISOString();
          const pageRes = await getFormalinPage(1, expected, {
            status: "入庫済み",
            lotNumber, boxNumber, productCode,
          });
          const boxItems = pageRes.items;
          if (boxItems.length !== expected) {
            throw new Error("箱の内容数が想定と一致しません（再度やり直してください）。");
          }

          const items = boxItems.map((f) => ({
            id: f.id,
            place: selectedPlace,
            updatedBy: username,
            updatedAt: nowIso,
          }));

          const res = await fetch("/api/formalin/bulk-outbound", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          });

          if (!res.ok) {
            const { error, message } = await res.json().catch(() => ({} as { error?: string; message?: string }));
            throw new Error(error ?? message ?? "一括出庫に失敗しました");
          }

          await load(); // 再読込
          try { await new Audio("/se_yma08.wav").play(); } catch {}
          setErrorMessage("");
        } finally {
          setLoading(false);
          focusInput(); // ★ ここで必ず入力に戻す
        }
      } catch (err) {
        console.error(err);
        setErrorMessage(err instanceof Error ? err.message : "一括出庫処理中にエラー");
        focusInput(); // エラーでも戻す
      }
      return;
    }

    // ② 単品バーコード
    try {
      const itemRes = await getFormalinPage(1, 1, {
        includeSubmitted: true,
        lotNumber, boxNumber, productCode, key: serialNumber,
      });
      const item = itemRes.items[0];

      if (!item) {
        setModalMessage("このホルマリンは入庫されていません。");
        setIsModalOpen(true);
        return;
      }
      if (item.status !== "入庫済み") {
        setModalMessage("このホルマリンは既に出庫済みか提出済みです。");
        setIsModalOpen(true);
        return;
      }

      await editFormalin(item.id, {
        status: "出庫済み",
        place: selectedPlace,
        timestamp: new Date(),
        updatedBy: username,
        updatedAt: new Date(),
        oldStatus: item.status,
        newStatus: "出庫済み",
        oldPlace: item.place,
        newPlace: selectedPlace,
      });

      try { await new Audio("/se_yma08.wav").play(); } catch {}
      setErrorMessage("");
      await load(); // 再読込
      focusInput(); // ★ 単品でも成功後に戻す
    } catch (err) {
      console.error(err);
      setModalMessage("出庫処理中にエラーが発生しました。");
      setIsModalOpen(true);
      // クローズ時に onClose でフォーカス復帰
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">出庫する</h1>

      {/* 出庫先セレクト */}
      <label htmlFor="place-select" className="text-2xl ml-10">出庫先を選択してください: </label>
      <select
        id="place-select"
        ref={selectRef}
        value={selectedPlace}
        onChange={(e) => setSelectedPlace(e.target.value)}
        className="text-2xl border border-gray-300 rounded p-2 w-1/5"
      >
        <option value=""></option>
        <option value="病理">病理</option>
        <option value="手術室">手術室</option>
        <option value="内視鏡">内視鏡</option>
        <option value="放診">放診</option>
        <option value="泌尿器">泌尿器</option>
        <option value="頭頸部">頭頸部</option>
        <option value="婦人科">婦人科</option>
        <option value="外科">外科</option>
        <option value="内科">内科</option>
        <option value="病棟">病棟</option>
        <option value="血液(マルク用)">血液(マルク用)</option>
      </select>

      {/* バーコード入力と表示件数 */}
      <div className="relative ml-10 mt-4 flex items-center">
        <input
          type="text"
          ref={inputRef}
          onKeyDown={handleScan}
          placeholder="二次元バーコードを読み込んでください"
          disabled={loading}
          className={`text-2xl border border-gray-300 rounded p-2 w-1/3 ${loading ? "bg-gray-100" : ""}`}
        />

        <div className="ml-6 px-4 py-2 bg-blue-100 rounded-lg border-2 border-blue-300 shadow flex items-center">
          <span className="text-xl font-semibold text-blue-800">
            出庫済み: {total}件
          </span>
          <span className="ml-4 text-gray-600 text-lg">
            ←バーコード読ませたら数が増えている事を確認してください
          </span>
        </div>

        {loading && (
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-70 text-white px-6 py-3 rounded-lg z-50">
            <div className="flex items-center space-x-3">
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              <span className="text-lg font-semibold">一括出庫中...</span>
            </div>
          </div>
        )}
      </div>

      {errorMessage && <p className="text-red-500 ml-10 mt-2">{errorMessage}</p>}

      {/* 出庫済み一覧 */}
      <div className="bg-red-50">
        <div className="flex items-center mx-10 mt-8 mb-2">
          <h2 className="text-xl">出庫済みホルマリン一覧</h2>
          <span className="text-gray-600 ml-4">表示件数: {filteredCount}件（全 {total} 件の一部表示）</span>
        </div>
        <div className="ml-10">
          <FormalinTable
            formalinList={egressedList}
            onFilteredCountChange={setFilteredCount}
          />
        </div>
      </div>

      {/* モーダル */}
      <ErrorModal
        visible={isModalOpen}
        title="エラー"
        message={modalMessage}
        onClose={() => {
          setIsModalOpen(false);
          focusInput(); // ★ モーダル閉じたら入力欄へ
        }}
      />
    </div>
  );
}
