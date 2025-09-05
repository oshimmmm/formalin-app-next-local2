"use client";
import React, { createContext, useState } from "react";
import { useSession } from "next-auth/react";
import {
  getFormalinData,
  addFormalinData,
  updateFormalinData,
  deleteFormalinData,
} from "../services/formalinService";
import { Formalin } from "../types/Formalin";

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
  returnBy?: string;
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
  const { status } = useSession(); // loading | unauthenticated | authenticated
  const [formalinList, setFormalinList] = useState<Formalin[]>([]);

  // 旧ページ向け（注意：/api/formalin の既定は1ページ100件）
  const fetchFormalinList = React.useCallback(async (includeSubmitted = false) => {
    try {
      const data = await getFormalinData(includeSubmitted);
      setFormalinList(data);
    } catch (err) {
      console.error("Error fetching formalin data:", err);
    }
  }, []);

  // ✅ 自動フェッチはやめる（各ページが必要に応じて自前のload()を呼ぶ）
  // useEffect(() => {
  //   if (status === "authenticated") {
  //     fetchFormalinList();
  //   } else {
  //     setFormalinList([]);
  //   }
  // }, [status, fetchFormalinList]);

  const createFormalin = async (p: CreateFormalinPayload) => {
    if (status !== "authenticated") return;
    try {
      await addFormalinData(p);
      // ✅ ここでの全件再フェッチはやめる（各ページがload()で再読込）
      // await fetchFormalinList();
    } catch (err) {
      console.error("Error creating formalin:", err);
    }
  };

  const editFormalin = async (id: number, p: UpdateFormalinPayload) => {
    if (status !== "authenticated") return;
    try {
      await updateFormalinData(id, p);
      // ✅ 同上
      // await fetchFormalinList();
    } catch (err) {
      console.error("Error updating formalin:", err);
    }
  };

  const removeFormalin = async (id: number) => {
    if (status !== "authenticated") return;
    try {
      await deleteFormalinData(id);
      // ✅ 同上
      // await fetchFormalinList();
    } catch (err) {
      console.error("Error deleting formalin:", err);
    }
  };

  if (status === "loading") return null;

  return (
    <FormalinContext.Provider
      value={{
        formalinList,         // 旧ページ用（※最大100件に注意）
        fetchFormalinList,    // 明示的に呼ぶ場合のみ
        createFormalin,
        editFormalin,
        removeFormalin,
      }}
    >
      {children}
    </FormalinContext.Provider>
  );
}
