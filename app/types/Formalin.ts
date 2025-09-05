export interface Formalin {
    id: number;
    key: string;
    place: string;
    status: string;
    timestamp: Date;
    size: string;
    expired: Date;
    lotNumber: string;
    boxNumber: string;
    productCode: string;
    returnBy: string; // 返却先
    histories: HistoryEntry[];  // 必須
  }
  
  export interface HistoryEntry {
    history_id?: number;
    updatedBy: string;
    updatedAt?: Date;
    oldStatus: string;
    newStatus: string;
    oldPlace: string;
    newPlace: string;
  }
  
// RawFormalin: 受信時、日付フィールドが string | null になる
export interface RawFormalin {
  id: number;
  key: string;
  place: string;
  status: string;
  size: string;
  lot_number: string;
  box_number: string;
  productCode: string;
  returnBy: string; // 返却先
  timestamp: string | null;
  expired: string | null;
  histories: RawHistoryEntry[]; // ここを RawHistoryEntry[] とする
}

// RawHistoryEntry: APIから受け取る生の履歴データ（キーはスネークケース）
export interface RawHistoryEntry {
  history_id?: number;
  updated_by: string;
  updated_at?: string | null;
  old_status: string;
  new_status: string;
  old_place: string;
  new_place: string;
}

  // 新規登録時に使う型
  export type NewFormalin = Omit<Formalin, 'id' | 'histories'>;
  
  // export interface Formalin {
  //   id: string; // FirestoreのドキュメントID
  //   key: string; // ホルマリンのキー（シリアルナンバー）
  //   place: string; // 場所（入庫、出庫時に設定）
  //   status: '入庫済み' | '出庫済み' | '提出済み';
  //   timestamp: Date; // 最終更新日時
  //   size: string; // ホルマリンの規格（25ml、40mlなど）
  //   expired: Date; // 有効期限
  //   lotNumber: string;
  // }
  
  
    