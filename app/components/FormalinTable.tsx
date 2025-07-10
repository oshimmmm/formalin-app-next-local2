// app/components/FormalinTable.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  showLotNumber?: boolean;
  showHistoryButton?: boolean;
  onHistoryClick?: (key: number) => void;
  onFilteredCountChange?: (count: number) => void;
  // ここから追加
  editable?: boolean;
  places?: string[];
  statuses?: string[];
  onPlaceChange?: (id: number, newPlace: string) => void;
  onStatusChange?: (id: number, newStatus: string) => void;
  onUpdate?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export default function FormalinTable({
  formalinList,
  showLotNumber = false,
  showHistoryButton = false,
  onHistoryClick,
  onFilteredCountChange,
  // 新規追加の props
  editable = false,
  places = [],
  statuses = [],
  onPlaceChange,
  onStatusChange,
  onUpdate,
  onDelete,
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

  const handleFilterChange = (key: keyof Formalin, value: string) => {
    setSelectedFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  // ユニーク値リスト
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
    timestamp: Array.from(
      new Set(
        formalinList.map((item) =>
          item.timestamp
            ? item.timestamp.toLocaleDateString("ja-JP")
            : "未設定"
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

  // フィルタ適用
  const filteredFormalinList = formalinList.filter((item) =>
    Object.entries(selectedFilters).every(([key, value]) => {
      if (!value) return true;
      if (key === "timestamp")
        return item.timestamp
          ? item.timestamp.toLocaleDateString("ja-JP") === value
          : false;
      if (key === "expired")
        return item.expired ? item.expired.toLocaleString() === value : false;
      if (key === "key")
        return (
          `${item.lotNumber} - ${item.boxNumber} - ${item.key}` === value
        );
      return item[key as keyof Formalin] === value;
    })
  );

  // ソート適用
  const sortedFormalinList = useMemo(() => {
    if (!sortConfig) return filteredFormalinList;
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

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredFormalinList, sortConfig]);

  // ソートリクエスト
  const requestSort = (key: SortableKey) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig?.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getHeaderStyle = (columnKey: keyof Formalin) => ({
    cursor: "pointer",
    backgroundColor:
      sortConfig?.key === columnKey ? "#e0e0e0" : "#f2f2f2",
  });

  const getExpiredStyle = (expired: Date | null): string => {
    if (!expired) return "";
    const now = new Date(
      new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    ).getTime();
    if (expired.getTime() < now) return "bg-red-200";
    if (expired.getTime() - now <= 30 * 24 * 60 * 60 * 1000)
      return "bg-yellow-200";
    return "";
  };

  // カウント通知
  useEffect(() => {
    onFilteredCountChange?.(sortedFormalinList.length);
  }, [sortedFormalinList, onFilteredCountChange]);

  return (
    <div className="overflow-x-auto shadow rounded-lg">
      <table className="min-w-full divide-y divide-gray-300 table-fixed">
        <thead className="bg-gray-50">
          <tr>
            {/* ホルマリンKey */}
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
                {uniqueValues.key.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </th>

            {/* 場所 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div onClick={() => requestSort("place")} style={getHeaderStyle("place")}>
                場所
              </div>
              <select
                value={selectedFilters.place || ""}
                onChange={(e) => handleFilterChange("place", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.place.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </th>

            {/* 状態 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div onClick={() => requestSort("status")} style={getHeaderStyle("status")}>
                状態
              </div>
              <select
                value={selectedFilters.status || ""}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.status.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </th>

            {/* 最終更新日時 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div
                onClick={() => requestSort("timestamp")}
                style={getHeaderStyle("timestamp")}
              >
                最終更新日時
              </div>
              <select
                value={selectedFilters.timestamp || ""}
                onChange={(e) => handleFilterChange("timestamp", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.timestamp.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </th>

            {/* 規格 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div onClick={() => requestSort("size")} style={getHeaderStyle("size")}>
                規格
              </div>
              <select
                value={selectedFilters.size || ""}
                onChange={(e) => handleFilterChange("size", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.size.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </th>

            {/* 有効期限 */}
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
              <div onClick={() => requestSort("expired")} style={getHeaderStyle("expired")}>
                有効期限
              </div>
              <select
                value={selectedFilters.expired || ""}
                onChange={(e) => handleFilterChange("expired", e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
              >
                <option value="">すべて</option>
                {uniqueValues.expired.map((v) => (
                  <option key={v} value={v}>
                    {v}
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

            {editable && (places.length > 0 || statuses.length > 0) && (
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                操作
              </th>
            )}
          </tr>
        </thead>

        <tbody className="bg-white divide-y divide-gray-200">
          {sortedFormalinList.map((f) => (
            <tr key={f.id} className="hover:bg-gray-50 transition-colors">
              {/* ホルマリンKey */}
              <td className="px-4 py-2 break-words">
                {`${f.lotNumber} - ${f.boxNumber} - ${f.key}`}
              </td>

              {/* 場所 */}
              <td className="px-4 py-2">
                {editable && places.length > 0 ? (
                  <select
                    value={f.place}
                    onChange={(e) => onPlaceChange?.(f.id, e.target.value)}
                    className="w-full p-1 border rounded text-sm"
                  >
                    {places.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  f.place
                )}
              </td>

              {/* 状態 */}
              <td className="px-4 py-2">
                {editable && statuses.length > 0 ? (
                  <select
                    value={f.status}
                    onChange={(e) => onStatusChange?.(f.id, e.target.value)}
                    className="w-full p-1 border rounded text-sm"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  f.status
                )}
              </td>

              {/* 最終更新日時 */}
              <td className="px-4 py-2">
                {f.timestamp
                  ? f.timestamp.toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                    })
                  : "--"}
              </td>

              {/* 規格 */}
              <td className="px-4 py-2">{f.size}</td>

              {/* 有効期限 */}
              <td className={`px-4 py-2 ${getExpiredStyle(f.expired)}`}>
                {f.expired
                  ? f.expired.toLocaleDateString("ja-JP")
                  : "--"}
              </td>

              {showLotNumber && (
                <td className="px-4 py-2">{f.lotNumber}</td>
              )}

              {showHistoryButton && (
                <td className="px-4 py-2">
                  {onHistoryClick && (
                    <button
                      className="text-blue-500 underline hover:text-blue-700 text-sm"
                      onClick={() => onHistoryClick(f.id)}
                    >
                      履歴
                    </button>
                  )}
                </td>
              )}

              {editable && (places.length > 0 || statuses.length > 0) && (
                <td className="px-4 py-2 space-x-2">
                  <button
                    onClick={() => onUpdate?.(f.id)}
                    className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm"
                  >
                    更新
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(f.id)}
                      className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm"
                    >
                      削除
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
