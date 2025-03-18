// app/admin/page.tsx
"use client";

import React, { useEffect, useState, useContext, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { parseFormalinCode } from "../utils/parseFormalinCode";
import { Formalin } from "../types/Formalin";
import { FormalinContext } from "../Providers/FormalinProvider";

export default function AdminPage() {
  const { formalinList, removeFormalin, editFormalin } = useContext(FormalinContext)!;
  const [posts, setPosts] = useState<Formalin[]>([]);
  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const { data: session } = useSession();
  const username = session?.user?.username || "anonymous";

  // 例：選択可能な出庫先とステータス
  const places = ["病理在庫", "病理", "内視鏡", "外科", "内科", "病棟"];
  const statuses = ["入庫済み", "出庫済み", "提出済み"];

  useEffect(() => {
    setPosts(formalinList);
  }, [formalinList]);

  // バーコード読取
  const handleBarcodeInput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const code = (e.target as HTMLInputElement).value.trim();
      try {
        const parsed = parseFormalinCode(code);
        if (parsed) {
          setErrorMessage("");
          // 3つの値を組み合わせた一意の識別子を作成
          const id = `${parsed.lotNumber} - ${parsed.boxNumber} - ${parsed.serialNumber}`;
          setUniqueId(id);
        } else {
          setErrorMessage("このホルマリンはリストにありません。");
          setUniqueId(null);
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("不明なエラーが発生しました。");
        }
        setUniqueId(null);
      }
    }
  };

  // uniqueId がセットされていれば、その組み合わせに合致する投稿だけ表示
  const filteredPosts = uniqueId
    ? posts.filter(
        (post) =>
          `${post.lotNumber} - ${post.boxNumber} - ${post.key}` === uniqueId
      )
    : posts;

  const handleDelete = async (id: number) => {
    if (window.confirm("本当に削除しますか？")) {
      await removeFormalin(id);
    }
  };

  const handlePlaceChange = (id: number, newPlace: string) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === id ? { ...post, place: newPlace } : post))
    );
  };

  const handleStatusChange = (id: number, newStatus: string) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === id ? { ...post, status: newStatus } : post))
    );
  };

  const handleUpdateData = async (id: number) => {
    const targetPost = posts.find((p) => p.id === id);
    if (!targetPost) return;
    if (!window.confirm("本当に更新しますか？")) return;

    const oldRecord = formalinList.find((p) => p.id === id);
    const now = new Date();
    const timeDate = new Date(
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
      key: targetPost.key,
      place: targetPost.place,
      status: targetPost.status,
      timestamp: timeDate,
      updatedBy: username,
      updatedAt: timeDate,
      oldPlace: oldRecord?.place || "",
      newPlace: targetPost.place,
      oldStatus: oldRecord?.status || "",
      newStatus: targetPost.status,
    });
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mt-4 mb-10 ml-10">ホルマリン状態編集ページ</h1>

      <div className="ml-10 mb-4">
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
            <th className="border border-gray-300 p-2.5 text-left">ホルマリンID</th>
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
                {`${post.lotNumber} - ${post.boxNumber} - ${post.key}`}
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
                <select
                  value={post.status}
                  onChange={(e) => handleStatusChange(post.id, e.target.value)}
                  className="w-full p-1 border border-gray-300 rounded"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
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
