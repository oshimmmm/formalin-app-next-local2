"use client";

import React, { useContext, useRef, useEffect, useState, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { Formalin } from "../types/Formalin";
import FormalinTable from "../components/FormalinTable";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function OutboundPage() {
  // 1) FormalinContext から formalinList と編集用関数を取得
  const { formalinList, editFormalin } = useContext(FormalinContext)!;
  // 2) NextAuth のセッションからユーザー名を取得
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedPlace, setSelectedPlace] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // "出庫済み" のアイテムだけ表示
  const egressedList = formalinList.filter((f: Formalin) => f.status === "出庫済み");

  // 出庫先選択
  const handlePlaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPlace(e.target.value);
  };

  // バーコード処理 (Enter キー押下)
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
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
        // 正常ならエラーメッセージをクリア
        setErrorMessage("");
        const { serialNumber } = parsed;
        // 出庫先が空の場合はエラーメッセージ
        if (!selectedPlace) {
          setErrorMessage("出庫先を選択してください。");
          return;
        }
        // 既存のホルマリンを検索
        const existingFormalin = formalinList.find((f) => f.key === serialNumber);
        if (existingFormalin) {
          try {
            await editFormalin(existingFormalin.id, {
              key: serialNumber,
              status: "出庫済み",
              place: selectedPlace,
              timestamp: new Date(),
              updatedBy: username,
              updatedAt: new Date(),
              oldStatus: existingFormalin.status,
              newStatus: "出庫済み",
              oldPlace: existingFormalin.place,
              newPlace: selectedPlace,
            });
            setErrorMessage("");
          } catch (err) {
            if (err instanceof Error) {
              setErrorMessage(err.message);
            } else {
              setErrorMessage("不明なエラーが発生しました");
            }
          }
        } else {
          // 入庫されていない場合
          setErrorMessage("入庫されていません。");
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("不明なエラーが発生しました");
        }
      }
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">出庫する</h1>
      <label htmlFor="place-select" className="text-2xl ml-10">
        出庫先を選択してください:{" "}
      </label>
      <select
        id="place-select"
        value={selectedPlace}
        onChange={handlePlaceChange}
        className="text-2xl border border-gray-300 rounded p-2 w-1/5"
      >
        <option value=""></option>
        <option value="病理">病理</option>
        <option value="内視鏡">内視鏡</option>
        <option value="外科">外科</option>
        <option value="内科">内科</option>
        <option value="病棟">病棟</option>
      </select>
      <br />
      <br />
      <input
        type="text"
        ref={inputRef}
        onKeyDown={handleScan}
        placeholder="二次元バーコードを読み込んでください"
        className="text-2xl border border-gray-300 rounded p-2 w-1/3 ml-10"
      />
      {errorMessage && <p className="text-red-500 ml-10">{errorMessage}</p>}
      <h2 className="text-xl mx-10 mt-8 mb-2">出庫済みホルマリン一覧</h2>
      <div className="ml-10">
        <FormalinTable formalinList={egressedList} />
      </div>
    </div>
  );
}
