"use client";

import React, { useState } from "react";

export default function ArchivePage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleArchive = async () => {
    if (!startDate || !endDate) {
      setError("開始日と終了日を入力してください。");
      return;
    }
    setError("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "データ削除に失敗しました。");
      }
      const data = await response.json();
      setSuccessMessage(
        `削除成功: Formalin ${data.deletedFormalinCount}件, History ${data.deletedHistoryCount}件`
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("不明なエラーが発生しました。");
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">データ削除（アーカイブ）</h1>
      <div className="mb-4">
        <label className="block mb-1">開始日:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border p-2 rounded"
        />
      </div>
      <div className="mb-4">
        <label className="block mb-1">終了日:</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border p-2 rounded"
        />
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {successMessage && <p className="text-green-500 mb-4">{successMessage}</p>}
      <button
        onClick={handleArchive}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
      >
        指定範囲のデータを削除する
      </button>
    </div>
  );
}
