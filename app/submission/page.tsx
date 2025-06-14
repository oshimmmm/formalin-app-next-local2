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

export default function SubmissionPage() {
  // 1) NextAuth からユーザー名取得
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // 2) FormalinContext から formalinList, updateFormalinStatus を取得
  const { formalinList, editFormalin } = useContext(FormalinContext)!;
  // (React版で "updateFormalinStatus" だったならProvider側に合わせて呼び出し先を修正
  //  ここでは "editFormalin(...)" として呼ぶ例)

  const inputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // containerRef: 親要素の幅を測定して "shouldScale" を決める
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldScale, setShouldScale] = useState(false);

  // 3) マウント時にフォーカス
  useEffect(() => {
    inputRef.current?.focus();

    // 親要素の幅と親要素の親要素の幅を比較して、縮小表示するかどうか
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const parentWidth = containerRef.current.parentElement?.offsetWidth || containerWidth;
      const ratio = containerWidth / parentWidth;

      if (ratio < 0.5) {
        setShouldScale(true);
      } else {
        setShouldScale(false);
      }
    }
  }, [formalinList]);

  // '出庫済み'のホルマリン一覧 (未提出)
  const pendingSubmissionList = formalinList.filter(
    (f: Formalin) => f.status === "出庫済み"
  );

  // '提出済み'のホルマリン一覧
  const submittedList = formalinList.filter(
    (f: Formalin) => f.status === "提出済み"
  );

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
        const { serialNumber, boxNumber, lotNumber, productCode } = parsed;
        // 既存の formalin を検索
        const existingFormalin = formalinList.find((f) => f.key === serialNumber && f.lotNumber === lotNumber && f.boxNumber === boxNumber && f.productCode === productCode);
        if (existingFormalin) {
          if (existingFormalin.status === "出庫済み") {
            try {
              await editFormalin(existingFormalin.id, {
                key: serialNumber,
                status: "提出済み",
                timestamp: new Date(), // 現在時刻
                updatedBy: username,
                updatedAt: new Date(),
                oldStatus: existingFormalin.status,
                newStatus: "提出済み",
                oldPlace: existingFormalin.place,
                newPlace: "病理へ提出",
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

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [submittedCount, setSubmittedCount] = useState<number>(0);

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">提出する</h1>

      <input
        type="text"
        ref={inputRef}
        onKeyDown={handleScan} // onKeyPress → onKeyDown
        placeholder="二次元バーコードを読み込んでください"
        className="text-2xl border border-gray-300 rounded p-2 w-1/3 ml-10"
      />

      {errorMessage && <p className="text-red-500 ml-10">{errorMessage}</p>}

      <div
        ref={containerRef}
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          transform: shouldScale ? "scale(0.9)" : "none",
          transformOrigin: "top left",
        }}
      >
        <div style={{ width: "50%" }} className="bg-red-50 p-4 rounded-lg m-2">
          <div className="flex justify-between items-center mx-10 mt-8 mb-2">
            <h2 className="text-xl">
              未提出のホルマリン一覧（出庫済み）
            </h2>
            <span className="text-2xl text-gray-600">
              表示件数: {pendingCount}件
            </span>
          </div>
          <div className="ml-2">
            <FormalinTable 
              formalinList={pendingSubmissionList}
              onFilteredCountChange={setPendingCount}
            />
          </div>
        </div>
        <div style={{ width: "50%" }} className="bg-green-50 p-4 rounded-lg m-2">
          <div className="flex justify-between items-center mx-10 mt-8 mb-2">
            <h2 className="text-xl">
              提出済みのホルマリン一覧
            </h2>
            <span className="text-2xl text-gray-600">
              表示件数: {submittedCount}件
            </span>
          </div>
          <div className="ml-2">
            <FormalinTable 
              formalinList={submittedList}
              onFilteredCountChange={setSubmittedCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
