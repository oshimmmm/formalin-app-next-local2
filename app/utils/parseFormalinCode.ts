// utils/parseFormalinCode.ts

export interface ParsedFormalinCode {
    boxNumber: string;
    serialNumber: string;
    lotNumber: string;
    expirationDate: Date;
    size: string;
    productCode: string;
  }

  interface ParseOptions {
    checkExpiration?: boolean; // trueなら期限チェック、falseならスキップ
  }
  
  export const parseFormalinCode = (
    code: string,
    options?: ParseOptions
  ): ParsedFormalinCode | null => {
    if (code.length !== 32) {
      return null;
    }

    const boxNumber = code.substring(25, 28);
  
    // シリアルナンバー：コード内の位置を特定して抽出
    const serialNumber = code.substring(28, 32); // 34文字目から14文字
  
    // ロットナンバー
    const lotNumber = code.substring(0, 6); // 26文字目から6文字
  
    // 有効期限
    const expiration = code.substring(6, 12); // 18文字目から6文字
    const expYear = parseInt('20' + expiration.substring(0, 2), 10); // 20XX年
    const expMonth = parseInt(expiration.substring(2, 4), 10); // 月
    const expDay = parseInt(expiration.substring(4, 6), 10); // 日
    const expirationDate = new Date(Date.UTC(expYear, expMonth - 1, expDay)); // 月は0始まり

    // checkExpiration オプションが未指定または true の場合、期限チェックを行う
    if (options?.checkExpiration !== false) {
      const jstNow = new Date(
        new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
      );
      if (expirationDate < jstNow) {
        throw new Error("有効期限が過ぎています");
      }
    }
  
    // 規格
    const productCode = code.substring(12, 25); // 1文字目から16文字
    let size = '';
    if (productCode === '4562160402859') {
      size = '7ml';
    } else  if (productCode === '4580161080616') {
      size = '25ml中性緩衝';
    } else  if (productCode === '4580161080623') {
      size = '25ml';
    } else  if (productCode === '4580161081859') {
      size = '生検用 30ml';
    } else  if (productCode === '4580161081545') {
      size = '3号 40ml';
    } else {
      size = '不明';
    }

    
  
    return {
      boxNumber,
      serialNumber,
      lotNumber,
      expirationDate,
      size,
      productCode,
    };
  };
  