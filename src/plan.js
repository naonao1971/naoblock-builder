// 盤面・部品リスト・買い物リストの組み立て（純粋関数）
import { BLOCK_COLORS, buildColorMap } from './palette.js';
import { SHAPE_ORDER, plateLayout, tile, verifyTiling, seamReport } from './tiling.js';

// 32×32 に出てくる元の色（多い順、同数なら色コード順）
export function sourceColors(noun) {
  const counts = new Map();
  for (const row of noun) for (const c of row) if (c != null) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([hex, count]) => ({ hex, count }));
}

// 32×32 を 40×40 の真ん中へ。透明（背景）は null のまま＝ブロックを置かない
export function buildBoard(noun, colorMap, layout = plateLayout()) {
  const ox = Math.floor((layout.width - noun[0].length) / 2);
  const oy = Math.floor((layout.height - noun.length) / 2);
  const board = Array.from({ length: layout.height }, () => new Array(layout.width).fill(null));
  noun.forEach((row, y) => row.forEach((c, x) => {
    if (c != null) board[y + oy][x + ox] = colorMap[c];
  }));
  return board;
}

// 形 × 色 × 個数（色は表の順、形は大きい順）
export function partsList(pieces, colors = BLOCK_COLORS) {
  const counts = new Map();
  for (const p of pieces) {
    const key = `${p.color}|${p.shape}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const colorOrder = (id) => colors.findIndex((c) => c.id === id);
  const shapeOrder = (s) => SHAPE_ORDER.indexOf(s);
  return [...counts.entries()]
    .map(([key, count]) => {
      const [color, shape] = key.split('|');
      return { color, shape, count };
    })
    .sort((a, b) => colorOrder(a.color) - colorOrder(b.color) || shapeOrder(a.shape) - shapeOrder(b.shape));
}

// 袋数 = ceil(個数 ÷ 入数)。プレートは枚数 × 値段
export function shoppingList(parts, partsData, plateCount) {
  const lines = parts.map((p) => {
    const info = partsData.parts[p.shape];
    const bags = Math.ceil(p.count / info.perBag);
    return { ...p, perBag: info.perBag, bags, price: bags * info.price };
  });
  const plate = { name: partsData.plate.name, count: plateCount, price: plateCount * partsData.plate.price };
  const partsTotal = lines.reduce((s, l) => s + l.price, 0);
  return {
    lines,
    plate,
    bags: lines.reduce((s, l) => s + l.bags, 0),
    partsTotal,
    total: partsTotal + plate.price,
  };
}

// まとめて計算する
export function makePlan(noun, { overrides = {}, partsData, layout = plateLayout() } = {}) {
  const sources = sourceColors(noun);
  const colorMap = buildColorMap(sources.map((s) => s.hex), overrides);
  const board = buildBoard(noun, colorMap, layout);
  const pieces = tile(board, layout);
  const check = verifyTiling(board, pieces);
  const seams = seamReport(board, pieces, layout);
  const parts = partsList(pieces);
  const shopping = partsData ? shoppingList(parts, partsData, layout.cols * layout.rows) : null;
  return { layout, sources, colorMap, board, pieces, check, seams, parts, shopping };
}
