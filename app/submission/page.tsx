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
import ErrorModal from "../components/ErrorModal";

export default function SubmissionPage() {
  // 1) NextAuth からユーザー名取得
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // 2) Context から在庫リストと fetch, update を取得
  const { formalinList, fetchFormalinList, editFormalin } =
    useContext(FormalinContext)!;

  // ── マウント時に「提出済みも含めて」全件取得 ──
  useEffect(() => {
    fetchFormalinList(true);
  }, [fetchFormalinList]);

  // UI 用 refs & state
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [shouldScale, setShouldScale] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [submittedCount, setSubmittedCount] = useState<number>(0);
  const [modalMessage, setModalMessage] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // ── マウント時＆在庫リスト更新時にフォーカス＆縮小判定 ──
  useEffect(() => {
    inputRef.current?.focus();
    if (containerRef.current) {
      const cw = containerRef.current.offsetWidth;
      const pw = containerRef.current.parentElement?.offsetWidth || cw;
      setShouldScale(cw / pw < 0.5);
    }
  }, [formalinList]);

  // ── モーダル表示時に効果音を鳴らす ──
  useEffect(() => {
    if (isModalOpen) {
      const audio = new Audio("/se_amb01.wav"); // public/sounds/error.wav を想定
      audio.play().catch((e) => {
        console.warn("効果音の再生に失敗しました:", e);
      });
    }
  }, [isModalOpen]);

  // '出庫済み' のリスト
  const pendingSubmissionList = formalinList.filter(
    (f: Formalin) => f.status === "出庫済み"
  );

  // 本日の日付範囲を算出
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );

  // '提出済み' かつ 本日更新 のリスト
  const submittedList = formalinList.filter((f: Formalin) => {
    if (f.status !== "提出済み" || !f.timestamp) return false;
    return f.timestamp >= startOfDay && f.timestamp < endOfDay;
  });

  // ── バーコード読み取り処理（変更不要） ──
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLInputElement;
    const code = target.value.trim();
    target.value = "";
    if (!code) return;

    try {
      const parsed = parseFormalinCode(code);
      if (!parsed) {
        // モーダルを開く
        setModalMessage("無効なコードです。もう一度読み込んでください。");
        setIsModalOpen(true);
        return;
      }
      setErrorMessage("");
      const { serialNumber, boxNumber, lotNumber, productCode } = parsed;
      const existing = formalinList.find(
        (f) =>
          f.key === serialNumber &&
          f.lotNumber === lotNumber &&
          f.boxNumber === boxNumber &&
          f.productCode === productCode
      );
      if (!existing) {
        setModalMessage("ホルマリンが見つかりません。入庫してください。");
        setIsModalOpen(true);
        return;
      }
      if (existing.status !== "出庫済み") {
        setModalMessage(
          "このホルマリンは出庫済みの中にありません。出庫されていないか、既に提出済みです。"
        );
        setIsModalOpen(true);
        return;
      }

      // ステータス更新
      await editFormalin(existing.id, {
        key: serialNumber,
        status: "提出済み",
        timestamp: new Date(),
        updatedBy: username,
        updatedAt: new Date(),
        oldStatus: existing.status,
        newStatus: "提出済み",
        oldPlace: existing.place,
        newPlace: "病理へ提出",
      });
      // 成功時の効果音を再生
      try {
        const successAudio = new Audio("/se_yma08.wav");
        await successAudio.play();
      } catch (e) {
        console.warn("効果音の再生に失敗しました:", e);
      }
      setErrorMessage("");
      // context の fetch 側で自動更新されるなら省略可
      await fetchFormalinList(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "提出処理中に不明なエラーが発生しました。"
      );
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">提出する</h1>

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
        {/* 未提出枠 */}
        <div style={{ width: "50%" }} className="bg-red-50 p-4 rounded-lg m-2">
          <div className="flex justify-between items-center mx-10 mt-8 mb-2">
            <h2 className="text-xl">未提出のホルマリン一覧（出庫済み）</h2>
            <span className="text-2xl font-bold text-red-600 bg-white px-4 py-2 rounded-lg shadow">
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

        {/* 本日提出済み枠 */}
        <div style={{ width: "50%" }} className="bg-green-50 p-4 rounded-lg m-2">
          <div className="flex justify-between items-center mx-10 mt-8 mb-2">
            <h2 className="text-xl">本日提出済みのホルマリン一覧</h2>
            <span className="text-2xl font-bold text-green-600 bg-white px-4 py-2 rounded-lg shadow">
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
      {/* モーダル表示 */}
      <ErrorModal
        visible={isModalOpen}
        title="エラー"
        message={modalMessage}
        onClose={() => {
          setIsModalOpen(false);
          // モーダルを閉じたら再度入力欄にフォーカスを戻す
          inputRef.current?.focus();
        }}
      />
    </div>
  );
}
