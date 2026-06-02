export interface InboundEntry {
  lotNumber: string;
  inboundDate: string;
  updatedBy: string;
  count: number;
}

export interface OutboundDetail {
  lotNumber: string;
  outCount: number;    // 出庫済み数
  submissionCount: number;  // 提出済み数
}

export interface StockDetail {
  lotNumber: string;
  count: number;
}

export interface SizeInventoryData {
  inCount: number;
  outCount: number;
  stockCount: number;
  submissionCount: number;
  inboundDetails: InboundEntry[];
  outboundDetails: OutboundDetail[];
  stockDetails: StockDetail[]; // 追加
}

export interface InventoryDataBySizeType {
  [size: string]: SizeInventoryData;
}

// ─── 出庫数照合（まとめVer Excel と 在庫確認 出庫数 の検算）───
export interface ReconcileLotRow {
  lotNumber: string;
  outCount: number;        // 在庫確認ページと同じ net 出庫数
  excelTotal: number;      // まとめVer Excel の数量合計（このロット分）
  crossReturns: number;    // 期またぎ戻入数（前期間に出庫→当期間に戻入）
  inPeriodReturns: number; // 期内の往復戻入数（参考）
  matches: boolean;        // excelTotal - crossReturns === outCount
}

// 識別可能な強制編集（通常フローでは発生しない手動の状態変更）の件数
export interface ForcedEditCounts {
  submittedToOutbound: number; // 提出済み → 出庫済み（提出取消→出庫）
  submittedToInbound: number;  // 提出済み → 入庫済み（提出取消→入庫＝強制戻入）
}

export interface ReconcileSizeData {
  outCount: number;
  excelTotal: number;
  crossReturns: number;
  inPeriodReturns: number;
  matches: boolean;
  forcedEdits: ForcedEditCounts;
  lots: ReconcileLotRow[];
}

export interface ReconcileBySizeType {
  [size: string]: ReconcileSizeData;
}