"use client";
import axios from "axios";
import { Formalin, RawFormalin, RawHistoryEntry } from "../types/Formalin";

// Next.js App Routerで /api/formalin を作った場合
//   GET  /api/formalin       → 一覧
//   POST /api/formalin       → 新規
//   PUT  /api/formalin/[id]  → 更新
//   DELETE /api/formalin/[id] → 削除
// 実際には [id]/route.ts に書いているはずです。
const API_BASE_URL = "/api/formalin";

// 1) 一覧取得
export async function getFormalinData(): Promise<Formalin[]> {
  const res = await axios.get(API_BASE_URL);
  const rawList = res.data as RawFormalin[];
  const convertedList = rawList.map((item) => {
    return {
      ...item,
      timestamp: item.timestamp ? new Date(item.timestamp) : null,
      expired:   item.expired ? new Date(item.expired) : null,
      lotNumber: item.lot_number,
      boxNumber: item.box_number,
      // ここで、item.histories を RawHistoryEntry[] としてマッピングし、camelCase に変換する
      histories: item.histories?.map((h: RawHistoryEntry) => ({
        history_id: h.history_id,
        updatedBy: h.updated_by,
        updatedAt: h.updated_at ? new Date(h.updated_at) : null,
        oldStatus: h.old_status,
        newStatus: h.new_status,
        oldPlace: h.old_place,
        newPlace: h.new_place,
      })) || [],
    } as Formalin;
  });
  return convertedList;
}

// 2) 新規作成
export async function addFormalinData(
  payload: {
    key?: string;
    place?: string;
    status?: string;
    timestamp?: Date;
    size?: string;
    expired?: Date;
    lotNumber?: string;
    boxNumber?: string;
    // 履歴用
    updatedBy?: string;
    updatedAt?: Date;
    oldStatus?: string;
    newStatus?: string;
    oldPlace?: string;
    newPlace?: string;
  }
): Promise<{ id: number }> {
  // PUT/POSTなどで送信時には、Date→stringに変換しておくと安全
  const body = {
    ...payload,
    timestamp: payload.timestamp ? payload.timestamp.toISOString() : undefined,
    expired: payload.expired ? payload.expired.toISOString() : undefined,
    updatedAt: payload.updatedAt ? payload.updatedAt.toISOString() : undefined,
  };

  const res = await axios.post(API_BASE_URL, body);
  return res.data;
}

// 3) 更新
export async function updateFormalinData(
  id: number,
  payload: {
    key?: string;
    place?: string;
    status?: string;
    timestamp?: Date;
    size?: string;
    expired?: Date;
    lotNumber?: string;
    boxNumber?: string;
    // 履歴用
    updatedBy?: string;
    updatedAt?: Date;
    oldStatus?: string;
    newStatus?: string;
    oldPlace?: string;
    newPlace?: string;
  }
): Promise<void> {
  const body = {
    ...payload,
    timestamp: payload.timestamp ? payload.timestamp.toISOString() : undefined,
    expired: payload.expired ? payload.expired.toISOString() : undefined,
    updatedAt: payload.updatedAt ? payload.updatedAt.toISOString() : undefined,
  };
  await axios.put(`${API_BASE_URL}/${id}`, body);
}

// 4) 削除
export async function deleteFormalinData(id: number): Promise<void> {
  await axios.delete(`${API_BASE_URL}/${id}`);
}
