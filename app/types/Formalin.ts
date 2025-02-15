export interface Formalin {
    id: number;
    key: string;
    place: string;
    status: string;
    timestamp: Date;
    size: string;
    expired: Date;
    lotNumber: string;
    history: HistoryEntry[];  // 必須
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
  
  // 新規登録時に使う型
  export type NewFormalin = Omit<Formalin, 'id' | 'history'>;
  
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
  
  
    