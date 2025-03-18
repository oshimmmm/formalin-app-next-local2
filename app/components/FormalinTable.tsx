// app/components/FormalinTable.tsx
"use client";

import { useState, useMemo } from "react";
import { Formalin } from "../types/Formalin";

type SortableKey =
  | "key"
  | "place"
  | "status"
  | "timestamp"
  | "expired"
  | "size"
  | "lotNumber";

interface FormalinTableProps {
  formalinList: Formalin[];
  showLotNumber?: boolean;      // ロットナンバーを表示するか
  showHistoryButton?: boolean;  // 履歴ボタンを表示するか
  onHistoryClick?: (key: number) => void;
}

export default function FormalinTable({
  formalinList,
  showLotNumber = false,
  showHistoryButton = false,
  onHistoryClick,
}: FormalinTableProps) {
  // ソート状態
  const [sortConfig, setSortConfig] = useState<{
    key: SortableKey;
    direction: "asc" | "desc";
  } | null>(null);

  // フィルタ状態
  const [selectedFilters, setSelectedFilters] = useState<{
    [K in keyof Formalin]?: string;
  }>({});

  // フィルタ変更
  const handleFilterChange = (key: keyof Formalin, value: string) => {
    setSelectedFilters((prev) => ({
      ...prev,
      [key]: value || undefined, // 空文字なら undefined でフィルタ解除
    }));
    console.log("selectedFilters is: ", selectedFilters);
  };

  // 「key」列は、lotNumber, boxNumber, key の組み合わせで表示する
  const uniqueKeyValues = Array.from(
    new Set(
      formalinList.map(
        (item) => `${item.lotNumber} - ${item.boxNumber} - ${item.key}`
      )
    )
  );

  const uniqueValues = {
    key: uniqueKeyValues,
    place: Array.from(new Set(formalinList.map((item) => item.place))),
    status: Array.from(new Set(formalinList.map((item) => item.status))),
    // "timestamp" は年月日で表示
    timestamp: Array.from(
      new Set(
        formalinList.map((item) =>
          item.timestamp ? item.timestamp.toLocaleDateString("ja-JP") : "未設定"
        )
      )
    ),
    size: Array.from(new Set(formalinList.map((item) => item.size))),
    expired: Array.from(
      new Set(
        formalinList.map((item) =>
          item.expired ? item.expired.toLocaleString() : "未設定"
        )
      )
    ),
    lotNumber: Array.from(new Set(formalinList.map((item) => item.lotNumber))),
  };

  // フィルタ適用後の配列
  const filteredFormalinList = formalinList.filter((item) => {
    return Object.entries(selectedFilters).every(([key, value]) => {
      if (!value) return true;
      if (key === "timestamp") {
        return item.timestamp
          ? item.timestamp.toLocaleDateString("ja-JP") === value
          : false;
      }
      if (key === "expired") {
        return item.expired ? item.expired.toLocaleString() === value : false;
      }
      if (key === "key") {
        // keyフィールドは、lotNumber, boxNumber, key の組み合わせで比較する
        return `${item.lotNumber} - ${item.boxNumber} - ${item.key}` === value;
      }
      return item[key as keyof Formalin] === value;
    });
  });

  // ソート適用 (useMemoで最適化)
  const sortedFormalinList = useMemo(() => {
    if (sortConfig === null) {
      return filteredFormalinList;
    }
    return [...filteredFormalinList].sort((a, b) => {
      let aValue: string | number | Date = a[sortConfig.key];
      let bValue: string | number | Date = b[sortConfig.key];

      if (sortConfig.key === "timestamp" && a.timestamp && b.timestamp) {
        // 年月部分のみで比較するため、"YYYY-MM-01" に変換
        aValue = a.timestamp.getTime();
        bValue = b.timestamp.getTime();
      } else if (sortConfig.key === "expired" && a.expired && b.expired) {
        aValue = a.expired.getTime();
        bValue = b.expired.getTime();
      } else if (typeof aValue === "string" && typeof bValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [filteredFormalinList, sortConfig]);

  // ソート設定を変更
  const requestSort = (key: SortableKey) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // ヘッダー用スタイル
  const getHeaderStyle = (columnKey: keyof Formalin) => {
    return {
      cursor: "pointer",
      backgroundColor:
        sortConfig && sortConfig.key === columnKey ? "#e0e0e0" : "#f2f2f2",
    };
  };

  // 有効期限に応じた背景色を返す関数
  const getExpiredStyle = (expired: Date | null): string => {
    if (!expired) return "";
    const now = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
    if (expired.getTime() < now.getTime()) {
      return "bg-red-200";
    }
    const oneMonthInMs = 30 * 24 * 60 * 60 * 1000;
    if (expired.getTime() - now.getTime() <= oneMonthInMs) {
      return "bg-yellow-200";
    }
    return "";
  };

  return (
    <div className="overflow-x-auto shadow rounded-lg">
      <table className="min-w-full divide-y divide-gray-300 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            {/* ホルマリンKey 列 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div onClick={() => requestSort("key")} style={getHeaderStyle("key")}>
                ホルマリンKey
              </div>
              <select
                value={selectedFilters.key || ""}
                onChange={(e) => handleFilterChange("key", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.key.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </th>
            {/* Place 列 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div
                onClick={() => requestSort("place")}
                style={getHeaderStyle("place")}
              >
                場所
              </div>
              <select
                value={selectedFilters.place || ""}
                onChange={(e) => handleFilterChange("place", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.place.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </th>
            {/* Status 列 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div
                onClick={() => requestSort("status")}
                style={getHeaderStyle("status")}
              >
                状態
              </div>
              <select
                value={selectedFilters.status || ""}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.status.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </th>
            {/* Timestamp 列 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div
                onClick={() => requestSort("timestamp")}
                style={getHeaderStyle("timestamp")}
                className="text-lg cursor-pointer"
              >
                最終更新日時
              </div>
              <select
                value={selectedFilters.timestamp || ""}
                onChange={(e) => handleFilterChange("timestamp", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.timestamp.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </th>
            {/* Size 列 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div
                onClick={() => requestSort("size")}
                style={getHeaderStyle("size")}
              >
                規格
              </div>
              <select
                value={selectedFilters.size || ""}
                onChange={(e) => handleFilterChange("size", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.size.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </th>
            {/* Expired 列 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div
                onClick={() => requestSort("expired")}
                style={getHeaderStyle("expired")}
              >
                有効期限
              </div>
              <select
                value={selectedFilters.expired || ""}
                onChange={(e) => handleFilterChange("expired", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.expired.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </th>
            {showLotNumber && (
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                ロットナンバー
              </th>
            )}
            {showHistoryButton && (
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                更新履歴
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedFormalinList.map((f) => (
            <tr
              key={f.id}
              className="hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-2 break-words">
                {`${f.lotNumber} - ${f.boxNumber} - ${f.key}`}
              </td>
              <td className="px-4 py-2">{f.place}</td>
              <td className="px-4 py-2">{f.status}</td>
              <td className="px-4 py-2">
                {f.timestamp
                  ? f.timestamp.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
                  : "--"}
              </td>
              <td className="px-4 py-2">{f.size}</td>
              <td className={`px-4 py-2 ${getExpiredStyle(f.expired)}`}>
                {f.expired ? f.expired.toLocaleDateString("ja-JP") : "--"}
              </td>
              {showLotNumber && (
                <td className="px-4 py-2">{f.lotNumber}</td>
              )}
              {showHistoryButton && (
                <td className="px-4 py-2">
                  {onHistoryClick && (
                    <button
                      className="text-blue-500 underline hover:text-blue-700"
                      onClick={() => onHistoryClick(f.id)}
                    >
                      履歴
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
