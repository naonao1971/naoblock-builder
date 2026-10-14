// ゲームのステージ（純粋関数）
// プレート 1 枚＝1 ステージ（左上→右上→左下→右下）、最後に継ぎ目をまたぐパーツの「つなぎ」ステージ。
import { plateLayout } from './tiling.js';
import { platesOf, plateName } from './steps.js';

// ステージの型と落ちる速さ（仮。遊んで調整する）
// タイムアタックはステージ 1 から落ちてきて、だんだん速くなる。れんしゅうは落ちてこない（src/main.js で puzzle 型にする）
export const STAGE_TYPES = [
  { type: 'fall', fallMs: 1000 }, // 1 左上
  { type: 'fall', fallMs: 850 },  // 2 右上
  { type: 'fall', fallMs: 700 },  // 3 左下
  { type: 'fall', fallMs: 600 },  // 4 右下
  { type: 'fall', fallMs: 500 },  // 5 つなぎ
];

// パーツがどのステージに入るか（プレートの番号、またがるなら plateCount＝つなぎ）
export function stageOfPiece(piece, layout = plateLayout()) {
  const plates = platesOf(piece, layout);
  return plates.length === 1 ? plates[0] : layout.cols * layout.rows;
}

// ステージごとのパーツの番号
export function piecesByStage(pieces, layout = plateLayout()) {
  const count = layout.cols * layout.rows + 1;
  const out = Array.from({ length: count }, () => []);
  pieces.forEach((p, i) => out[stageOfPiece(p, layout)].push(i));
  return out;
}

// ブロックを出す順番：下の行から（ブロックのいちばん下のマスで比べる）、同じ行なら左から
export function blockOrder(blocks) {
  const bottom = (b) => Math.max(...b.cells.map((c) => c[1]));
  const left = (b) => Math.min(...b.cells.filter((c) => c[1] === bottom(b)).map((c) => c[0]));
  return blocks.slice().sort((a, b) => bottom(b) - bottom(a) || left(a) - left(b));
}

// ステージの一覧：[{ index, kind, plate, label, type, fallMs, blocks }]
// blocks は src/pieces.js の buildBlocks の結果（ブロックごとに stage を持っている）
export function buildStages(blocks, layout = plateLayout()) {
  const plateCount = layout.cols * layout.rows;
  const stages = [];
  for (let k = 0; k <= plateCount; k++) {
    const kind = k < plateCount ? 'plate' : 'join';
    const t = STAGE_TYPES[Math.min(k, STAGE_TYPES.length - 1)];
    stages.push({
      index: k,
      kind,
      plate: kind === 'plate' ? k : null,
      label: kind === 'plate' ? `${plateName(k, layout)}プレート` : 'つなぎ',
      type: t.type,
      fallMs: t.fallMs,
      blocks: blockOrder(blocks.filter((b) => b.stage === k)),
    });
  }
  return stages;
}
