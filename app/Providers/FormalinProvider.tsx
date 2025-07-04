"use client";
import React, { createContext, useState, useEffect } from "react";
import { useSession } from "next-auth/react";

import {
  getFormalinData,
  addFormalinData,
  updateFormalinData,
  deleteFormalinData,
} from "../services/formalinService";
import { Formalin } from "../types/Formalin";

/* ---------- 型定義 ---------- */
interface FormalinContextProps {
  formalinList: Formalin[];
  fetchFormalinList: (includeSubmitted?: boolean) => Promise<void>;
  createFormalin: (p: CreateFormalinPayload) => Promise<void>;
  editFormalin: (id: number, p: UpdateFormalinPayload) => Promise<void>;
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
  boxNumber?: string;
  productCode?: string;
  updatedBy?: string;
  updatedAt?: Date;
  oldStatus?: string;
  newStatus?: string;
  oldPlace?: string;
  newPlace?: string;
}
export type UpdateFormalinPayload = CreateFormalinPayload;

/* ---------- Context ---------- */
export const FormalinContext = createContext<FormalinContextProps | null>(null);

/* ---------- Provider ---------- */
export function FormalinProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession(); // loading | unauthenticated | authenticated
  const [formalinList, setFormalinList] = useState<Formalin[]>([]);

  /* 一覧取得 */
  const fetchFormalinList = React.useCallback(
    async (includeSubmitted: boolean = false) => {
      try {
        const data = await getFormalinData(includeSubmitted);
        setFormalinList(data);
      } catch (err) {
        console.error("Error fetching formalin data:", err);
      }
    },
    []
  );

  /* 認証が確定してから 1 回だけ取得 */
  useEffect(() => {
    if (status === "authenticated") {
      // 初期は includeSubmitted=false なので「提出済み以外」を取得
      fetchFormalinList();
    } else {
      setFormalinList([]); // ログアウト時クリア
    }
  }, [status, fetchFormalinList]);

  /* CRUD 操作（認証済み前提） */
  const createFormalin = async (p: CreateFormalinPayload) => {
    if (status !== "authenticated") return;
    try {
      await addFormalinData(p);
      await fetchFormalinList();
    } catch (err) {
      console.error("Error creating formalin:", err);
    }
  };

  const editFormalin = async (id: number, p: UpdateFormalinPayload) => {
    if (status !== "authenticated") return;
    try {
      await updateFormalinData(id, p);
      await fetchFormalinList();
    } catch (err) {
      console.error("Error updating formalin:", err);
    }
  };

  const removeFormalin = async (id: number) => {
    if (status !== "authenticated") return;
    try {
      await deleteFormalinData(id);
      await fetchFormalinList();
    } catch (err) {
      console.error("Error deleting formalin:", err);
    }
  };

  /* 読み込み中は何も描画しない（好みでローダーを置く） */
  if (status === "loading") return null;

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
