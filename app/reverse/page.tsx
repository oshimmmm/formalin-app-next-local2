"use client";

import React, {
  useContext,
  useRef,
  useEffect,
  useState,
  KeyboardEvent,
} from "react";
import { useSession } from "next-auth/react";
import { Formalin } from "../types/Formalin";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import FormalinTable from "../components/FormalinTable";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function ReversePage() {
  // 1) NextAuth からユーザー名取得
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // 2) FormalinContext から formalinList, updateFormalinStatus を取得
  const { formalinList, editFormalin } = useContext(FormalinContext)!;
  // (React版で "updateFormalinStatus" だったならProvider側に合わせて呼び出し先を修正
  //  ここでは "editFormalin(...)" として呼ぶ例)

  const inputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // 3) マウント時にフォーカス
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // '出庫済み'のホルマリン一覧 (未提出)
  const pendingSubmissionList = formalinList.filter(
    (f: Formalin) => f.status === "出庫済み"
  );

//   // '提出済み'のホルマリン一覧
//   const submittedList = formalinList.filter(
//     (f: Formalin) => f.status === "提出済み"
//   );

  // 4) バーコード読み取り(Enter押下)
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
        const { serialNumber, boxNumber, lotNumber } = parsed;
        // 既存の formalin を検索
        const existingFormalin = formalinList.find((f) => f.key === serialNumber && f.lotNumber === lotNumber && f.boxNumber === boxNumber);
        if (existingFormalin) {
          if (existingFormalin.status === "出庫済み") {
            try {
              await editFormalin(existingFormalin.id, {
                key: serialNumber,
                status: "入庫済み",
                place: "病理在庫",
                timestamp: new Date(), // 現在時刻
                updatedBy: username,
                updatedAt: new Date(),
                oldStatus: existingFormalin.status,
                newStatus: "入庫済み",
                oldPlace: existingFormalin.place,
                newPlace: "病理在庫", // 場所は変更しない想定
              });
              setErrorMessage("");
            } catch (err) {
              if (err instanceof Error) {
                setErrorMessage(err.message);
              } else {
                setErrorMessage("提出処理中に不明なエラーが発生しました。");
              }
            }
          } else {
            setErrorMessage("このホルマリンは出庫済みの中にありません。出庫されていないか、既に提出処理済みです。");
          }
        } else {
          setErrorMessage("ホルマリンが見つかりません。入庫してください。");
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("不明なエラーが発生しました。");
        }
      }
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">戻入する</h1>
        <input
          type="text"
          ref={inputRef}
          onKeyDown={handleScan}
          placeholder="二次元バーコードを読み込んでください"
          className="text-2xl border border-gray-300 rounded p-2 w-1/3 ml-10"
        />
        {errorMessage && <p className="text-red-500 ml-10">{errorMessage}</p>}
        <h2 className="text-xl mx-10 mt-8 mb-2">
          出庫済みホルマリン一覧
        </h2>
          
        <div className="ml-10">
          <FormalinTable formalinList={pendingSubmissionList} />
        </div>
    </div>
  );
}
