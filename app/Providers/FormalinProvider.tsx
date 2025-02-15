"use client";
import React, { createContext, useState, useEffect } from "react";
import {
  getFormalinData,
  addFormalinData,
  updateFormalinData,
  deleteFormalinData,
} from "../services/formalinService";
import { Formalin } from "../types/Formalin";

/** 
 * Contextが提供するメソッドの型定義 
 */
interface FormalinContextProps {
  formalinList: Formalin[];
  fetchFormalinList: () => Promise<void>;
  createFormalin: (payload: CreateFormalinPayload) => Promise<void>;
  editFormalin: (id: number, payload: UpdateFormalinPayload) => Promise<void>;
  removeFormalin: (id: number) => Promise<void>;
}

interface CreateFormalinPayload {
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

export type UpdateFormalinPayload = CreateFormalinPayload;

export const FormalinContext = createContext<FormalinContextProps | null>(null);

export function FormalinProvider({ children }: { children: React.ReactNode }) {
  const [formalinList, setFormalinList] = useState<Formalin[]>([]);

  // 一覧を取得
  async function fetchFormalinList() {
    try {
      const data = await getFormalinData();
      setFormalinList(data);
    } catch (err) {
      console.error("Error fetching formalin data:", err);
    }
  }

  // 初回マウント時に一覧を取得
  useEffect(() => {
    fetchFormalinList();
  }, []);

  // 新規作成
  async function createFormalin(payload: CreateFormalinPayload) {
    try {
      await addFormalinData(payload);
      await fetchFormalinList(); // リストを再取得
    } catch (err) {
      console.error("Error creating formalin:", err);
    }
  }

  // 更新
  async function editFormalin(id: number, payload: UpdateFormalinPayload) {
    try {
      await updateFormalinData(id, payload);
      await fetchFormalinList();
    } catch (err) {
      console.error("Error updating formalin:", err);
    }
  }

  // 削除
  async function removeFormalin(id: number) {
    try {
      await deleteFormalinData(id);
      await fetchFormalinList();
    } catch (err) {
      console.error("Error deleting formalin:", err);
    }
  }

  return (
    <FormalinContext.Provider
      value={{
        formalinList,
        fetchFormalinList,
        createFormalin,
        editFormalin,
        removeFormalin,
      }}
    >
      {children}
    </FormalinContext.Provider>
  );
}
