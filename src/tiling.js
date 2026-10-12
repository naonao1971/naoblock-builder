// パーツ割り（純粋関数）
// 入力 grid: grid[y][x] = ブロックの色 id か null（空き）。
// 出力 pieces: { x, y, w, h, color, shape }（shape は '2x8' のような向きなしの名前）

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

// 1 本以上の継ぎ目をまたいでいるか
function crossesSeam(x, y, w, h, seams) {
  return seams.some((s) => (s.axis === 'v'
    ? x < s.at && x + w > s.at && y < s.to && y + h > s.from
    : y < s.at && y + h > s.at && x < s.to && x + w > s.from));
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

// 横向き優先・縦向き優先の 2 通りで割って、個数の少ないほうを返す（同数なら横向き優先）
export function tile(grid, layout = plateLayout()) {
  const a = tileOnce(grid, layout, true);
  const b = tileOnce(grid, layout, false);
  return b.length < a.length ? b : a;
}

// 検算：全マスがちょうど 1 回／空きに置いていない／中が同じ色／形が許可した 9 種
export function verifyTiling(grid, pieces) {
  const H = grid.length, W = grid[0].length;
  const count = grid.map((row) => row.map(() => 0));
  const errors = [];
  const allowed = new Set(SHAPES.map((s) => `${s.a}x${s.b}`));
  pieces.forEach((p, n) => {
    const key = `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}`;
    if (!allowed.has(key) || key !== p.shape) errors.push(`#${n} 形が許可外: ${p.w}x${p.h}（${p.shape}）`);
    if (p.x < 0 || p.y < 0 || p.x + p.w > W || p.y + p.h > H) { errors.push(`#${n} 盤面の外`); return; }
    for (let j = p.y; j < p.y + p.h; j++) {
      for (let i = p.x; i < p.x + p.w; i++) {
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
    const crossing = pieces.filter((p) => crossesSeam(p.x, p.y, p.w, p.h, [s]));
    const gaps = [];
    for (let t = s.from; t < s.to; t++) {
      const hit = crossing.some((p) => (s.axis === 'v' ? p.y <= t && t < p.y + p.h : p.x <= t && t < p.x + p.w));
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
