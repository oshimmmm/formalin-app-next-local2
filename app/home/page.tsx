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
  // searchUniqueId は "lot_number - box_number - serialNumber - productCode" の形式
  const [searchUniqueId, setSearchUniqueId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      try {
        // 有効期限チェックはスキップする
        const parsed = parseFormalinCode(code, { checkExpiration: false });
        if (parsed === null) {
          setErrorMessage("このホルマリンはリストにありません。");
          setSearchUniqueId(null);
        } else {
          setErrorMessage("");
          // lotNumber, boxNumber, serialNumber, productCode の4つを組み合わせた一意の識別子を作成
          const uniqueId = `${parsed.lotNumber} - ${parsed.boxNumber} - ${parsed.serialNumber} - ${parsed.productCode}`;
          setSearchUniqueId(uniqueId);
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("不明なエラーが発生しました");
        }
        setSearchUniqueId(null);
      }
    }
  };

  // searchUniqueId が設定されていれば、その組み合わせに合致するレコードだけフィルタリング
  const filteredList = searchUniqueId
    ? formalinList.filter(
        (f) =>
          `${f.lotNumber} - ${f.boxNumber} - ${f.key} - ${f.productCode}` === searchUniqueId
      )
    : formalinList;

  // ここでは「出庫済み」のものだけ表示する例
  const filteredShukkoZumiList = filteredList.filter(
    (f) => f.status === "出庫済み"
  );

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
