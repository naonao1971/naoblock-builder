// ゲームの進行（パズル型）。DOM を使わない純粋なロジックなので Node からも動かせる。
// 正解かどうかは「持っているブロックが覆うマスが、組立図のマスとまったく同じか」で決める。
// だから Z・S 字のように半回転で同じマスを覆う向きは、どれでも正解になる。
import { rotateCells } from './pieces.js';

const key = ([x, y]) => `${x},${y}`;

function normalize(cells) {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return cells.map(([x, y]) => [x - x0, y - y0]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const sizeOf = (cells) => ({
  w: Math.max(...cells.map((c) => c[0])) + 1,
  h: Math.max(...cells.map((c) => c[1])) + 1,
});
const shapeKey = (cells) => normalize(cells).map(key).join(' ');

// 最初の向き（決まった回し方。乱数は使わない）
const startTurns = (block) => (block.id * 3 + 1) % 4;

export class Game {
  // stages: src/stages.js の buildStages の結果、layout: plateLayout
  // save: { stage, block, stageTimes } があれば、そこから
  constructor({ stages, layout, save = null }) {
    this.stages = stages;
    this.layout = layout;
    this.stageIndex = 0;
    this.blockIndex = 0;
    this.stageTimes = [];
    if (save && save.stage >= 0 && save.stage <= stages.length) {
      this.stageIndex = save.stage;
      this.blockIndex = save.block || 0;
      this.stageTimes = save.stageTimes || [];
    }
    this.skipEmptyStages();
    this.spawn();
  }

  get done() { return this.stageIndex >= this.stages.length; }
  get stage() { return this.stages[this.stageIndex]; }
  get block() { return this.done ? null : this.stage.blocks[this.blockIndex]; }
  get nextBlock() {
    if (this.done) return null;
    if (this.blockIndex + 1 < this.stage.blocks.length) return this.stage.blocks[this.blockIndex + 1];
    for (let s = this.stageIndex + 1; s < this.stages.length; s++) if (this.stages[s].blocks.length) return this.stages[s].blocks[0];
    return null;
  }
  get totalBlocks() { return this.stages.reduce((n, s) => n + s.blocks.length, 0); }
  get placedCount() {
    let n = 0;
    for (let s = 0; s < Math.min(this.stageIndex, this.stages.length); s++) n += this.stages[s].blocks.length;
    return n + (this.done ? 0 : this.blockIndex);
  }

  // ブロックのない（Noun の外側だけの）ステージは飛ばす
  skipEmptyStages() {
    while (!this.done && this.blockIndex >= this.stage.blocks.length) {
      if (this.stageTimes[this.stageIndex] == null) this.stageTimes[this.stageIndex] = 0;
      this.stageIndex++;
      this.blockIndex = 0;
    }
  }

  // ステージの範囲（プレート 1 枚、つなぎは盤面全体）
  stageArea(stage = this.stage) {
    const { layout } = this;
    if (!stage || stage.kind !== 'plate') return { x: 0, y: 0, w: layout.width, h: layout.height };
    const s = layout.plateSize;
    return { x: (stage.plate % layout.cols) * s, y: Math.floor(stage.plate / layout.cols) * s, w: s, h: s };
  }

  // 次のブロックを持つ：ステージの上の端の真ん中に、決まった向きで
  spawn() {
    const b = this.block;
    if (!b) { this.held = null; return; }
    let shape = normalize(b.cells);
    for (let i = 0; i < startTurns(b); i++) shape = rotateCells(shape);
    const { w } = sizeOf(shape);
    const area = this.stageArea();
    this.target = { keys: new Set(b.cells.map(key)), shape: shapeKey(b.cells), x: b.x, y: b.y };
    this.held = { shape, x: area.x + Math.floor((area.w - w) / 2), y: area.y };
    this.home = { x: this.held.x, y: this.held.y };
  }

  heldCells() {
    if (!this.held) return [];
    return this.held.shape.map(([x, y]) => [x + this.held.x, y + this.held.y]);
  }

  // 組立図とまったく同じマスを覆っているか
  isCorrect() {
    const cells = this.heldCells();
    return cells.length === this.target.keys.size && cells.every((c) => this.target.keys.has(key(c)));
  }

  clamp() {
    const { w, h } = sizeOf(this.held.shape);
    this.held.x = Math.max(0, Math.min(this.layout.width - w, this.held.x));
    this.held.y = Math.max(0, Math.min(this.layout.height - h, this.held.y));
  }

  move(dx, dy) {
    if (!this.held) return;
    this.held.x += dx;
    this.held.y += dy;
    this.clamp();
  }

  // 90 度回す（dir = 1 右回り、-1 左回り）。ブロックの真ん中を中心に回す
  rotate(dir = 1) {
    if (!this.held) return;
    const before = sizeOf(this.held.shape);
    const cx = this.held.x + (before.w - 1) / 2, cy = this.held.y + (before.h - 1) / 2;
    let shape = this.held.shape;
    for (let i = 0; i < (dir > 0 ? 1 : 3); i++) shape = rotateCells(shape);
    const after = sizeOf(shape);
    this.held.shape = shape;
    this.held.x = Math.round(cx - (after.w - 1) / 2);
    this.held.y = Math.round(cy - (after.h - 1) / 2);
    this.clamp();
  }

  // 盤面のマスをタップ：
  //  向きが合っていて、タップしたマスが正解の場所なら、そこへ飛んで「はまる」
  //  持っているブロックの上なら回す
  //  それ以外は、そのマスを真ん中にして飛ぶ（飛んだ先が正解なら「はまる」）
  // 小さい子でも押せるように、正解の場所と持っているブロックは周り 1 マスまでを当たりにする
  // 戻り値：'placed' | 'rotated' | 'moved'
  tapCell(cx, cy) {
    if (!this.held) return 'moved';
    const near = (cells) => cells.some(([x, y]) => Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1);
    const targetCells = [...this.target.keys].map((k) => k.split(',').map(Number));
    const onTarget = targetCells.some(([x, y]) => x === cx && y === cy);
    const onHeld = this.heldCells().some(([x, y]) => x === cx && y === cy);
    if (shapeKey(this.held.shape) === this.target.shape && (onTarget || (!onHeld && near(targetCells)))) {
      this.held.x = this.target.x;
      this.held.y = this.target.y;
      return 'placed';
    }
    if (onHeld || near(this.heldCells())) {
      this.rotate(1);
      return 'rotated';
    }
    const { w, h } = sizeOf(this.held.shape);
    this.held.x = cx - Math.floor((w - 1) / 2);
    this.held.y = cy - Math.floor((h - 1) / 2);
    this.clamp();
    return this.isCorrect() ? 'placed' : 'moved';
  }

  // 「はめる」：正解ならはまって次へ。違えば元の場所へ戻る（間違いは数えない）
  // 戻り値：{ ok, stageCleared, done }
  place() {
    if (!this.held) return { ok: false };
    if (!this.isCorrect()) {
      this.held.x = this.home.x;
      this.held.y = this.home.y;
      this.clamp();
      return { ok: false };
    }
    const clearedStage = this.stageIndex;
    this.blockIndex++;
    let stageCleared = false;
    if (this.blockIndex >= this.stage.blocks.length) {
      stageCleared = true;
      this.stageIndex++;
      this.blockIndex = 0;
      this.skipEmptyStages();
    }
    this.spawn();
    return { ok: true, stageCleared, clearedStage, done: this.done };
  }

  // 置き終わったブロック（描画用）
  placedBlocks() {
    const out = [];
    for (let s = 0; s < this.stages.length; s++) {
      const n = s < this.stageIndex ? this.stages[s].blocks.length : s === this.stageIndex ? this.blockIndex : 0;
      for (let i = 0; i < n; i++) out.push(this.stages[s].blocks[i]);
    }
    return out;
  }

  snapshot() {
    return { stage: this.stageIndex, block: this.blockIndex, stageTimes: this.stageTimes.slice() };
  }
}
