"use client";

import React, { useState } from "react";

export default function BackupPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  const handleBackup = async () => {
    if (!startDate || !endDate) {
      setError("開始日と終了日を入力してください。");
      return;
    }
    setError("");
    try {
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!response.ok) {
        throw new Error("バックアップ作成に失敗しました。");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${startDate}_${endDate}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("バックアップ作成中にエラーが発生しました。");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">バックアップ作成</h1>
        <div className="mb-4">
          <label className="block mb-2">開始日:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border p-2"
          />
        </div>
        <div className="mb-4">
          <label className="block mb-2">終了日:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border p-2"
          />
        </div>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <button
          onClick={handleBackup}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          バックアップを作成＆ダウンロード
        </button>
      </div>
    </div>
  );
}
