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