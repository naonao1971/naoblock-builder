// タイムアタックのランキング（この端末だけ。Noun の番号ごと・ガイドあり／なしごとに上位 5 件）

export const RANK_SIZE = 5;

const rankingKey = (id, guide) => `naoblock:ranking:v1:noun:${id}:timeattack${guide ? ':guide' : ''}`;
const oldBestKey = (id) => `naoblock:best:v1:noun:${id}:timeattack`; // PR #9 のベスト記録

// 記録を入れる（純粋関数）。速い順、同じタイムなら先に出したほうが上。
// 戻り値：{ list: 新しいランキング, rank: 入った順位（0 始まり、入らなければ -1） }
export function insertRanking(list, entry, size = RANK_SIZE) {
  const all = [...list, entry].sort((a, b) => a.totalMs - b.totalMs || a.at - b.at);
  const next = all.slice(0, size);
  return { list: next, rank: next.indexOf(entry) };
}

export function loadRanking(id, guide = false) {
  try {
    const list = JSON.parse(localStorage.getItem(rankingKey(id, guide)) || 'null');
    if (Array.isArray(list)) return list;
    if (guide) return [];
    // PR #9 で残したベスト記録があれば、ランキングの 1 件目として引き継ぐ
    const best = JSON.parse(localStorage.getItem(oldBestKey(id)) || 'null');
    return best && best.totalMs >= 0 ? [{ totalMs: best.totalMs, at: best.at || 0, stageTimes: [] }] : [];
  } catch {
    return [];
  }
}

// 記録してランキングを返す
export function recordRanking(id, totalMs, stageTimes, guide = false) {
  const entry = { totalMs: Math.round(totalMs), at: Date.now(), stageTimes: stageTimes.map((t) => Math.round(t || 0)) };
  const { list, rank } = insertRanking(loadRanking(id, guide), entry);
  try { localStorage.setItem(rankingKey(id, guide), JSON.stringify(list)); } catch { /* 保存できない環境では残らない */ }
  return { list, rank };
}
