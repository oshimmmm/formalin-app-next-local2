// app/admin/page.tsx
"use client";

import React, {
  useEffect,
  useState,
  useContext,
  KeyboardEvent,
  useMemo,
  useCallback,
} from "react";
import { useSession } from "next-auth/react";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { Formalin } from "../types/Formalin";
import { FormalinContext } from "../Providers/FormalinProvider";
import FormalinTable from "../components/FormalinTable";
import { getFormalinPage } from "../services/formalinService";

export default function AdminPage() {
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  const { removeFormalin, editFormalin } = useContext(FormalinContext)!;

  // ページネーション状態
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Formalin[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSubmitted, setShowSubmitted] = useState<boolean>(false);

  // 編集ドラフト（id ごとの差分だけ）
  const [drafts, setDrafts] = useState<Record<number, { place?: string; status?: string }>>({});

  // 検索モード
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // 選択肢
  const places = [
    "病理在庫",
    "病理",
    "手術室",
    "内視鏡",
    "放診",
    "泌尿器",
    "頭頸部",
    "婦人科",
    "外科",
    "内科",
    "病棟",
    "血液(マルク用)",
  ];
  const statuses = ["入庫済み", "出庫済み", "提出済み"];

  const load = useCallback(
    async (p = page, ps = pageSize, inc = showSubmitted) => {
      setLoading(true);
      try {
        const res = await getFormalinPage(p, ps, { includeSubmitted: inc });
        setRows(res.items);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, showSubmitted]
  );

  // トグル変更時は最初のページに戻す
  useEffect(() => {
    setPage(1);
  }, [showSubmitted]);

  useEffect(() => {
    void load(page, pageSize, showSubmitted);
  }, [page, pageSize, showSubmitted, load]);

  // 表示用配列（draft をオーバーレイ）
  const viewList = useMemo(
    () => rows.map((p) => (drafts[p.id] ? { ...p, ...drafts[p.id] } : p)),
    [rows, drafts]
  );

  // バーコードでグローバル検索（1件だけ）
  const handleBarcodeInput = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = (e.target as HTMLInputElement).value.trim();

    try {
      const parsed = parseFormalinCode(code, { checkExpiration: false });
      if (!parsed) {
        setErrorMessage("無効なコードです。");
        setIsSearchActive(false);
        void load(page, pageSize, showSubmitted);
        return;
      }
      setErrorMessage("");

      const { lotNumber, boxNumber, serialNumber, productCode } = parsed;
      const res = await getFormalinPage(1, 1, {
        includeSubmitted: true, // 管理画面の検索は全体から
        lotNumber,
        boxNumber,
        key: serialNumber,
        productCode,
      });

      if (res.total === 0) {
        setErrorMessage("該当のホルマリンは見つかりません。");
        setIsSearchActive(false);
        void load(1, pageSize, showSubmitted);
        return;
      }

      setIsSearchActive(true);
      setRows(res.items);
      setTotal(1);
      setPage(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "検索に失敗しました。");
      setIsSearchActive(false);
      void load(1, pageSize, showSubmitted);
    }
  };

  // UI: ドロップダウン変更（drafts のみ更新）
  const handlePlaceChange = (id: number, newPlace: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), place: newPlace } }));
  };
  const handleStatusChange = (id: number, newStatus: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), status: newStatus } }));
  };

  // 更新実行（差分で反映 → 再読込）
  const handleUpdateData = async (id: number) => {
    const before = rows.find((p) => p.id === id);
    const draft = drafts[id];
    if (!before || !draft) return;
    if (!window.confirm("本当に更新しますか？")) return;

    const now = new Date();
    const nextStatus = draft.status ?? before.status;
    await editFormalin(id, {
      place: draft.place ?? before.place,
      status: nextStatus,
      timestamp: now,
      updatedBy: username,
      updatedAt: now,
      oldPlace: before.place,
      newPlace: draft.place ?? before.place,
      oldStatus: before.status,
      newStatus: nextStatus,
      ...(before.status === "提出済み" && nextStatus === "出庫済み" ? { returnBy: "" } : {}),
    });

    // drafts クリーンアップ
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    // 検索中でも通常でも、いったん通常ロードに戻す（必要なら検索継続に変更可）
    setIsSearchActive(false);
    void load(page, pageSize, showSubmitted);
  };

  // 削除
  const handleDelete = async (id: number) => {
    if (!window.confirm("本当に削除しますか？")) return;
    await removeFormalin(id);
    // 最終1件を削除したら前ページへ
    const pageCount = Math.max(1, Math.ceil((total - 1) / pageSize));
    const nextPage = Math.min(page, pageCount);
    setPage(nextPage);
    setIsSearchActive(false);
    void load(nextPage, pageSize, showSubmitted);
  };

  const effectiveTotal = isSearchActive ? 1 : total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">ホルマリン状態編集ページ</h1>

      <div className="ml-10 mb-4 flex items-center gap-4">
        {/* 提出済みトグル */}
        <button
          onClick={() => setShowSubmitted((prev) => !prev)}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          {showSubmitted ? "未提出のみ表示" : "提出済みも含めて表示"}
        </button>

        {/* バーコード検索（全体検索） */}
        <input
          type="text"
          placeholder="バーコードを読ませると全体検索します（Enter）"
          onKeyDown={handleBarcodeInput}
          className="border border-gray-300 rounded p-2 w-1/3"
        />
        {isSearchActive && (
          <button
            className="px-3 py-1 border rounded"
            onClick={() => {
              setIsSearchActive(false);
              setErrorMessage("");
              setPage(1);
              void load(1, pageSize, showSubmitted);
            }}
          >
            検索解除
          </button>
        )}
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}

        {/* ページサイズ */}
        {!isSearchActive && (
          <>
            <label className="text-sm text-gray-600">件数/ページ:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-gray-300 rounded p-2"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={300}>300</option>
            </select>
          </>
        )}

        {/* ページャ */}
        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={isSearchActive || page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            前へ
          </button>
          <span className="text-gray-700">
            {isSearchActive ? 1 : page} / {totalPages}（全 {effectiveTotal} 件）
          </span>
          <button
            disabled={isSearchActive || page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            次へ
          </button>
        </div>
      </div>

      <div className="ml-10">
        <FormalinTable
          formalinList={viewList}
          editable
          places={places}
          statuses={statuses}
          onPlaceChange={handlePlaceChange}
          onStatusChange={handleStatusChange}
          onUpdate={handleUpdateData}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
