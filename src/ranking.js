// タイムアタックのランキング（この端末だけ。題材（Noun の番号・ドット絵）ごと・ガイドあり／なしごとに上位 5 件）
// subject は src/subjects.js の題材（kind と id だけを使う）

export const RANK_SIZE = 5;

// Nouns は今までと同じ naoblock:ranking:v1:noun:<番号>:timeattack[:guide]
export const rankingKey = (subject, guide) => `naoblock:ranking:v1:${subject.kind}:${subject.id}:timeattack${guide ? ':guide' : ''}`;
const oldBestKey = (subject) => `naoblock:best:v1:noun:${subject.id}:timeattack`; // PR #9 のベスト記録（Nouns だけ）

// 記録を入れる（純粋関数）。速い順、同じタイムなら先に出したほうが上。
// 戻り値：{ list: 新しいランキング, rank: 入った順位（0 始まり、入らなければ -1） }
export function insertRanking(list, entry, size = RANK_SIZE) {
  const all = [...list, entry].sort((a, b) => a.totalMs - b.totalMs || a.at - b.at);
  const next = all.slice(0, size);
  return { list: next, rank: next.indexOf(entry) };
}

export function loadRanking(subject, guide = false) {
  try {
    const list = JSON.parse(localStorage.getItem(rankingKey(subject, guide)) || 'null');
    if (Array.isArray(list)) return list;
    if (guide || subject.kind !== 'noun') return [];
    // PR #9 で残したベスト記録があれば、ランキングの 1 件目として引き継ぐ
    const best = JSON.parse(localStorage.getItem(oldBestKey(subject)) || 'null');
    return best && best.totalMs >= 0 ? [{ totalMs: best.totalMs, at: best.at || 0, stageTimes: [] }] : [];
  } catch {
    return [];
  }
}

// 記録してランキングを返す
export function recordRanking(subject, totalMs, stageTimes, guide = false) {
  const entry = { totalMs: Math.round(totalMs), at: Date.now(), stageTimes: stageTimes.map((t) => Math.round(t || 0)) };
  const { list, rank } = insertRanking(loadRanking(subject, guide), entry);
  try { localStorage.setItem(rankingKey(subject, guide), JSON.stringify(list)); } catch { /* 保存できない環境では残らない */ }
  return { list, rank };
}
