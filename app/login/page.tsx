"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [userInfo, setUserInfo] = useState({ username: "", password: "" });
  const [error, setError] = useState<string>("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    // next-auth の CredentialsProvider による signIn
    // redirect:false で結果を受け取ってエラーを制御できる
    const result = await signIn("credentials", {
      username: userInfo.username,
      password: userInfo.password,
      redirect: false, // 成功/失敗時のリダイレクトを無効
    });

    if (result?.error) {
      setError("ログインに失敗しました。");
    } else {
      // 認証に成功したらホーム画面などへ移動
      router.push("/home");
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl mb-4">ログイン</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1">ユーザー名</label>
          <input
            type="text"
            value={userInfo.username}
            onChange={(e) => setUserInfo({ ...userInfo, username: e.target.value })}
            className="border p-2 w-full"
            required
          />
        </div>
        <div>
          <label className="block mb-1">パスワード</label>
          <input
            type="password"
            value={userInfo.password}
            onChange={(e) => setUserInfo({ ...userInfo, password: e.target.value })}
            className="border p-2 w-full"
            required
          />
        </div>
        {error && <p className="text-red-500">{error}</p>}
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
          ログイン
        </button>
      </form>
    </div>
  );
}
