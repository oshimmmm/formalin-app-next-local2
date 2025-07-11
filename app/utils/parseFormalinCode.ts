// app/utils/parseFormalinCode.ts

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
  // 製品コード → サイズ のマッピング
  const codeToSize: Record<string, string> = {
    '4580161081859': '生検用 30ml',
    'FS0M20QA0W30S430': '生検用 30ml',
    '4580161081521': '25ml中性緩衝',
    '4580161080623': '25ml',
    '4580161083907': 'リンパ節用 40ml',
  };

  // 試す製品コード一覧
  const productCodes = Object.keys(codeToSize);

  for (const productCode of productCodes) {
    const pLen = productCode.length;
    // 6 (lot) + 6 (exp) + pLen + 3 (box) + 4 (serial) で全長を検証
    const expectedLen = 6 + 6 + pLen + 3 + 4;
    if (code.length !== expectedLen) continue;
    // まず製品コード部分が一致するか
    if (code.substr(12, pLen) !== productCode) continue;

    // ロット番号
    const lotNumber = code.substring(0, 6);
    // 有効期限 YYMMDD → Date
    const expStr = code.substring(6, 12);
    const year = parseInt('20' + expStr.substring(0, 2), 10);
    const month = parseInt(expStr.substring(2, 4), 10) - 1;
    const day = parseInt(expStr.substring(4, 6), 10);
    const expirationDate = new Date(Date.UTC(year, month, day));

    // 必要なら有効期限チェック
    if (options?.checkExpiration !== false) {
      const nowJST = new Date(
        new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
      );
      if (expirationDate < nowJST) {
        throw new Error('有効期限が過ぎています');
      }
    }

    // 箱番号とシリアルは動的オフセット
    const boxStart = 12 + pLen;
    const boxNumber = code.substring(boxStart, boxStart + 3);
    const serialNumber = code.substring(boxStart + 3, boxStart + 7);

    return {
      lotNumber,
      boxNumber,
      productCode,
      serialNumber,
      expirationDate,
      size: codeToSize[productCode]!,
    };
  }

  // どれにもマッチしなければ null
  return null;
};
