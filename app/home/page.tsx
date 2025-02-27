// app/home/page.tsx
"use client";

import { useContext, useState, KeyboardEvent } from "react";
import { FormalinContext } from "../Providers/FormalinProvider"; 
import FormalinTable from "../components/FormalinTable";
import { parseFormalinCode } from "../utils/parseFormalinCode";

export default function HomePage() {
  // FormalinContext から formalinList を取得
  const { formalinList } = useContext(FormalinContext)!;
  const [searchCode, setSearchCode] = useState("");
  const [searchSerialNumber, setSearchSerialNumber] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      try {
        const parsed = parseFormalinCode(code, { checkExpiration: false });
        if (parsed === null) {
          // parseFormalinCode が null を返した場合
          setErrorMessage("このホルマリンはリストにありません。");
          setSearchSerialNumber(null);
        } else {
          setErrorMessage("");
          setSearchSerialNumber(parsed.serialNumber);
        }
      } catch (error) {
        if (error instanceof Error) {
          // parseFormalinCode でエラーがスローされた場合（例: 有効期限切れ）
          setErrorMessage(error.message);
        } else {
          setErrorMessage("不明なエラーが発生しました");
        }
        setSearchSerialNumber(null);
      }
    }
  };

  // searchSerialNumberがセットされていれば、その key に合致するデータだけフィルタリング
  const filteredList = searchSerialNumber
    ? formalinList.filter((f) => f.key === searchSerialNumber)
    : formalinList;

  const filteredShukkoZumiList = filteredList.filter((f) => f.status === "出庫済み");

  // "提出済み"のステータスを持つデータを表示しない
  // const filteredListWithoutSubmitted = filteredList.filter((f) => f.status !== "提出済み");

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 ml-10">ホーム</h1>
      <p className="text-base text-gray-500 mb-4 ml-10">
        ＊どこかに出庫して、返ってきていないホルマリンの一覧が表示されています。
      </p>
      <div className="ml-10">
        <input
          type="text"
          placeholder="バーコードを読ませると検索できます"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          onKeyDown={handleBarcodeInput}
          className="border border-gray-300 rounded p-2 mb-2 w-1/4 hide-on-print"
        />
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}

        <FormalinTable formalinList={filteredShukkoZumiList} />
      </div>
    </div>
  );
}
