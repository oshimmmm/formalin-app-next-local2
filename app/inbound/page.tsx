"use client";

import React, { useContext, useRef, useEffect, useState, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import FormalinTable from "@/app/components/FormalinTable";
import { FormalinContext } from "@/app/Providers/FormalinProvider";
import { Formalin } from "@/app/types/Formalin";
import { parseFormalinCode } from "@/app/utils/parseFormalinCode";

export default function InboundClient() {
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  const { formalinList, createFormalin } = useContext(FormalinContext)!;

  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 初回マウント時に入力フィールドへフォーカス
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // "入庫済み" のものだけをフィルタ
  const ingressedList = formalinList.filter((f: Formalin) => f.status === "入庫済み");

  // バーコードをEnter押下で処理
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const target = e.target as HTMLInputElement;
      const code = target.value.trim();
      if (!code) return;

      const parsed = parseFormalinCode(code);
      if (!parsed) {
        setErrorMessage("無効なコードです。");
        target.value = "";
        return;
      }

      const { serialNumber, size, expirationDate, lotNumber } = parsed;

      // 既存データがあるかどうか判定
      const existing = formalinList.find((f) => f.key === serialNumber);
      if (existing) {
        setErrorMessage("このホルマリンは既に入庫済です。");
      } else {
        // 新規データを追加
        await createFormalin({
          key: serialNumber,
          place: "病理",
          status: "入庫済み",
          timestamp: new Date(),
          size: size,
          expired: expirationDate,
          lotNumber: lotNumber,
          // 履歴用
          updatedBy: username,
          updatedAt: new Date(),
          oldStatus: "",
          newStatus: "入庫済み",
          oldPlace: "",
          newPlace: "病理",
        });
        setErrorMessage("");
      }
      target.value = "";
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">入庫する</h1>

      <input
        type="text"
        ref={inputRef}
        onKeyDown={handleScan}
        placeholder="二次元バーコードを読み込んでください"
        className="text-2xl border border-gray-300 rounded p-2 w-1/3 ml-10"
      />

      {errorMessage && <p className="text-red-500 ml-10">{errorMessage}</p>}

      <h2 className="text-xl mx-10 mt-8 mb-2">入庫済みホルマリン一覧</h2>
      <div className="ml-10">
        <FormalinTable formalinList={ingressedList} />
      </div>
    </div>
  );
}
