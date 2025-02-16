"use client";

import React, { useEffect, useState, useContext, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { Formalin } from "../types/Formalin";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function AdminPage() {
  // 1) FormalinContext からメソッドやデータを取得
  const { formalinList, removeFormalin, editFormalin } = useContext(FormalinContext)!;

  // 2) ローカル state
  const [posts, setPosts] = useState<Formalin[]>([]);
  const [serialNumber, setSerialNumber] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // 3) ログインユーザー名を NextAuth セッションから取得
  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // 選択可能な出庫先
  const places = ["病理", "内視鏡", "外科", "内科", "病棟"];

  // 初回マウント時などに formalinList をローカルstate posts に反映
  useEffect(() => {
    setPosts(formalinList);
  }, [formalinList]);

  // バーコード読取 → parseFormalinCode
  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      const parsed = parseFormalinCode(code);

      if (parsed) {
        setErrorMessage("");
        setSerialNumber(parsed.serialNumber);
      } else {
        setErrorMessage("このホルマリンはリストにありません。");
        setSerialNumber(null);
      }
    }
  };

  // serialNumber があれば、それに合致する投稿だけ表示
  const filteredPosts = serialNumber
    ? posts.filter((post) => post.key === serialNumber)
    : posts;

  // 削除ボタン押下 → removeFormalin呼び出し
  const handleDelete = async (id: number) => {
    if (window.confirm("本当に削除しますか？")) {
      await removeFormalin(id);
      // Context側がDBを再取得し formalinListが更新 → useEffect で setPosts()に反映される
    }
  };

  // place変更時、ローカルstateを更新
  const handlePlaceChange = (id: number, newPlace: string) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === id ? { ...post, place: newPlace } : post))
    );
  };

  // status変更時、ローカルstateを更新
  const handleStatusChange = (id: number, newStatus: string) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === id ? { ...post, status: newStatus } : post))
    );
  };

  // 更新ボタン押下 → DB更新
  const handleUpdateData = async (id: number) => {
    const targetPost = posts.find((p) => p.id === id);
    if (!targetPost) return;

    if (!window.confirm("本当に更新しますか？")) {
      return;
    }

    // タイムスタンプ
    const now = new Date();
    // UTC扱いかどうかは要件に合わせて
    const timeDate = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 9, now.getMinutes(), now.getSeconds())
    );

    // Context側の updateFormalin でDB更新
    await editFormalin(
      id,
      {
        place: targetPost.place,
        status: targetPost.status,
        timestamp: timeDate,
        updatedBy: username,
      }
    );
    // DB更新後、Contextが再フェッチ → useEffect => setPosts(formalinList)
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">管理者専用ページ</h1>

      <div className="ml-10 mb-4">
        <input
          type="text"
          placeholder="バーコードを読み込んでください"
          onKeyDown={handleBarcodeInput}
          className="border border-gray-300 rounded p-2 w-1/4"
        />
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}
      </div>

      <table className="w-4/5 text-lg ml-10">
        <thead>
          <tr>
            <th className="border border-gray-300 p-2.5 text-left">Key</th>
            <th className="border border-gray-300 p-2.5 text-left">Place</th>
            <th className="border border-gray-300 p-2.5 text-left">Status</th>
            <th className="border border-gray-300 p-2.5 text-left">操作</th>
          </tr>
        </thead>
        <tbody>
          {filteredPosts.map((post) => (
            <tr
              key={post.id}
              className="bg-white hover:bg-gray-50"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f9f9f9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#fff";
              }}
            >
              <td className="border border-gray-300 p-2.5">
                {post.key}
              </td>

              <td className="border border-gray-300 p-2.5">
                <select
                  value={post.place}
                  onChange={(e) => handlePlaceChange(post.id, e.target.value)}
                  className="w-full p-1 border border-gray-300 rounded"
                >
                  {places.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </td>

              <td className="border border-gray-300 p-2.5">
                <input
                  type="text"
                  value={post.status}
                  className="w-full p-1 border border-gray-300 rounded"
                  onChange={(e) => handleStatusChange(post.id, e.target.value)}
                />
              </td>

              <td className="border border-gray-300 p-2.5">
                <button
                  onClick={() => handleUpdateData(post.id)}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  更新
                </button>
                <button
                  onClick={() => handleDelete(post.id)}
                  className="bg-red-500 text-white px-4 py-2 ml-4 rounded hover:bg-red-600"
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
