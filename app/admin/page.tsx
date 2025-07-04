"use client";

import React, {
  useEffect,
  useState,
  useContext,
  KeyboardEvent,
} from "react";
import { useSession } from "next-auth/react";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { Formalin } from "../types/Formalin";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function AdminPage() {
  // NextAuth からユーザー名取得
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // Context からリストと操作関数を取得
  const { formalinList, fetchFormalinList, removeFormalin, editFormalin } =
    useContext(FormalinContext)!;

  // ローカル状態
  const [posts, setPosts] = useState<Formalin[]>([]);
  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showSubmitted, setShowSubmitted] = useState<boolean>(false);

  // 選択肢データ
  const places = [
    "病理在庫",
    "病理",
    "手術室",
    "内視鏡",
    "放診",
    "泌尿器",
    "頭頚部",
    "婦人科",
    "外科",
    "内科",
    "病棟",
    "血液（マルク用）",
  ];
  const statuses = ["入庫済み", "出庫済み", "提出済み"];

  // 初回マウント＆showSubmitted 切り替え時に全件 or 未提出のみを取得
  useEffect(() => {
    fetchFormalinList(showSubmitted);
  }, [fetchFormalinList, showSubmitted]);

  // formalinList が更新されたらテーブル用 posts に反映
  useEffect(() => {
    setPosts(formalinList);
  }, [formalinList]);

  // バーコード読取
  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = (e.target as HTMLInputElement).value.trim();
    try {
      const parsed = parseFormalinCode(code);
      if (parsed) {
        setErrorMessage("");
        const id = `${parsed.lotNumber} - ${parsed.boxNumber} - ${parsed.serialNumber} - ${parsed.productCode}`;
        setUniqueId(id);
      } else {
        setErrorMessage("このホルマリンはリストにありません。");
        setUniqueId(null);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "不明なエラーが発生しました。"
      );
      setUniqueId(null);
    }
  };

  // 検索フィルタ
  const filteredPosts = uniqueId
    ? posts.filter(
        (post) =>
          `${post.lotNumber} - ${post.boxNumber} - ${post.key} - ${post.productCode}` ===
          uniqueId
      )
    : posts;

  // 削除
  const handleDelete = async (id: number) => {
    if (window.confirm("本当に削除しますか？")) {
      await removeFormalin(id);
    }
  };

  // 編集前プレビュー更新
  const handlePlaceChange = (id: number, newPlace: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, place: newPlace } : p))
    );
  };
  const handleStatusChange = (id: number, newStatus: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
    );
  };

  // 実際の更新
  const handleUpdateData = async (id: number) => {
    const target = posts.find((p) => p.id === id);
    const before = formalinList.find((p) => p.id === id);
    if (!target || !before) return;
    if (!window.confirm("本当に更新しますか？")) return;

    const now = new Date();
    // JST に合わせる
    const timestamp = new Date(
      Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() - 9,
        now.getMinutes(),
        now.getSeconds()
      )
    );

    await editFormalin(id, {
      key: target.key,
      place: target.place,
      status: target.status,
      timestamp,
      updatedBy: username,
      updatedAt: timestamp,
      oldPlace: before.place,
      newPlace: target.place,
      oldStatus: before.status,
      newStatus: target.status,
    });
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">
        ホルマリン状態編集ページ
      </h1>

      <div className="ml-10 mb-4 flex items-center space-x-4">
        {/* 提出済みトグル */}
        <button
          onClick={() => setShowSubmitted((prev) => !prev)}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          {showSubmitted ? "未提出のみ表示" : "提出済みも含めて表示"}
        </button>

        {/* バーコード検索 */}
        <input
          type="text"
          placeholder="バーコードを読ませると検索できます"
          onKeyDown={handleBarcodeInput}
          className="border border-gray-300 rounded p-2 w-1/4"
        />
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}
      </div>

      <table className="w-4/5 text-lg ml-10">
        <thead>
          <tr>
            <th className="border p-2 text-left">ホルマリンID</th>
            <th className="border p-2 text-left">規格</th>
            <th className="border p-2 text-left">Place</th>
            <th className="border p-2 text-left">Status</th>
            <th className="border p-2 text-left">操作</th>
          </tr>
        </thead>
        <tbody>
          {filteredPosts.map((post) => (
            <tr key={post.id} className="hover:bg-gray-50">
              <td className="border p-2">
                {`${post.lotNumber} - ${post.boxNumber} - ${post.key}`}
              </td>
              <td className="border p-2">{post.size}</td>
              <td className="border p-2">
                <select
                  value={post.place}
                  onChange={(e) => handlePlaceChange(post.id, e.target.value)}
                  className="w-full p-1 border rounded"
                >
                  {places.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border p-2">
                <select
                  value={post.status}
                  onChange={(e) =>
                    handleStatusChange(post.id, e.target.value)
                  }
                  className="w-full p-1 border rounded"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border p-2">
                <button
                  onClick={() => handleUpdateData(post.id)}
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                >
                  更新
                </button>
                <button
                  onClick={() => handleDelete(post.id)}
                  className="bg-red-500 text-white px-3 py-1 ml-2 rounded hover:bg-red-600"
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
