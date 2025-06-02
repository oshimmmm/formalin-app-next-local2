export interface SizeInventoryData {
  inCount: number;
  outCount: number;
  stockCount: number;
  submissionCount: number;  // 追加
}

export interface InventoryDataBySizeType {
  [size: string]: SizeInventoryData;
}