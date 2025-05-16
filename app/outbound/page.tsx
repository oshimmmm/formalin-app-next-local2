"use client";

import React, {
  useContext, useRef, useEffect, useState, KeyboardEvent,
} from "react";
import { useSession } from "next-auth/react";
import { FormalinContext } from "../Providers/FormalinProvider";
import { Formalin } from "../types/Formalin";
import FormalinTable from "../components/FormalinTable";
import { parseFormalinCode } from "../utils/parseFormalinCode";

export default function OutboundPage() {
  /* ------------------------------------------------------------------ */
  /* Context & Session                                                  */
  /* ------------------------------------------------------------------ */
  const { formalinList, editFormalin, fetchFormalinList } =
        useContext(FormalinContext)!;
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  /* ------------------------------------------------------------------ */
  /* Local state                                                        */
  /* ------------------------------------------------------------------ */
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedPlace, setSelectedPlace] = useState("");
  const [errorMessage, setErrorMessage]   = useState("");
  const [isLoading, setIsLoading]         = useState(false);

  useEffect(() => inputRef.current?.focus(), []);

  /* 入庫済み → 出庫済みへ変更された一覧 */
  const egressedList = formalinList.filter(
    (f: Formalin) => f.status === "出庫済み"
  );

  /* ------------------------------------------------------------------ */
  /* バーコード処理                                                     */
  /* ------------------------------------------------------------------ */
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLInputElement;

    if (isLoading) {
      setErrorMessage("処理中です。しばらくお待ちください。");
      target.value = "";
      return;
    }

    const code = target.value.trim();
    target.value = "";
    if (!code) return;

    /* バーコード解析 -------------------------------------------------- */
    const parsed = parseFormalinCode(code);
    if (!parsed) { setErrorMessage("無効なコードです。"); return; }

    const { serialNumber, boxNumber, lotNumber, productCode } = parsed;

    if (!selectedPlace) {
      setErrorMessage("出庫先を選択してください。");
      return;
    }

    /* -------------- ① 箱バーコード（0000） -------------------------- */
    if (serialNumber === "0000") {
      const boxItems = formalinList.filter(
        (f) =>
          f.lotNumber === lotNumber &&
          f.boxNumber === boxNumber &&
          f.productCode === productCode
      );

      if (boxItems.length === 0) {
        setErrorMessage("この箱は入庫されていません。");
        return;
      }
      if (boxItems.some((f) => f.status !== "入庫済み")) {
        setErrorMessage("この箱の中に既に出庫済みのホルマリンがあります。");
        return;
      }

      /* 規格ごとの本数チェック -------------------------------------- */
      const expected = (() => {
        switch (productCode) {
          case "4580161081859": return 300;
          case "4580161080616": return 100;
          case "4580161081545": return 150;
          default: return 0;
        }
      })();
      if (expected === 0) {
        setErrorMessage("この規格は一括出庫に対応していません。");
        return;
      }
      if (boxItems.length !== expected) {
        setErrorMessage("箱の内容数が想定と一致しません。");
        return;
      }

      /* ----------- 一括出庫 API へ ---------------------------------- */
      setIsLoading(true);
      try {
        const nowIso = new Date().toISOString();
        const items = boxItems.map((f) => ({
          id        : f.id,
          place     : selectedPlace,
          updatedBy : username,
          updatedAt : nowIso,
        }));

        const res = await fetch("/api/formalin/bulk-outbound", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ items }),
        });

        if (!res.ok) {
          const { error, message } = await res.json().catch(() => ({}));
          throw new Error(error ?? message ?? "一括出庫に失敗しました");
        }

        await fetchFormalinList();          // ← 画面を更新
        setErrorMessage("");
      } catch (err) {
        console.error(err);
        setErrorMessage(
          err instanceof Error ? err.message : "一括出庫処理中にエラー"
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    /* -------------- ② 単品バーコード ------------------------------- */
    const item = formalinList.find(
      (f) =>
        f.key       === serialNumber &&
        f.lotNumber === lotNumber   &&
        f.boxNumber === boxNumber   &&
        f.productCode === productCode
    );

    if (!item) {
      setErrorMessage("このホルマリンは入庫されていません。");
      return;
    }
    if (item.status !== "入庫済み") {
      setErrorMessage("このホルマリンは既に出庫済みか提出済みです。");
      return;
    }

    try {
      await editFormalin(item.id, {
        status    : "出庫済み",
        place     : selectedPlace,
        timestamp : new Date(),
        updatedBy : username,
        updatedAt : new Date(),
        oldStatus : item.status,
        newStatus : "出庫済み",
        oldPlace  : item.place,
        newPlace  : selectedPlace,
      });
      setErrorMessage("");
    } catch (err) {
      console.error(err);
      setErrorMessage("出庫処理中にエラーが発生しました。");
    }
  };

  /* ------------------------------------------------------------------ */
  /* JSX                                                                */
  /* ------------------------------------------------------------------ */
  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">出庫する</h1>

      {/* 出庫先セレクト ------------------------------------------------ */}
      <label htmlFor="place-select" className="text-2xl ml-10">
        出庫先を選択してください:{" "}
      </label>
      <select
        id="place-select"
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
      </select>

      {/* バーコード入力 ------------------------------------------------ */}
      <div className="relative ml-10 mt-4">
        <input
          type="text"
          ref={inputRef}
          onKeyDown={handleScan}
          placeholder="二次元バーコードを読み込んでください"
          disabled={isLoading}
          className={`text-2xl border border-gray-300 rounded p-2 w-1/3 ${
            isLoading ? "bg-gray-100" : ""
          }`}
        />
        {isLoading && (
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          bg-black bg-opacity-70 text-white px-6 py-3 rounded-lg z-50">
            <div className="flex items-center space-x-3">
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              <span className="text-lg font-semibold">一括出庫中...</span>
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="text-red-500 ml-10 mt-2">{errorMessage}</p>
      )}

      {/* 出庫済み一覧 -------------------------------------------------- */}
      <div className="bg-red-50">
        <h2 className="text-xl mx-10 mt-8 mb-2">出庫済みホルマリン一覧</h2>
        <div className="ml-10">
          <FormalinTable formalinList={egressedList} />
        </div>
      </div>
    </div>
  );
}
