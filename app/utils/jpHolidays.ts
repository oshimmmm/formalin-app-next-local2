// app/utils/jpHolidays.ts
// 日本の祝日判定（簡易版）
// 対応: 2000-2099 の主な祝日 + 振替休日 + 国民の休日

type YMD = `${number}-${string}-${string}`;

const pad2 = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date): YMD => {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}` as YMD;
};
const fromYMD = (y: number, m: number, d: number) => new Date(y, m - 1, d);

// 第n月曜日（Happy Monday 制度）
function nthMonday(year: number, month: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const day = first.getDay(); // 0=Sun ... 6=Sat
  const offset = (8 - day) % 7; // 最初の月曜までのずれ
  const date = 1 + offset + (n - 1) * 7;
  return new Date(year, month - 1, date);
}

// 春分・秋分（近似式）: 2000-2099
function vernalEquinox(year: number): Date | null {
  if (year < 2000 || year > 2099) return null;
  const day =
    Math.floor(20.8431 + 0.242194 * (year - 1980)) -
    Math.floor((year - 1980) / 4);
  return fromYMD(year, 3, day);
}
function autumnalEquinox(year: number): Date | null {
  if (year < 2000 || year > 2099) return null;
  const day =
    Math.floor(23.2488 + 0.242194 * (year - 1980)) -
    Math.floor((year - 1980) / 4);
  return fromYMD(year, 9, day);
}

function baseHolidaysForYear(year: number): Set<YMD> {
  const s = new Set<YMD>();

  // 固定日（現行ルール準拠、簡易）
  (
    [
      [1, 1], // 元日
      [2, 11], // 建国記念の日
      [2, 23], // 天皇誕生日（現行）
      [4, 29], // 昭和の日
      [5, 3], // 憲法記念日
      [5, 4], // みどりの日
      [5, 5], // こどもの日
      [8, 11], // 山の日
      [11, 3], // 文化の日
      [11, 23], // 勤労感謝の日
    ] as const
  ).forEach(([m, d]) => s.add(toKey(fromYMD(year, m, d))));

  // Happy Monday（簡易適用）
  s.add(toKey(nthMonday(year, 1, 2))); // 成人の日（1月第2月曜）
  s.add(toKey(nthMonday(year, 7, 3))); // 海の日（7月第3月曜）
  s.add(toKey(nthMonday(year, 9, 3))); // 敬老の日（9月第3月曜）
  s.add(toKey(nthMonday(year, 10, 2))); // スポーツの日（10月第2月曜）

  // 春分・秋分
  const ve = vernalEquinox(year);
  if (ve) s.add(toKey(ve));
  const ae = autumnalEquinox(year);
  if (ae) s.add(toKey(ae));

  return s;
}

function addSubstituteHolidays(_year: number, s: Set<YMD>) {
  // 振替休日: 祝日が日曜に当たる場合、その直後の平日（Mon-Fri）で祝日でない日を振替
  const added: YMD[] = [];
  s.forEach((key) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    const d = fromYMD(yy, mm, dd);
    if (d.getDay() === 0) {
      const cur = new Date(d); // ← let から const に
      do {
        cur.setDate(cur.getDate() + 1);
      } while (s.has(toKey(cur)) || cur.getDay() === 0 || cur.getDay() === 6);
      added.push(toKey(cur));
    }
  });
  added.forEach((k) => s.add(k));
}

function addCitizensHolidays(year: number, s: Set<YMD>) {
  // 国民の休日: 祝日に挟まれた平日を祝日にする（簡易）
  const start = fromYMD(year, 1, 2);
  const end = fromYMD(year, 12, 30);
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    // ↑ let から const に
    if (d.getDay() === 0 || d.getDay() === 6) continue; // 土日除外
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    if (s.has(toKey(prev)) && s.has(toKey(next))) {
      s.add(toKey(d));
    }
  }
}

function buildHolidaySet(year: number): Set<YMD> {
  const s = baseHolidaysForYear(year);
  addCitizensHolidays(year, s);
  addSubstituteHolidays(year, s);
  return s;
}

const cache = new Map<number, Set<YMD>>();

export function isJapaneseHoliday(date: Date): boolean {
  const y = date.getFullYear();
  if (y < 2000 || y > 2099) {
    // 範囲外は祝日未対応（必要に応じて拡張）
    return false;
  }
  if (!cache.has(y)) {
    cache.set(y, buildHolidaySet(y));
  }
  const set = cache.get(y)!;
  return set.has(toKey(date));
}
