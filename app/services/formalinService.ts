"use client";
import axios from "axios";
import { Formalin } from "../types/Formalin";

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
  return res.data as Formalin[];
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
