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
import FormalinTable from "../components/FormalinTable";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function SubmissionPage() {
  // 1) NextAuth からユーザー名を取得
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // 2) FormalinContext から formalinList と更新用の関数を取得
  const { formalinList, editFormalin } = useContext(FormalinContext)!;

  const inputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // containerRef: 親要素の幅を測定して縮小表示するかどうか決定
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldScale, setShouldScale] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const parentWidth = containerRef.current.parentElement?.offsetWidth || containerWidth;
      const ratio = containerWidth / parentWidth;
      setShouldScale(ratio < 0.5);
    }
  }, [formalinList]);

  // '出庫済み'のホルマリン一覧（未提出）と '提出済み' の一覧をそれぞれ抽出
  const pendingSubmissionList = formalinList.filter(
    (f: Formalin) => f.status === "出庫済み"
  );
  const submittedList = formalinList.filter(
    (f: Formalin) => f.status === "提出済み"
  );

  // バーコード読み取り (Enterキー押下)
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const target = e.target as HTMLInputElement;
      const code = target.value.trim();
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
        // 既存の formalin を検索
        const existingFormalin = formalinList.find((f) => f.key === serialNumber);
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
                newPlace: existingFormalin.place, // 場所は変更しない想定
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
            setErrorMessage("このホルマリンは出庫されていません。");
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
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">提出確認をする</h1>
      <input
        type="text"
        ref={inputRef}
        onKeyDown={handleScan}
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
        <div style={{ width: "50%" }}>
          <h2 className="text-xl mx-10 mt-8 mb-2">
            未提出のホルマリン一覧（出庫済み）
          </h2>
          <div className="ml-2">
            <FormalinTable formalinList={pendingSubmissionList} />
          </div>
        </div>
        <div style={{ width: "50%" }}>
          <h2 className="text-xl mx-2 mt-8 mb-2">
            提出確認済みのホルマリン一覧
          </h2>
          <FormalinTable formalinList={submittedList} />
        </div>
      </div>
    </div>
  );
}
