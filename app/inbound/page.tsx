"use client";

import React, {
  useContext,
  useRef,
  useEffect,
  useState,
  KeyboardEvent,
} from "react";
import { useSession } from "next-auth/react";
import FormalinTable from "@/app/components/FormalinTable";
import { FormalinContext } from "@/app/Providers/FormalinProvider";
import { Formalin } from "@/app/types/Formalin";
import { parseFormalinCode } from "@/app/utils/parseFormalinCode";

export default function InboundClient() {
  /* ------------------------------------------------------------------ */
  /* セッション・コンテキスト                                           */
  /* ------------------------------------------------------------------ */
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  const { formalinList, createFormalin, fetchFormalinList } = useContext(FormalinContext)!;

  /* ------------------------------------------------------------------ */
  /* ローカル state                                                     */
  /* ------------------------------------------------------------------ */
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);          // 一括入庫中フラグ
  const inputRef = useRef<HTMLInputElement>(null);

  /* フォーカスは初回マウント時に自動付与 */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* 入庫済みのみ抽出 */
  const ingressedList = formalinList.filter(
    (f: Formalin) => f.status === "入庫済み"
  );

  /* ------------------------------------------------------------------ */
  /* ENTER 押下時のメインハンドラ                                       */
  /* ------------------------------------------------------------------ */
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;

    const target = e.target as HTMLInputElement;
    const code = target.value.trim();
    target.value = "";                               // 入力欄は即クリア

    if (!code || isLoading) {
      if (isLoading) setErrorMessage("処理中です。しばらくお待ちください。");
      return;
    }

    /* ① バーコード解析 ------------------------------------------------ */
    const parsed = parseFormalinCode(code);
    if (!parsed) {
      setErrorMessage("無効なコードです。");
      return;
    }

    const { serialNumber, boxNumber, size, expirationDate, lotNumber, productCode } = parsed;
    setErrorMessage("");                              // 解析成功でエラークリア

    /* ② 「0000」=箱バーコードの場合 ---------------------------------- */
    if (serialNumber === "0000") {
      /* 同じ箱が既に混在していないか確認 */
      const dup = formalinList.find(
        (f) => f.lotNumber === lotNumber &&
               f.boxNumber === boxNumber &&
               f.productCode === productCode
      );
      if (dup) {
        setErrorMessage("この箱は既に入庫済みか、一部が入庫されています。");
        return;
      }

      /* 製品コードごとの入庫本数決定 */
      let registrationCount = 0;
      switch (productCode) {
        case "4580161081859":   // 30 ml
          registrationCount = 300;
          break;
        case "4580161081521":   // 25 ml 中性緩衝
          registrationCount = 100;
          break;
        case "4580161081545":   // 3号 40 ml
          registrationCount = 150;
          break;
        default:
          setErrorMessage("この箱バーコードは一括登録に対応していません。");
          return;
      }

      /* ③ 一括インポート API へ -------------------------------------- */
      setIsLoading(true);
      try {
        /* 送信ペイロードを生成 */
        const nowIso = new Date().toISOString();
        const items = Array.from({ length: registrationCount }, (_, i) => ({
          key        : (i + 1).toString().padStart(4, "0"),
          place      : "病理在庫",
          status     : "入庫済み",
          timestamp  : nowIso,
          size,
          expired    : expirationDate,
          lotNumber,
          boxNumber,
          productCode,
          updatedBy  : username,
          updatedAt  : nowIso,
          oldStatus  : "",
          newStatus  : "入庫済み",
          oldPlace   : "",
          newPlace   : "病理在庫",
        }));

        const res = await fetch("/api/formalin/bulk", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ items }),
        });

        await fetchFormalinList(); 

        if (!res.ok) {
          const { error, message } = await res.json().catch(() => ({}));
          throw new Error(error ?? message ?? "登録に失敗しました");
        }

        /* 必要なら SWR mutate や Context 再取得をここで行う */
        // 例: mutate("/api/formalin");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "不明なエラーが発生しました"
        );
      } finally {
        setIsLoading(false);
      }
      return;                                         // 通常処理へは進まない
    }

    /* ④ 通常 4 桁シリアルの個別入庫 -------------------------------- */
    const dup = formalinList.find(
      (f) =>
        f.key       === serialNumber &&
        f.lotNumber === lotNumber   &&
        f.boxNumber === boxNumber   &&
        f.productCode === productCode
    );

    if (dup) {
      switch (dup.status) {
        case "入庫済み": setErrorMessage("このホルマリンは既に入庫済です。"); break;
        case "出庫済み": setErrorMessage("このホルマリンは出庫済です。");   break;
        case "提出済み": setErrorMessage("このホルマリンは既に提出済です。"); break;
        default:        setErrorMessage(`現在 ${dup.status} の状態です。`);
      }
      return;
    }

    /* createFormalin は 1 件ずつの登録用コンテキストメソッド */
    try {
      await createFormalin({
        key         : serialNumber,
        place       : "病理在庫",
        status      : "入庫済み",
        timestamp   : new Date(),
        size,
        expired     : expirationDate,
        lotNumber,
        boxNumber,
        productCode,
        updatedBy   : username,
        updatedAt   : new Date(),
        oldStatus   : "",
        newStatus   : "入庫済み",
        oldPlace    : "",
        newPlace    : "病理在庫",
      });
      setErrorMessage("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "登録に失敗しました"
      );
    }
  };

  /* ------------------------------------------------------------------ */
  /* JSX                                                                */
  /* ------------------------------------------------------------------ */
  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">入庫する</h1>

      {/* 入力フィールド ------------------------------------------------ */}
      <div className="relative ml-10">
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

        {/* ローディングオーバーレイ */}
        {isLoading && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                          bg-black bg-opacity-70 text-white px-6 py-3 rounded-lg shadow-lg z-50">
            <div className="flex items-center space-x-3">
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              <span className="text-lg font-semibold">一括入庫中...</span>
            </div>
          </div>
        )}
      </div>

      {/* エラーメッセージ */}
      {errorMessage && <p className="text-red-500 ml-10 mt-2">{errorMessage}</p>}

      {/* 一覧テーブル -------------------------------------------------- */}
      <h2 className="text-xl mx-10 mt-8 mb-2">
        入庫済みホルマリン一覧
        <span className="ml-2 text-gray-600">({ingressedList.length}個)</span>
      </h2>

      <div className="ml-10 bg-blue-50">
        <FormalinTable formalinList={ingressedList} />
      </div>
    </div>
  );
}
