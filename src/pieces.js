// ゲームのブロック（純粋関数）
// パーツ割りのあとに、隣り合った同じ色の標準パーツを 2〜3 個まとめて「1 手で置くブロック」にする。
// まとめるのはゲームの見せ方だけ。紙の組立図・部品リスト・買い物リストは標準パーツのまま。
import { plateLayout, pieceCells } from './tiling.js';
import { stageOfPiece } from './stages.js';

// まとめる割合（仮）：ステージのブロックの 3 割くらいを組み合わせブロックにする
export const COMBO_RATIO = 0.3;
// 組み合わせブロックの大きさの上限（仮）：マスの数と、囲む四角の長いほうの辺
const MAX_COMBO_CELLS = 12;
const MAX_COMBO_SIDE = 6;

const key = ([x, y]) => `${x},${y}`;

// マスの集まりが長方形か（長方形にまとめても回す楽しさがないので、組み合わせにしない）
function isRectangle(cells) {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  return w * h === cells.length;
}

function boundsOf(cells) {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

// 形を (0,0) 始まりにそろえて、比べられる文字列にする
function normalize(cells) {
  const { x, y } = boundsOf(cells);
  return cells.map(([i, j]) => [i - x, j - y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const shapeKey = (cells) => normalize(cells).map(key).join(' ');

// 90 度回す（右回り）：(x, y) → (-y, x)
export function rotateCells(cells) {
  return normalize(cells.map(([x, y]) => [-y, x]));
}

// 回して見た目が変わる向きの数（長方形は 2、正方形と 1×1 は 1、L 字や山型は 4、Z・S は 2）
export function orientationCount(cells) {
  const seen = new Set();
  let c = normalize(cells);
  for (let r = 0; r < 4; r++) {
    seen.add(shapeKey(c));
    c = rotateCells(c);
  }
  return seen.size;
}

// 決まった順で、まんべんなく散らすための並べ替えの鍵（乱数は使わない）
const spread = (p) => ((p.x * 7 + p.y * 13) % 17) * 10000 + p.y * 100 + p.x;

// ブロックの一覧：[{ id, stage, color, pieces: [パーツの番号…], cells: [[x, y]…], x, y, w, h, combo }]
export function buildBlocks(pieces, layout = plateLayout(), { ratio = COMBO_RATIO } = {}) {
  const stageOf = pieces.map((p) => stageOfPiece(p, layout));
  const cellsOf = pieces.map((p) => pieceCells(p));
  const owner = new Map();
  cellsOf.forEach((cells, i) => cells.forEach((c) => owner.set(key(c), i)));

  // 同じ色・同じステージで、辺で接しているパーツ
  const neighbors = (i) => {
    const out = new Set();
    for (const [x, y] of cellsOf[i]) {
      for (const n of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const j = owner.get(key(n));
        if (j != null && j !== i && pieces[j].color === pieces[i].color && stageOf[j] === stageOf[i]) out.add(j);
      }
    }
    return [...out].sort((a, b) => pieces[a].y - pieces[b].y || pieces[a].x - pieces[b].x);
  };

  const okCombo = (members) => {
    const cells = members.flatMap((m) => cellsOf[m]);
    const b = boundsOf(cells);
    return cells.length <= MAX_COMBO_CELLS && Math.max(b.w, b.h) <= MAX_COMBO_SIDE && !isRectangle(cells);
  };

  const used = new Array(pieces.length).fill(false);
  const combos = [];
  const stageCount = layout.cols * layout.rows + 1;
  for (let st = 0; st < stageCount; st++) {
    const ids = pieces.map((_, i) => i).filter((i) => stageOf[i] === st)
      .sort((a, b) => spread(pieces[a]) - spread(pieces[b]));
    let blocks = ids.length, comboCount = 0;
    for (const i of ids) {
      if (comboCount >= ratio * blocks) break;
      if (used[i]) continue;
      let members = null;
      for (const j of neighbors(i)) {
        if (!used[j] && okCombo([i, j])) { members = [i, j]; break; }
      }
      if (!members) continue;
      // 3 つ目の組み合わせごとに、もう 1 個足して 3 個のまとまりにしてみる
      if (combos.length % 3 === 2) {
        const third = [...neighbors(members[0]), ...neighbors(members[1])]
          .find((k) => !used[k] && !members.includes(k) && okCombo([...members, k]));
        if (third != null) members.push(third);
      }
      members.forEach((m) => { used[m] = true; });
      combos.push(members);
      comboCount++;
      blocks -= members.length - 1;
    }
  }

  const blocks = [];
  const add = (members, combo) => {
    const cells = members.flatMap((m) => cellsOf[m]);
    blocks.push({
      stage: stageOf[members[0]],
      color: pieces[members[0]].color,
      pieces: members.slice().sort((a, b) => a - b),
      cells,
      ...boundsOf(cells),
      combo,
    });
  };
  combos.forEach((m) => add(m, true));
  pieces.forEach((_, i) => { if (!used[i]) add([i], false); });
  blocks.sort((a, b) => a.y - b.y || a.x - b.x);
  blocks.forEach((b, id) => { b.id = id; });
  return blocks;
}

// 検算：全パーツがちょうど 1 回ずつどれかのブロックに入っている／ブロックの中は同じ色／ステージをまたいでいない
export function verifyBlocks(pieces, blocks, layout = plateLayout()) {
  const errors = [];
  const seen = new Array(pieces.length).fill(0);
  for (const b of blocks) {
    for (const i of b.pieces) {
      if (i < 0 || i >= pieces.length) { errors.push(`ブロック ${b.id} に存在しないパーツ #${i}`); continue; }
      seen[i]++;
      if (pieces[i].color !== b.color) errors.push(`ブロック ${b.id} に色の違うパーツ #${i}`);
      if (stageOfPiece(pieces[i], layout) !== b.stage) errors.push(`ブロック ${b.id} がステージをまたいでいる（パーツ #${i}）`);
    }
    if (b.combo && b.pieces.length < 2) errors.push(`ブロック ${b.id} は組み合わせなのに 1 個`);
    if (b.pieces.length > 3) errors.push(`ブロック ${b.id} が 4 個以上`);
  }
  seen.forEach((n, i) => {
    if (n === 0) errors.push(`パーツ #${i} がどのブロックにも入っていない`);
    if (n > 1) errors.push(`パーツ #${i} が ${n} 回入っている`);
  });
  return { ok: errors.length === 0, errors };
}
