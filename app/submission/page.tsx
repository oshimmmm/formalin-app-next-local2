// app/submission/page.tsx
"use client";

import React, { useContext, useEffect, useRef, useState, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { Formalin } from "../types/Formalin";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import FormalinTable from "../components/FormalinTable";
import ErrorModal from "../components/ErrorModal";
import { getFormalinPage } from "../services/formalinService";
import { FormalinContext } from "../Providers/FormalinProvider";

function jstTodayRange(): { from: Date; to: Date } {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now); // YYYY-MM-DD
  const from = new Date(`${ymd}T00:00:00+09:00`);
  const to   = new Date(`${ymd}T24:00:00+09:00`);
  return { from, to };
}

export default function SubmissionPage() {
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";
  const { editFormalin } = useContext(FormalinContext)!;

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [pendingRows, setPendingRows] = useState<Formalin[]>([]);
  const [submittedRows, setSubmittedRows] = useState<Formalin[]>([]);
  const [shouldScale, setShouldScale] = useState(false);

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [submittedCount, setSubmittedCount] = useState<number>(0);

  const [modalMessage, setModalMessage] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [selectedReturnBy, setSelectedReturnBy] = useState<string>("");
  const [pendingTotal, setPendingTotal] = useState<number>(0);

  // ★ 入力欄に確実にフォーカスを当てるヘルパ
  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());

  // レイアウト縮小判定
  useEffect(() => {
    if (containerRef.current) {
      const cw = containerRef.current.offsetWidth;
      const pw = containerRef.current.parentElement?.offsetWidth || cw;
      setShouldScale(cw / pw < 0.5);
    }
  }, [pendingRows, submittedRows]);

  // 効果音
  useEffect(() => {
    if (isModalOpen) {
      const audio = new Audio("/se_amb01.wav");
      audio.play().catch(() => {});
    }
  }, [isModalOpen]);

  // ロード
  const loadPending = async () => {
    const res = await getFormalinPage(1, 200, { status: "出庫済み" });
    setPendingRows(res.items);
    setPendingTotal(res.total);
  };
  const loadSubmittedToday = async () => {
    const { from, to } = jstTodayRange();
    const res = await getFormalinPage(1, 200, {
      status: "提出済み",
      updatedAtFrom: from,
      updatedAtTo: to,
      includeSubmitted: true,
    });
    setSubmittedRows(res.items);
  };

  // 初回フォーカス + 初回ロード
  useEffect(() => {
    focusInput();                         // ★ 初回表示時
    void loadPending();
    void loadSubmittedToday();
  }, []);

  // モーダルが閉じたときも保険でフォーカス復帰
  useEffect(() => {
    if (!isModalOpen) focusInput();       // ★ モーダル閉時
  }, [isModalOpen]);

  // バーコード処理
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLInputElement;
    const code = target.value.trim();
    target.value = "";
    if (!code) {
      focusInput();                       // ★ 空入力で即復帰
      return;
    }

    try {
      const parsed = parseFormalinCode(code);
      if (!parsed) {
        setModalMessage("無効なコードです。もう一度読み込んでください。");
        setIsModalOpen(true);
        return;                           // ★ フォーカスはモーダル閉時に戻る
      }
      setErrorMessage("");

      const { serialNumber, boxNumber, lotNumber, productCode } = parsed;
      const existingRes = await getFormalinPage(1, 1, {
        includeSubmitted: true,
        lotNumber, boxNumber, productCode, key: serialNumber,
      });
      const existing = existingRes.items[0];

      if (!existing) {
        setModalMessage("ホルマリンが見つかりません。入庫してください。");
        setIsModalOpen(true);
        return;
      }
      if (existing.status !== "出庫済み") {
        setModalMessage("このホルマリンは出庫済みの中にありません。出庫されていないか、既に提出済みです。");
        setIsModalOpen(true);
        return;
      }

      const place = existing.place ?? "";
      const isFromOR = place.startsWith("手術室");
      const hasSelection = selectedReturnBy.trim().length > 0;

      if (isFromOR && !hasSelection) {
        setModalMessage("提出元を選択してください（手術室からの返却は提出元の選択が必須です）。");
        setIsModalOpen(true);
        return;
      }
      if (!isFromOR && hasSelection) {
        setModalMessage(`このホルマリンは手術室ではなく「${place || "不明"}」に出庫されています。提出元は空欄にしてください。`);
        setIsModalOpen(true);
        return;
      }

      await editFormalin(existing.id, {
        key: serialNumber,
        status: "提出済み",
        timestamp: new Date(),
        returnBy: selectedReturnBy,
        updatedBy: username,
        updatedAt: new Date(),
        oldStatus: existing.status,
        newStatus: "提出済み",
        oldPlace: existing.place,
        newPlace: "病理へ提出",
      });

      try { await new Audio("/se_yma08.wav").play(); } catch {}
      setErrorMessage("");

      await Promise.all([loadPending(), loadSubmittedToday()]); // 再読込
      focusInput();                               // ★ 正常終了後にフォーカス復帰
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "提出処理中に不明なエラーが発生しました。");
      focusInput();                               // ★ 例外時も復帰（モーダル未表示ケース）
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">提出する</h1>

      {/* 提出元プルダウン */}
      <div className="ml-10 mb-3 w-1/2">
        <label className="block text-lg font-medium text-gray-700 mb-1">
          ↓↓↓提出元（手術室からのホルマリンを提出処理するときは選択してください。）
        </label>
        <select
          value={selectedReturnBy}
          onChange={(e) => setSelectedReturnBy(e.target.value)}
          className="text-xl border border-gray-300 rounded p-2 w-full bg-white"
        >
          <option value="">{""}</option>
          <option value="手術室(消化器)">手術室(消化器)</option>
          <option value="手術室(婦人科)">手術室(婦人科)</option>
          <option value="手術室(泌尿器)">手術室(泌尿器)</option>
          <option value="手術室(頭頸部)">手術室(頭頸部)</option>
          <option value="手術室(整形)">手術室(整形)</option>
          <option value="手術室(乳腺)">手術室(乳腺)</option>
          <option value="手術室(呼吸器)">手術室(呼吸器)</option>
          <option value="手術室(形成)">手術室(形成)</option>
        </select>
      </div>

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
        {/* 未提出（出庫済み） */}
        <div style={{ width: "50%" }} className="bg-red-50 p-4 rounded-lg m-2">
          <div className="flex justify-between items-center mx-10 mt-8 mb-2">
            <h2 className="text-xl">未提出のホルマリン一覧（出庫済み）</h2>
            <span className="text-2xl font-bold text-red-600 bg-white px-4 py-2 rounded-lg shadow">
              総件数: {pendingTotal}件
              <span className="ml-2 text-base font-normal text-gray-700">
                （この枠の表示件数: {pendingCount}件）
              </span>
            </span>
          </div>
          <div className="ml-2">
            <FormalinTable
              formalinList={pendingRows}
              onFilteredCountChange={setPendingCount}
            />
          </div>
        </div>

        {/* 本日提出済み */}
        <div style={{ width: "50%" }} className="bg-green-50 p-4 rounded-lg m-2">
          <div className="flex justify-between items-center mx-10 mt-8 mb-2">
            <h2 className="text-xl">本日提出済みのホルマリン一覧</h2>
            <span className="text-2xl font-bold text-green-600 bg-white px-4 py-2 rounded-lg shadow">
              表示件数: {submittedCount}件
            </span>
          </div>
          <div className="ml-2">
            <FormalinTable
              formalinList={submittedRows}
              onFilteredCountChange={setSubmittedCount}
            />
          </div>
        </div>
      </div>

      {/* モーダル */}
      <ErrorModal
        visible={isModalOpen}
        title="エラー"
        message={modalMessage}
        onClose={() => {
          setIsModalOpen(false);
          focusInput();                // ★ モーダル閉じたら入力欄へ
        }}
      />
    </div>
  );
}
