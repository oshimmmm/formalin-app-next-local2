"use client";
import axios from "axios";
import { Formalin, RawFormalin, HistoryEntry } from "../types/Formalin";

const API_BASE_URL = "/api/formalin";

function mapRawToFormalin(item: RawFormalin): Formalin {
  return {
    ...item,
    timestamp: item.timestamp ? new Date(item.timestamp) : (null as unknown as Date),
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    expired: item.expired ? new Date(item.expired) : (null as unknown as Date),
    lotNumber: item.lot_number,
    boxNumber: item.box_number,
    productCode: item.productCode,
    histories: [],
  } as unknown as Formalin;
}

/* ---------------- ページ系の返却 ---------------- */
export interface FormalinPageResult {
  items: Formalin[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------------- 便利フィルタ（既存） ---------------- */
export type FormalinFilter = {
  includeSubmitted?: boolean;
  status?: string;
  place?: string;
  lotNumber?: string;
  boxNumber?: string;
  productCode?: string;
  key?: string;
  dateFrom?: string; // ISO
  dateTo?: string;   // ISO
  size?: string;
};

export async function getFormalinFilteredPage(
  page = 1,
  pageSize = 100,
  filter: FormalinFilter = {}
): Promise<FormalinPageResult> {
  const res = await axios.get(API_BASE_URL, {
    params: { page, pageSize, ...filter },
  });
  const data = res.data as { items: RawFormalin[]; total: number; page: number; pageSize: number };
  return {
    items: data.items.map(mapRawToFormalin),
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
  };
}

export async function countFormalin(filter: FormalinFilter = {}): Promise<number> {
  const res = await axios.get(API_BASE_URL, {
    params: { page: 1, pageSize: 1, ...filter },
  });
  const data = res.data as { items: RawFormalin[]; total: number };
  return data.total ?? 0;
}

export async function findFirstFormalin(filter: FormalinFilter = {}): Promise<Formalin | null> {
  const res = await axios.get(API_BASE_URL, {
    params: { page: 1, pageSize: 1, includeSubmitted: true, ...filter },
  });
  const data = res.data as { items: RawFormalin[]; total: number };
  const first = data.items?.[0];
  return first ? mapRawToFormalin(first) : null;
}

export async function listByBoxLimited(
  lotNumber: string,
  boxNumber: string,
  productCode: string,
  status?: string,
  limit = 500
): Promise<{ items: Formalin[]; total: number }> {
  const res = await axios.get(API_BASE_URL, {
    params: {
      page: 1,
      pageSize: limit,
      includeSubmitted: true,
      lotNumber,
      boxNumber,
      productCode,
      ...(status ? { status } : {}),
    },
  });
  const data = res.data as { items: RawFormalin[]; total: number };
  return { items: (data.items || []).map(mapRawToFormalin), total: data.total ?? 0 };
}

/* ---------------- 旧シンプルAPI（Provider用） ---------------- */
export async function getFormalinData(includeSubmitted = false): Promise<Formalin[]> {
  const res = await axios.get(API_BASE_URL, { params: { includeSubmitted } });
  const rawList: RawFormalin[] = Array.isArray(res.data) ? res.data : res.data.items;
  return rawList.map(mapRawToFormalin);
}

export async function addFormalinData(payload: {
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
}): Promise<{ id: number }> {
  const body = {
    ...payload,
    timestamp: payload.timestamp ? payload.timestamp.toISOString() : undefined,
    expired: payload.expired ? payload.expired.toISOString() : undefined,
    updatedAt: payload.updatedAt ? payload.updatedAt.toISOString() : undefined,
  };
  const res = await axios.post(API_BASE_URL, body);
  return res.data;
}

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
    productCode?: string;
    returnBy?: string;
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

export async function deleteFormalinData(id: number): Promise<void> {
  await axios.delete(`${API_BASE_URL}/${id}`);
}

/* ---------------- 履歴 ---------------- */
type HistoryRowFromApi = {
  id?: number;
  history_id?: number;
  updated_by: string;
  updated_at?: string | null;
  old_status: string;
  new_status: string;
  old_place: string;
  new_place: string;
};

export async function getHistoriesByFormalinId(id: number): Promise<HistoryEntry[]> {
  const res = await axios.get<HistoryRowFromApi[]>(`/api/formalin/${id}/history`);
  const rows = res.data;

  return rows.map<HistoryEntry>((h) => ({
    history_id: h.history_id ?? h.id,
    updatedBy: h.updated_by,
    updatedAt: h.updated_at ? new Date(h.updated_at) : undefined,
    oldStatus: h.old_status,
    newStatus: h.new_status,
    oldPlace: h.old_place,
    newPlace: h.new_place,
  }));
}

/* ---------------- クエリ（ソート対応） ---------------- */
export type FormalinQuery = {
  includeSubmitted?: boolean;
  status?: string;
  statusIn?: string[];
  notStatus?: string;
  lotNumber?: string;
  boxNumber?: string;
  key?: string;
  productCode?: string;
  size?: string;
  updatedAtFrom?: Date;
  updatedAtTo?: Date;
  countOnly?: boolean;
  // ★ 追加
  sort?: "timestampAsc" | "timestampDesc";
};

export async function getFormalinPage(
  page = 1,
  pageSize = 100,
  q: FormalinQuery = {}
): Promise<FormalinPageResult> {
  const params: Record<string, string | number | boolean | undefined> = {
    page,
    pageSize: q.countOnly ? 0 : pageSize,
    includeSubmitted: q.includeSubmitted,
    status: q.status,
    statusIn: q.statusIn?.join(","),
    notStatus: q.notStatus,
    lotNumber: q.lotNumber,
    boxNumber: q.boxNumber,
    key: q.key,
    productCode: q.productCode,
    size: q.size,
    updatedAtFrom: q.updatedAtFrom?.toISOString(),
    updatedAtTo: q.updatedAtTo?.toISOString(),
    countOnly: q.countOnly ? true : undefined,
    sort: q.sort, // ★ ここでAPIへ渡す
  };

  const res = await axios.get(API_BASE_URL, { params });
  const data = res.data as { items: RawFormalin[]; total: number; page: number; pageSize: number };
  return {
    items: (data.items ?? []).map(mapRawToFormalin),
    total: data.total ?? 0,
    page: data.page ?? page,
    pageSize: data.pageSize ?? (q.countOnly ? 0 : pageSize),
  };
}

export async function getFormalinCount(q: Omit<FormalinQuery, "countOnly">): Promise<number> {
  const res = await getFormalinPage(1, 0, { ...q, countOnly: true });
  return res.total;
}
