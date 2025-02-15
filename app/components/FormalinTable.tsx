// app/components/FormalinTable.tsx (例)

"use client";

import { useState, useMemo } from "react";
import { Formalin } from "../types/Formalin";
import { utcStringToJstString } from "../utils/formatDate";

type SortableKey = "key" | "place" | "status" | "timestamp" | "expired" | "size" | "lotNumber";

interface FormalinTableProps {
  formalinList: Formalin[];
  showLotNumber?: boolean;      // ロットナンバーを表示するか
  showHistoryButton?: boolean;  // 履歴ボタンを表示するか
  onHistoryClick?: (key: string) => void;
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

  // 各列のユニーク値を抽出
  const uniqueValues = {
    key: Array.from(new Set(formalinList.map((item) => item.key))),
    place: Array.from(new Set(formalinList.map((item) => item.place))),
    status: Array.from(new Set(formalinList.map((item) => item.status))),
    timestamp: Array.from(
      new Set(
        formalinList.map((item) => (item.timestamp ? item.timestamp.toLocaleString() : "未設定"))
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
        return item.timestamp?.toLocaleString() === value;
      }
      if (key === "expired") {
        return item.expired?.toLocaleString() === value;
      }
      return item[key as keyof Formalin] === value;
    });
  });

  // ソートを適用 (useMemoで最適化)
  const sortedFormalinList = useMemo(() => {
    if (sortConfig === null) {
      return filteredFormalinList;
    }
    return [...filteredFormalinList].sort((a, b) => {
      let aValue: string | number | Date = a[sortConfig.key];
      let bValue: string | number | Date = b[sortConfig.key];

      if (sortConfig.key === "timestamp" && a.timestamp && b.timestamp) {
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

  // ソート中の列にスタイルを当てる
  const getHeaderStyle = (columnKey: keyof Formalin) => {
    return {
      cursor: "pointer",
      backgroundColor:
        sortConfig && sortConfig.key === columnKey ? "#e0e0e0" : "#f2f2f2",
    };
  };

  return (
    <table className="w-11/12 table-fixed text-lg">
      <thead>
        <tr>
          {/* Key 列 */}
          <th className="border border-gray-300 p-2 text-left whitespace-normal break-words">
            <div
              onClick={() => requestSort("key")}
              style={getHeaderStyle("key")}
              className="text-lg cursor-pointer"
            >
              試薬ID
            </div>
            <select
              value={selectedFilters.key || ""}
              onChange={(e) => handleFilterChange("key", e.target.value)}
              className="font-normal border border-gray-300 rounded w-full"
            >
              <option value="">すべて</option>
              {uniqueValues.key.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </th>

          {/* Place */}
          <th className="border border-gray-300 p-2 text-left">
            <div
              onClick={() => requestSort("place")}
              style={getHeaderStyle("place")}
              className="text-lg cursor-pointer"
            >
              場所
            </div>
            <select
              value={selectedFilters.place || ""}
              onChange={(e) => handleFilterChange("place", e.target.value)}
              className="font-normal border border-gray-300 rounded w-full"
            >
              <option value="">すべて</option>
              {uniqueValues.place.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </th>

          {/* Status */}
          <th className="border border-gray-300 p-2 text-left">
            <div
              onClick={() => requestSort("status")}
              style={getHeaderStyle("status")}
              className="text-lg cursor-pointer"
            >
              状態
            </div>
            <select
              value={selectedFilters.status || ""}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              className="font-normal border border-gray-300 rounded w-full"
            >
              <option value="">すべて</option>
              {uniqueValues.status.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </th>

          {/* Timestamp */}
          <th className="border border-gray-300 p-2 text-left">
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
              className="font-normal border border-gray-300 rounded w-full"
            >
              <option value="">すべて</option>
              {uniqueValues.timestamp.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </th>

          {/* Size */}
          <th className="border border-gray-300 p-2 text-left">
            <div
              onClick={() => requestSort("size")}
              style={getHeaderStyle("size")}
              className="text-lg cursor-pointer"
            >
              規格
            </div>
            <select
              value={selectedFilters.size || ""}
              onChange={(e) => handleFilterChange("size", e.target.value)}
              className="font-normal border border-gray-300 rounded w-full"
            >
              <option value="">すべて</option>
              {uniqueValues.size.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </th>

          {/* Expired */}
          <th className="border border-gray-300 p-2 text-left">
            <div
              onClick={() => requestSort("expired")}
              style={getHeaderStyle("expired")}
              className="text-lg cursor-pointer"
            >
              有効期限
            </div>
            <select
              value={selectedFilters.expired || ""}
              onChange={(e) => handleFilterChange("expired", e.target.value)}
              className="font-normal border border-gray-300 rounded w-full"
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
            <th className="border border-gray-300 p-2 text-left">
              <div
                onClick={() => requestSort("lotNumber")}
                style={getHeaderStyle("lotNumber")}
                className="text-lg cursor-pointer"
              >
                ロットナンバー
              </div>
              <select
                value={selectedFilters.lotNumber || ""}
                onChange={(e) => handleFilterChange("lotNumber", e.target.value)}
                className="font-normal border border-gray-300 rounded w-full"
              >
                <option value="">すべて</option>
                {uniqueValues.lotNumber.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </th>
          )}

          {showHistoryButton && (
            <th className="border border-gray-300 p-2 text-left">更新履歴</th>
          )}
        </tr>
      </thead>
      <tbody>
        {sortedFormalinList.map((f) => (
          <tr
            key={f.id}
            style={{ backgroundColor: "#fff" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f9f9f9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#fff";
            }}
          >
            <td className="border border-gray-300 p-2 whitespace-normal break-words">
              {f.key}
            </td>
            <td className="border border-gray-300 p-2">{f.place}</td>
            <td className="border border-gray-300 p-2">{f.status}</td>
            <td className="border border-gray-300 p-2">
              {f.timestamp
                ? f.timestamp.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
                : "--"}
            </td>
            <td className="border border-gray-300 p-2">{f.size}</td>
            <td className="border border-gray-300 p-2">
              {utcStringToJstString(f.expired.toISOString())}
            </td>
            {showLotNumber && (
              <td className="border border-gray-300 p-2">{f.lotNumber}</td>
            )}
            {showHistoryButton && (
              <td className="border border-gray-300 p-2">
                {onHistoryClick && (
                  <button
                    className="text-blue-500 underline"
                    onClick={() => onHistoryClick(f.key)}
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
  );
}
