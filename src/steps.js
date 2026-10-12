// 組立順（純粋関数）
// プレート 1 枚ずつ（左上→右上→左下→右下）、その中を色ごとに 1 ステップ。
// 継ぎ目をまたぐパーツは、またぐプレートのうち最後のプレートのステップのあとの「つなぎ」ステップで置く。
// ステップ内は上の行から、同じ行なら左から（パーツの左上のマスで並べる）。
import { BLOCK_COLORS } from './palette.js';
import { plateLayout, pieceCells } from './tiling.js';

const PLATE_NAMES_2x2 = ['左上', '右上', '左下', '右下'];

export function plateName(index, layout = plateLayout()) {
  if (layout.cols === 2 && layout.rows === 2) return PLATE_NAMES_2x2[index];
  return `${Math.floor(index / layout.cols) + 1}-${(index % layout.cols) + 1}`;
}

// パーツが載っているプレートの番号（左上→右上→左下→右下の順の番号）を小さい順に
export function platesOf(piece, layout = plateLayout()) {
  const s = layout.plateSize;
  const set = new Set(pieceCells(piece).map(([x, y]) => Math.floor(y / s) * layout.cols + Math.floor(x / s)));
  return [...set].sort((a, b) => a - b);
}

const byPosition = (pieces) => (a, b) => pieces[a].y - pieces[b].y || pieces[a].x - pieces[b].x;
const colorOrder = (id) => BLOCK_COLORS.findIndex((c) => c.id === id);

// 色ごとに分けて、色は表の順。中身はパーツの番号（pieces の添字）の並び
function groupByColor(indices, pieces) {
  const groups = new Map();
  for (const i of indices) {
    const c = pieces[i].color;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(i);
  }
  return [...groups.entries()]
    .sort((a, b) => colorOrder(a[0]) - colorOrder(b[0]))
    .map(([color, list]) => ({ color, pieces: list.sort(byPosition(pieces)) }));
}

// 出力：[{ kind: 'plate' | 'join', plate, plates, label, color, pieces: [pieces の添字…] }]
// plate は 'plate' ならそのプレート、'join' なら「この後に置ける最後のプレート」
export function buildSteps(pieces, layout = plateLayout()) {
  const plateCount = layout.cols * layout.rows;
  const own = Array.from({ length: plateCount }, () => []);
  const join = Array.from({ length: plateCount }, () => []);
  pieces.forEach((p, i) => {
    const plates = platesOf(p, layout);
    if (plates.length === 1) own[plates[0]].push(i);
    else join[plates[plates.length - 1]].push(i);
  });

  const steps = [];
  for (let k = 0; k < plateCount; k++) {
    for (const g of groupByColor(own[k], pieces)) {
      steps.push({ kind: 'plate', plate: k, plates: [k], label: `${plateName(k, layout)}プレート`, ...g });
    }
    for (const g of groupByColor(join[k], pieces)) {
      const plates = [...new Set(g.pieces.flatMap((i) => platesOf(pieces[i], layout)))].sort((a, b) => a - b);
      steps.push({ kind: 'join', plate: k, plates, label: `つなぎ（${plates.map((n) => plateName(n, layout)).join('・')}）`, ...g });
    }
  }
  return steps;
}

// 置く順番に並べたパーツの番号
export function pieceOrder(steps) {
  return steps.flatMap((s) => s.pieces);
}

// 検算：全パーツがちょうど 1 回ずつどこかのステップに入っている／
// 継ぎ目をまたぐパーツは、またぐ全部のプレートのステップが終わったあと／
// またがないパーツは自分のプレートのステップに入っている
export function verifySteps(pieces, steps, layout = plateLayout()) {
  const errors = [];
  const seen = new Array(pieces.length).fill(0);
  const stepOf = new Array(pieces.length).fill(-1);
  steps.forEach((s, si) => s.pieces.forEach((i) => {
    if (i < 0 || i >= pieces.length) { errors.push(`ステップ ${si + 1} に存在しないパーツ #${i}`); return; }
    seen[i]++;
    stepOf[i] = si;
    if (pieces[i].color !== s.color) errors.push(`ステップ ${si + 1} に色の違うパーツ #${i}`);
  }));
  seen.forEach((n, i) => {
    if (n === 0) errors.push(`パーツ #${i} がどのステップにも入っていない`);
    if (n > 1) errors.push(`パーツ #${i} が ${n} 回入っている`);
  });

  // プレートごとの「そのプレートのステップの最後」
  const lastOwn = new Array(layout.cols * layout.rows).fill(-1);
  steps.forEach((s, si) => { if (s.kind === 'plate') lastOwn[s.plate] = si; });

  let joinCount = 0;
  pieces.forEach((p, i) => {
    if (stepOf[i] < 0) return;
    const plates = platesOf(p, layout);
    const step = steps[stepOf[i]];
    if (plates.length === 1) {
      if (step.kind !== 'plate' || step.plate !== plates[0]) errors.push(`パーツ #${i} が自分のプレートのステップにない`);
      return;
    }
    joinCount++;
    if (step.kind !== 'join') errors.push(`継ぎ目をまたぐパーツ #${i} が「つなぎ」ステップにない`);
    for (const k of plates) {
      if (stepOf[i] <= lastOwn[k]) errors.push(`継ぎ目をまたぐパーツ #${i} が${plateName(k, layout)}プレートより前に置かれる`);
    }
  });
  return { ok: errors.length === 0, errors, joinCount };
}

// ステップで組む範囲（お手本の小窓に枠で出す）：プレートのステップはプレート 1 枚、つなぎはパーツを囲む四角
export function stepArea(step, pieces, layout = plateLayout()) {
  if (step.kind === 'plate') {
    const s = layout.plateSize;
    return { x: (step.plate % layout.cols) * s, y: Math.floor(step.plate / layout.cols) * s, w: s, h: s };
  }
  const ps = step.pieces.map((i) => pieces[i]);
  const x = Math.min(...ps.map((p) => p.x)), y = Math.min(...ps.map((p) => p.y));
  const x2 = Math.max(...ps.map((p) => p.x + p.w)), y2 = Math.max(...ps.map((p) => p.y + p.h));
  return { x, y, w: x2 - x, h: y2 - y };
}
