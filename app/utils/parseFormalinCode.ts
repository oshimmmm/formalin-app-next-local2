// utils/parseFormalinCode.ts

export interface ParsedFormalinCode {
    serialNumber: string;
    lotNumber: string;
    expirationDate: Date;
    size: string;
  }
  
  export const parseFormalinCode = (code: string): ParsedFormalinCode | null => {
    if (code.length !== 29) {
      return null;
    }
  
    // シリアルナンバー：コード内の位置を特定して抽出
    const serialNumber = code.substring(25, 29); // 34文字目から14文字
  
    // ロットナンバー
    const lotNumber = code.substring(0, 6); // 26文字目から6文字
  
    // 有効期限
    const expiration = code.substring(6, 12); // 18文字目から6文字
    const expYear = parseInt('20' + expiration.substring(0, 2), 10); // 20XX年
    const expMonth = parseInt(expiration.substring(2, 4), 10); // 月
    const expDay = parseInt(expiration.substring(4, 6), 10); // 日
    const expirationDate = new Date(Date.UTC(expYear, expMonth - 1, expDay)); // 月は0始まり
  
    // 規格
    const productCode = code.substring(12, 25); // 1文字目から16文字
    let size = '';
    if (productCode === '4562160402859') {
      size = '7ml';
    } else if (productCode === '4562160407892') {
      size = '25ml';
    } else  if (productCode === '4562160403580') {
      size = '30ml';
    } else {
      size = '不明';
    }
  
    return {
      serialNumber,
      lotNumber,
      expirationDate,
      size,
    };
  };
  