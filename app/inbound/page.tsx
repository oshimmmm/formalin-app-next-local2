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
      try {
        const parsed = parseFormalinCode(code);
        if (!parsed) {
          setErrorMessage("無効なコードです。");
          target.value = "";
          return;
        }
        // 正常時はエラーメッセージをクリア
        setErrorMessage("");
        const { serialNumber, boxNumber, size, expirationDate, lotNumber, productCode} = parsed;
  
        if (serialNumber === "0000") {
          // 同じ lotNumber, boxNumber, productCode の組み合わせが既に存在するかチェック
          const existing = formalinList.find(
            (f) => f.lotNumber === lotNumber && f.boxNumber === boxNumber && f.productCode === productCode
          );
          if (existing) {
            setErrorMessage("この箱は既に入庫済です。");
            target.value = "";
            return;
          }

          // productCodeごとに登録件数を決定
          let registrationCount = 0;
          switch (productCode) {
            case "4580161091521": // 30ml
              registrationCount = 300;
              break;
            case "4580161080616": // 25ml中性緩衝
              registrationCount = 100;
              break;
            case "4580161081545": // 3号 40ml
              registrationCount = 200;
              break;
            default:
              setErrorMessage("このproductCodeは一括登録に対応していません。");
              target.value = "";
              return;
          }

          const promises = [];
          for (let i = 1; i <= registrationCount; i++) {
            const newSerial = i.toString().padStart(4, "0");
            promises.push(
              createFormalin({
                key: newSerial,
                place: "病理在庫",
                status: "入庫済み",
                timestamp: new Date(),
                size: size,
                expired: expirationDate,
                lotNumber: lotNumber,
                boxNumber,
                productCode,
                updatedBy: username,
                updatedAt: new Date(),
                oldStatus: "",
                newStatus: "入庫済み",
                oldPlace: "",
                newPlace: "病理在庫",
              })
            );
          }
          await Promise.all(promises);
        } else {
          // 通常の処理
          const existing = formalinList.find(
            (f) => f.key === serialNumber && f.lotNumber === lotNumber && f.boxNumber === boxNumber && f.productCode === productCode
          );
          if (existing) {
            switch (existing.status) {
              case "入庫済み":
                setErrorMessage("このホルマリンは既に入庫済です。");
                break;
              case "出庫済み":
                setErrorMessage("このホルマリンは出庫済です。");
                break;
              case "提出済み":
                setErrorMessage("このホルマリンは既に提出済です。");
                break;
              default:
                setErrorMessage(`このホルマリンは現在 ${existing.status} の状態です。`);
            }
            target.value = "";
            return;
          } else {
            await createFormalin({
              key: serialNumber,
              place: "病理在庫",
              status: "入庫済み",
              timestamp: new Date(),
              size: size,
              expired: expirationDate,
              lotNumber: lotNumber,
              boxNumber,
              productCode,
              updatedBy: username,
              updatedAt: new Date(),
              oldStatus: "",
              newStatus: "入庫済み",
              oldPlace: "",
              newPlace: "病理在庫",
            });
            setErrorMessage("");
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("不明なエラーが発生しました");
        }
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
