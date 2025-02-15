/**
 * 受け取った "2025-01-03T04:19:46.482Z" (UTC表記) を JST に変換し、
 * PostgreSQLに挿入しやすい "YYYY-MM-DD HH:mm:ss" 文字列を返す。
 * 
 * @param utcString UTCで表現されたISO日時文字列 (例: "2025-01-03T04:19:46.482Z")
 * @returns JSTの"YYYY-MM-DD HH:mm:ss" 文字列。 null/undefinedの場合はnullを返す。
 */
export function utcStringToJstString(utcString?: string): string | null {
    if (!utcString) return null;
  
    // 1) JSのDateとして扱う (内部はUTC想定)
    const dateUtc = new Date(utcString); 
    if (isNaN(dateUtc.getTime())) {
      // 不正な日付文字列なら null
      return null;
    }
  
    // 3) "YYYY-MM-DD HH:mm:ss" 形式の文字列を作成
    const year  = dateUtc.getFullYear();
    const month = String(dateUtc.getMonth() + 1).padStart(2, '0');
    const day   = String(dateUtc.getDate()).padStart(2, '0');
    const hour  = String(dateUtc.getHours()).padStart(2, '0');
    const min   = String(dateUtc.getMinutes()).padStart(2, '0');
    const sec   = String(dateUtc.getSeconds()).padStart(2, '0');
  
    return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
  }
  