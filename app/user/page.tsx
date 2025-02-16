"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";       // Next.js の useRouter
import axios from "axios";

export default function UserManagementPage() {
  // ユーザー登録用ステート
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [registerError, setRegisterError] = useState("");

  // ユーザー編集用ステート
  const [users, setUsers] = useState<string[]>([]);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [enteredPassword, setEnteredPassword] = useState("");
  const [editError, setEditError] = useState("");
  const [showConfirmFields, setShowConfirmFields] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  // Next.js router
  const router = useRouter();

  // コンポーネントマウント時にユーザー一覧を取得
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // Next.jsのAPIルート (/api/users) にアクセスする例
        // 必要に応じてフルURL or 他のホストを使ってもOK
        const response = await axios.get("/api/users");
        // response.data.users が配列
        setUsers(response.data.users);
      } catch (err) {
        console.error("ユーザー取得エラー:", err);
      }
    };
    fetchUsers();
  }, []);

  // ユーザー登録
  const handleRegister = async () => {
    try {
      // /api/register に { username, password, isAdmin } を送信
      const response = await axios.post("/api/register", {
        username,
        password,
        isAdmin,
      });

      const data = response.data;
      if (!data.success) {
        setRegisterError(data.message || "登録に失敗しました。");
      } else {
        // 登録成功時 → 何かの画面へ飛ぶ or フォームリセット
        alert("登録成功！");
        setUsername("");
        setPassword("");
        setIsAdmin(false);
        // 例えばトップページへ遷移するなら:
        router.push("/");
      }
    } catch (err) {
        setRegisterError("登録に失敗しました。");
      console.error("登録エラー:", err);
    }
  };

  // ユーザー編集 (verify-password でパスワード認証)
  const handleEdit = async () => {
    setEditError("");
    try {
      const response = await axios.post("/api/verify-password", {
        username: selectedUsername,
        password: enteredPassword,
      });

      if (response.data.success) {
        setShowConfirmFields(true);
      } else {
        setEditError(response.data.message || "認証に失敗しました。");
      }
    } catch (err) {
      setEditError("認証に失敗しました。");
      console.error("認証エラー:", err);
    }
  };

  // ユーザー更新
  const handleConfirmUpdate = async () => {
    try {
      const response = await axios.post("/api/update-user", {
        username: selectedUsername,
        newPassword,
        newIsAdmin,
      });

      if (response.data.success) {
        // 更新後、ユーザー一覧を再取得
        const usersResponse = await axios.get("/api/users");
        setUsers(usersResponse.data.users);
        // フォームをリセット
        setSelectedUsername("");
        setEnteredPassword("");
        setNewPassword("");
        setNewIsAdmin(false);
        setShowConfirmFields(false);
        alert("ユーザーが更新されました。");
      } else {
        setEditError(response.data.message || "更新に失敗しました。");
      }
    } catch (err) {
      setEditError("更新に失敗しました。");
      console.error("更新エラー:", err);
    }
  };

  // ユーザー削除
  const handleDelete = async () => {
    if (!selectedUsername) {
      setEditError("削除するユーザーを選択してください。");
      return;
    }

    const confirmDelete = window.confirm("本当に削除しますか？");
    if (!confirmDelete) return;

    try {
      const response = await axios.delete("/api/delete-user", {
        data: { username: selectedUsername },
      });

      if (response.data.success) {
        // 削除後、ユーザー一覧を再取得
        const usersResponse = await axios.get("/api/users");
        setUsers(usersResponse.data.users);
        // フォームをリセット
        setSelectedUsername("");
        setEnteredPassword("");
        setNewPassword("");
        setNewIsAdmin(false);
        setShowConfirmFields(false);
        alert("ユーザーが削除されました。");
      } else {
        setEditError(response.data.message || "削除に失敗しました。");
      }
    } catch (err) {
      setEditError("削除に失敗しました。");
      console.error("削除エラー:", err);
    }
  };

  return (
    <div className="flex flex-row min-h-screen bg-gray-100">
      {/* 左半分: ユーザー登録 */}
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-4">ユーザー登録</h1>
          {registerError && <p className="text-red-500 mb-4">{registerError}</p>}

          <input
            type="text"
            placeholder="ユーザー名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mb-4"
          />

          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mb-4"
          />

          <label className="block mb-2">ユーザー種別</label>
          <select
            value={isAdmin ? "true" : "false"}
            onChange={(e) => setIsAdmin(e.target.value === "true")}
            className="w-full p-2 border border-gray-300 rounded mb-4"
          >
            <option value="false">一般ユーザー</option>
            <option value="true">管理者</option>
          </select>

          <button
            onClick={handleRegister}
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            登録
          </button>
        </div>
      </div>

      {/* 右半分: ユーザー編集 */}
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-4">ユーザー編集</h1>
          {editError && <p className="text-red-500 mb-4">{editError}</p>}

          {/* ユーザー選択 */}
          <label className="block mb-2">ユーザー名</label>
          <select
            value={selectedUsername}
            onChange={(e) => setSelectedUsername(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mb-4"
          >
            <option value="">選択してください</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {/* 現在のパスワード入力 */}
          <input
            type="password"
            placeholder="現在のパスワード"
            value={enteredPassword}
            onChange={(e) => setEnteredPassword(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded mb-4"
            disabled={!selectedUsername}
          />

          {/* 編集ボタン */}
          <button
            onClick={handleEdit}
            className={`w-full bg-green-500 text-white p-2 rounded hover:bg-green-600 ${
              !selectedUsername || !enteredPassword ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={!selectedUsername || !enteredPassword}
          >
            編集
          </button>

          {/* 新しいパスワードとユーザー種別 */}
          {showConfirmFields && (
            <div className="mt-6">
              <input
                type="password"
                placeholder="新しいパスワード"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              />
              <p className="text-sm text-gray-500 mb-4">
                *パスワードを変更しない場合は、現在のパスワードをそのまま入力してください
              </p>

              <label className="block mb-2">ユーザー種別</label>
              <select
                value={newIsAdmin ? "true" : "false"}
                onChange={(e) => setNewIsAdmin(e.target.value === "true")}
                className="w-full p-2 border border-gray-300 rounded mb-4"
              >
                <option value="false">一般ユーザー</option>
                <option value="true">管理者</option>
              </select>

              <button
                onClick={handleConfirmUpdate}
                className={`w-full bg-purple-500 text-white p-2 rounded hover:bg-purple-600 ${
                  !newPassword ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={!newPassword}
              >
                決定
              </button>

              {/* ユーザー削除ボタン */}
              <button
                onClick={handleDelete}
                className={`w-full bg-red-500 text-white p-2 rounded hover:bg-red-600 mt-8 ${
                  !selectedUsername ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={!selectedUsername}
              >
                ユーザーを削除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
