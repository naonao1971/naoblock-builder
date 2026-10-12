// パーツ割り（純粋関数）
// 入力 grid: grid[y][x] = ブロックの色 id か null（空き）。
// 出力 pieces: { x, y, w, h, color, shape }（shape は '2x8' のような向きなしの名前）
// L 字（1×2L）は { x, y, w: 2, h: 2, color, shape: '1x2L', missing }。
// 2×2 から角を 1 つ欠いた形で、missing は欠けている角（'tl' 左上・'tr' 右上・'bl' 左下・'br' 右下）

// 置く順番（面積の大きい順。同じ面積なら太いほうを先に）
export const SHAPES = [
  { name: '2x8', a: 2, b: 8 },
  { name: '2x4', a: 2, b: 4 },
  { name: '2x3', a: 2, b: 3 },
  { name: '1x6', a: 1, b: 6 },
  { name: '2x2', a: 2, b: 2 },
  { name: '1x4', a: 1, b: 4 },
  { name: '1x3', a: 1, b: 3 },
  { name: '1x2', a: 1, b: 2 },
  { name: '1x1', a: 1, b: 1 },
];

export const L_SHAPE = '1x2L';
const L_CORNERS = ['tl', 'tr', 'bl', 'br'];

// 部品リストなどで並べる順（L 字はポッチ 3 つなので 1×3 の次）
export const SHAPE_ORDER = ['2x8', '2x4', '2x3', '1x6', '2x2', '1x4', '1x3', L_SHAPE, '1x2', '1x1'];

// パーツが覆うマス [[x, y], ...]
export function pieceCells(p) {
  const cells = [];
  for (let j = p.y; j < p.y + p.h; j++) {
    for (let i = p.x; i < p.x + p.w; i++) {
      if (p.shape === L_SHAPE) {
        const corner = (j === p.y ? 't' : 'b') + (i === p.x ? 'l' : 'r');
        if (corner === p.missing) continue;
      }
      cells.push([i, j]);
    }
  }
  return cells;
}

// プレートの並び → 継ぎ目の一覧。プロトは 20×20 を 2×2。
export function plateLayout(cols = 2, rows = 2, plateSize = 20) {
  const names = rows === 2 && cols === 2 ? [['左上', '右上'], ['左下', '右下']] : null;
  const plateName = (c, r) => (names ? names[r][c] : `${r + 1}-${c + 1}`);
  const seams = [];
  // 縦の継ぎ目（左右のプレートの間）
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      seams.push({
        id: `v${c}-${r}`, label: `${plateName(c - 1, r)}-${plateName(c, r)}`,
        axis: 'v', at: c * plateSize, from: r * plateSize, to: (r + 1) * plateSize,
      });
    }
  }
  // 横の継ぎ目（上下のプレートの間）
  for (let c = 0; c < cols; c++) {
    for (let r = 1; r < rows; r++) {
      seams.push({
        id: `h${r}-${c}`, label: `${plateName(c, r - 1)}-${plateName(c, r)}`,
        axis: 'h', at: r * plateSize, from: c * plateSize, to: (c + 1) * plateSize,
      });
    }
  }
  return { cols, rows, plateSize, width: cols * plateSize, height: rows * plateSize, seams };
}

function orientations(shape, horizontalFirst) {
  const { a, b } = shape;
  if (a === b) return [[a, a]];
  return horizontalFirst ? [[b, a], [a, b]] : [[a, b], [b, a]];
}

// 長方形が 1 本以上の継ぎ目をまたいでいるか
function crossesSeam(x, y, w, h, seams) {
  return seams.some((s) => (s.axis === 'v'
    ? x < s.at && x + w > s.at && y < s.to && y + h > s.from
    : y < s.at && y + h > s.at && x < s.to && x + w > s.from));
}

// パーツが継ぎ目の t 番目（縦の継ぎ目なら行、横なら列）で、両側のマスを覆っているか
function crossesAt(cellKeys, s, t) {
  return s.axis === 'v'
    ? cellKeys.has(`${s.at - 1},${t}`) && cellKeys.has(`${s.at},${t}`)
    : cellKeys.has(`${t},${s.at - 1}`) && cellKeys.has(`${t},${s.at}`);
}

const keysOf = (p) => new Set(pieceCells(p).map(([x, y]) => `${x},${y}`));

// パーツがその継ぎ目をまたいでいるか（L 字も、覆っているマスで判定）
export function pieceCrossesSeam(p, s) {
  const keys = keysOf(p);
  for (let t = s.from; t < s.to; t++) if (crossesAt(keys, s, t)) return true;
  return false;
}

// ---- L 字：長方形で割ったあとに、1×1 を L 字にまとめて減らす ----
// 1×1 のマス S と、同じ色のパーツ P の端の 2 マス D で L 字を作る。P の残りは許可した長方形（または無し）。
// 候補は「1×2 と合わせる（個数も減る）」→「1×1 を 3 つ合わせる」→「長いパーツの端を借りる（個数は同じ）」の順。
// 継ぎ目をまたぐパーツの数が減る組み替えはしない。同じ入力なら毎回同じ結果（左上の 1×1 から順に見る）。

const RECT_NAMES = new Set(SHAPES.map((x) => x.name));
const rectName = (w, h) => `${Math.min(w, h)}x${Math.max(w, h)}`;

// 3 マスが 2×2 に収まる L 字なら、そのパーツを返す
function lFromCells(cells, color) {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  if (Math.max(...xs) - x !== 1 || Math.max(...ys) - y !== 1) return null;
  const keys = new Set(cells.map(([i, j]) => `${i},${j}`));
  if (keys.size !== 3) return null;
  const missing = L_CORNERS.find((c) => !keys.has(`${x + (c[1] === 'r' ? 1 : 0)},${y + (c[0] === 'b' ? 1 : 0)}`));
  return { x, y, w: 2, h: 2, color, shape: L_SHAPE, missing };
}

// 長方形 P の端から 2 マス（D）を外したときの [D のマス, 残りの長方形 or null] の候補
function endDominoes(p) {
  const out = [];
  const rest = (x, y, w, h) => (w > 0 && h > 0 ? { x, y, w, h, color: p.color, shape: rectName(w, h) } : null);
  if (p.h === 1 || p.w === 1) {
    const horiz = p.h === 1;
    const len = horiz ? p.w : p.h;
    if (len < 2) return out;
    // 先頭側・末尾側の 2 マス
    for (const atStart of [true, false]) {
      const o = atStart ? 0 : len - 2;
      const d = horiz ? [[p.x + o, p.y], [p.x + o + 1, p.y]] : [[p.x, p.y + o], [p.x, p.y + o + 1]];
      const r = len === 2 ? null
        : horiz ? rest(atStart ? p.x + 2 : p.x, p.y, len - 2, 1) : rest(p.x, atStart ? p.y + 2 : p.y, 1, len - 2);
      out.push([d, r]);
    }
  } else if (p.w === 2 || p.h === 2) {
    // 2 マス幅のパーツは、短い辺の端の 2 マス（幅いっぱい）
    const horiz = p.h === 2; // 横長（2 行）なら、端は縦の 2 マス
    const len = horiz ? p.w : p.h;
    for (const atStart of [true, false]) {
      const o = atStart ? 0 : len - 1;
      const d = horiz ? [[p.x + o, p.y], [p.x + o, p.y + 1]] : [[p.x, p.y + o], [p.x + 1, p.y + o]];
      const r = horiz ? rest(atStart ? p.x + 1 : p.x, p.y, len - 1, 2) : rest(p.x, atStart ? p.y + 1 : p.y, 2, len - 1);
      out.push([d, r]);
    }
  }
  return out.filter(([, r]) => r == null || RECT_NAMES.has(r.shape));
}

const seamCrossCount = (ps, seams) => seams.map((s) => ps.filter((p) => pieceCrossesSeam(p, s)).length);

function mergeIntoL(pieces, layout) {
  let list = pieces.slice();
  const owner = new Map(); // "x,y" → パーツ
  const index = () => {
    owner.clear();
    for (const p of list) for (const [x, y] of pieceCells(p)) owner.set(`${x},${y}`, p);
  };
  index();

  // 置き換えても継ぎ目をまたぐ数が減らないか
  const keepsSeams = (before, after) => {
    const a = seamCrossCount(before, layout.seams), b = seamCrossCount(after, layout.seams);
    return b.every((n, i) => n >= a[i]);
  };
  const replace = (remove, add) => {
    list = list.filter((p) => !remove.includes(p)).concat(add);
    index();
  };
  const neighbors = ([x, y]) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];

  const singles = () => list.filter((p) => p.shape === '1x1').sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of singles()) {
    if (!list.includes(s)) continue; // もうまとめられた
    const sc = [s.x, s.y];
    const near = [];
    for (const [nx, ny] of neighbors(sc)) {
      const q = owner.get(`${nx},${ny}`);
      if (q && q !== s && q.color === s.color && !near.includes(q)) near.push(q);
    }
    near.sort((a, b) => a.y - b.y || a.x - b.x);

    let done = false;
    // 1) 1×2 と合わせる
    for (const q of near) {
      if (q.shape !== '1x2') continue;
      const l = lFromCells([sc, ...pieceCells(q)], s.color);
      if (l && keepsSeams([s, q], [l])) { replace([s, q], [l]); done = true; break; }
    }
    if (done) continue;
    // 2) 1×1 を 3 つ合わせる
    const singleNear = near.filter((q) => q.shape === '1x1');
    for (const q of singleNear) {
      for (const [nx, ny] of [...neighbors(sc), ...neighbors([q.x, q.y])]) {
        const r = owner.get(`${nx},${ny}`);
        if (!r || r === s || r === q || r.shape !== '1x1' || r.color !== s.color) continue;
        const l = lFromCells([sc, [q.x, q.y], [r.x, r.y]], s.color);
        if (l && keepsSeams([s, q, r], [l])) { replace([s, q, r], [l]); done = true; break; }
      }
      if (done) break;
    }
    if (done) continue;
    // 3) 長いパーツの端の 2 マスを借りる（1×3 を借りると 1×1 が残るので借りない）
    for (const q of near) {
      if (q.shape === '1x1' || q.shape === '1x2' || q.shape === '1x3' || q.shape === L_SHAPE) continue;
      for (const [d, rest] of endDominoes(q)) {
        const l = lFromCells([sc, ...d], s.color);
        if (!l) continue;
        const add = rest ? [l, rest] : [l];
        if (keepsSeams([s, q], add)) { replace([s, q], add); done = true; break; }
      }
      if (done) break;
    }
  }
  return list;
}

function tileOnce(grid, layout, horizontalFirst) {
  const H = grid.length, W = grid[0].length;
  const used = grid.map((row) => row.map(() => false));
  const pieces = [];

  const fits = (x, y, w, h, color) => {
    if (x + w > W || y + h > H) return false;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (used[j][i] || grid[j][i] !== color) return false;
      }
    }
    return true;
  };
  const place = (x, y, w, h, color, shape) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) used[j][i] = true;
    pieces.push({ x, y, w, h, color, shape });
  };
  const sweep = (seamOnly) => {
    for (const shape of SHAPES) {
      if (seamOnly && shape.b === 1) continue;
      for (const [w, h] of orientations(shape, horizontalFirst)) {
        for (let y = 0; y + h <= H; y++) {
          for (let x = 0; x + w <= W; x++) {
            const color = grid[y][x];
            if (color == null || used[y][x]) continue;
            if (seamOnly && !crossesSeam(x, y, w, h, layout.seams)) continue;
            if (fits(x, y, w, h, color)) place(x, y, w, h, color, shape.name);
          }
        }
      }
    }
  };

  sweep(true);  // まず継ぎ目をまたぐ置き方
  sweep(false); // 残りを大きい形から（最後は 1×1 で必ず埋まる）
  return pieces;
}

const byPosition = (a, b) => a.y - b.y || a.x - b.x;
const singlesOf = (ps) => ps.filter((p) => p.shape === '1x1').length;

// 横向き優先・縦向き優先の 2 通りで割って、個数の少ないほうを返す（同数なら 1×1 の少ないほう、それも同じなら横向き優先）。
// useL が true なら、1×1 を L 字にまとめてから比べる
export function tile(grid, layout = plateLayout(), { useL = true } = {}) {
  const run = (horizontalFirst) => {
    const ps = tileOnce(grid, layout, horizontalFirst);
    return (useL ? mergeIntoL(ps, layout) : ps).sort(byPosition);
  };
  const a = run(true);
  const b = run(false);
  if (b.length !== a.length) return b.length < a.length ? b : a;
  return singlesOf(b) < singlesOf(a) ? b : a;
}

// 検算：全マスがちょうど 1 回／空きに置いていない／中が同じ色／形が許可した 10 種（長方形 9 種＋L 字）
export function verifyTiling(grid, pieces) {
  const H = grid.length, W = grid[0].length;
  const count = grid.map((row) => row.map(() => 0));
  const errors = [];
  pieces.forEach((p, n) => {
    if (p.shape === L_SHAPE) {
      if (p.w !== 2 || p.h !== 2 || !L_CORNERS.includes(p.missing)) errors.push(`#${n} L 字の形がおかしい`);
    } else {
      const key = rectName(p.w, p.h);
      if (!RECT_NAMES.has(key) || key !== p.shape) errors.push(`#${n} 形が許可外: ${p.w}x${p.h}（${p.shape}）`);
    }
    if (p.x < 0 || p.y < 0 || p.x + p.w > W || p.y + p.h > H) { errors.push(`#${n} 盤面の外`); return; }
    for (const [i, j] of pieceCells(p)) {
      {
        count[j][i]++;
        if (grid[j][i] == null) errors.push(`#${n} 空きマス (${i},${j}) に置いている`);
        else if (grid[j][i] !== p.color) errors.push(`#${n} 色が違うマス (${i},${j}) を含む`);
      }
    }
  });
  let filled = 0, coveredCells = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (grid[j][i] != null) {
        filled++;
        if (count[j][i] === 0) errors.push(`(${i},${j}) が覆われていない`);
      }
      if (count[j][i] > 1) errors.push(`(${i},${j}) が ${count[j][i]} 回覆われている`);
      coveredCells += count[j][i];
    }
  }
  return { ok: errors.length === 0, errors, filledCells: filled, coveredCells };
}

// 継ぎ目ごとに、またいでいるパーツの数と、またぐパーツがない区間
// 区間の kind: 'empty' は両側とも空き（背景）、'blocks' はブロックはあるがまたいでいない
export function seamReport(grid, pieces, layout = plateLayout()) {
  return layout.seams.map((s) => {
    const crossing = pieces.filter((p) => pieceCrossesSeam(p, s));
    const crossingKeys = crossing.map(keysOf);
    const gaps = [];
    for (let t = s.from; t < s.to; t++) {
      const hit = crossingKeys.some((keys) => crossesAt(keys, s, t));
      if (hit) continue;
      const [a, b] = s.axis === 'v' ? [grid[t][s.at - 1], grid[t][s.at]] : [grid[s.at - 1][t], grid[s.at][t]];
      const kind = a == null && b == null ? 'empty' : 'blocks';
      const last = gaps[gaps.length - 1];
      if (last && last.kind === kind && last.to === t) last.to = t + 1;
      else gaps.push({ from: t, to: t + 1, kind });
    }
    return { ...s, crossing: crossing.length, gaps, weak: crossing.length === 0 };
  });
}
