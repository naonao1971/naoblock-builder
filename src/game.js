// ゲームの進行（パズル型）。DOM を使わない純粋なロジックなので Node からも動かせる。
// 正解かどうかは「持っているブロックが覆うマスが、組立図のマスとまったく同じか」で決める。
// だから Z・S 字のように半回転で同じマスを覆う向きは、どれでも正解になる。
// 部品 1 個だけのブロックは、同じステージのまだ置いていない「同じ色・同じ形（部品 1 個）」の場所にもはまる。
// そのときは、その場所のブロックと出す順番を入れ替える（組み合わせブロックは今まで通り、決まった場所だけ）。
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

const single = (b) => !b.combo && b.pieces.length === 1;
const identity = (n) => Array.from({ length: n }, (_, i) => i);
const isOrder = (order, n) => Array.isArray(order) && order.length === n && [...order].sort((a, b) => a - b).every((v, i) => v === i);

export class Game {
  // stages: src/stages.js の buildStages の結果、layout: plateLayout
  // save: { stage, block, stageTimes, order } があれば、そこから
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
    // 今のステージの中で、ブロックを出す順番（別の場所にはめると入れ替わる）
    const n = this.done ? 0 : this.stage.blocks.length;
    this.order = this.blockIndex > 0 && isOrder(save?.order, n) ? save.order.slice() : identity(n);
    this.skipEmptyStages();
    this.spawn();
  }

  get done() { return this.stageIndex >= this.stages.length; }
  get stage() { return this.stages[this.stageIndex]; }
  get block() { return this.done ? null : this.stage.blocks[this.order[this.blockIndex]]; }
  get nextBlock() {
    if (this.done) return null;
    if (this.blockIndex + 1 < this.stage.blocks.length) return this.stage.blocks[this.order[this.blockIndex + 1]];
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
      this.order = this.done ? [] : identity(this.stage.blocks.length);
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

  // はめられる場所：本来の場所と、部品 1 個のブロックなら、まだ置いていない同じ色・同じ形の場所
  // 戻り値：[{ pos: 出す順番の位置, keys, shape, x, y, cells }]（先頭が本来の場所）
  places() {
    const b = this.block;
    if (!b) return [];
    const one = (pos) => {
      const blk = this.stage.blocks[this.order[pos]];
      return { pos, keys: new Set(blk.cells.map(key)), shape: shapeKey(blk.cells), x: blk.x, y: blk.y, cells: blk.cells };
    };
    const out = [one(this.blockIndex)];
    if (!single(b)) return out;
    const shape = shapeKey(b.cells);
    for (let pos = this.blockIndex + 1; pos < this.order.length; pos++) {
      const o = this.stage.blocks[this.order[pos]];
      if (single(o) && o.color === b.color && o.cells.length === b.cells.length) {
        // 同じ形：回して同じマスの並びになる
        let c = normalize(o.cells);
        for (let i = 0; i < 4; i++, c = rotateCells(c)) if (shapeKey(c) === shape) { out.push(one(pos)); break; }
      }
    }
    return out;
  }

  // 持っているブロックが、はめられる場所のどれかとまったく同じマスを覆っていれば、その場所（なければ null）
  matchPlace() {
    const cells = this.heldCells();
    return this.places().find((p) => cells.length === p.keys.size && cells.every((c) => p.keys.has(key(c)))) || null;
  }

  // 組立図とまったく同じマスを覆っているか（同じ色・同じ形の別の場所も含む）
  isCorrect() {
    return this.matchPlace() != null;
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
    const onHeld = this.heldCells().some(([x, y]) => x === cx && y === cy);
    const heldShape = shapeKey(this.held.shape);
    const fits = this.places().filter((p) => p.shape === heldShape);
    const hit = fits.find((p) => p.cells.some(([x, y]) => x === cx && y === cy))
      || (!onHeld && fits.find((p) => near(p.cells)));
    if (hit) {
      this.held.x = hit.x;
      this.held.y = hit.y;
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

  // ---- 落ちてくる型（ステージの型が 'fall' のとき） ----

  get falling() { return !this.done && this.stage.type === 'fall'; }

  // 持った直後の場所（ステージの上の端）へ戻す。向きはそのまま
  backToTop() {
    if (!this.held) return;
    this.held.x = this.home.x;
    this.held.y = this.home.y;
    this.clamp();
  }

  // 1 マス落とす。ステージの下の端まで落ちてもはまらなかったら、上からやり直し
  // 戻り値：'moved' | 'reset'
  fall() {
    if (!this.held) return 'moved';
    const { h } = sizeOf(this.held.shape);
    const area = this.stageArea();
    if (this.held.y + h >= area.y + area.h) {
      this.backToTop();
      return 'reset';
    }
    this.held.y += 1;
    return 'moved';
  }

  // 今のステージを最初からやり直す（タイムアタックの時間切れ）
  restartStage() {
    if (this.done) return;
    this.blockIndex = 0;
    this.order = identity(this.stage.blocks.length);
    this.spawn();
  }

  // 「はめる」：正解ならはまって次へ。違えば元の場所へ戻る（間違いは数えない）
  // 戻り値：{ ok, block: はまったブロック, stageCleared, done }
  place() {
    if (!this.held) return { ok: false };
    const at = this.matchPlace();
    if (!at) {
      this.held.x = this.home.x;
      this.held.y = this.home.y;
      this.clamp();
      return { ok: false };
    }
    // 別の場所にはまったら、そこのブロックと出す順番を入れ替える（同じ色・同じ形なので見た目は同じ）
    if (at.pos !== this.blockIndex) {
      [this.order[this.blockIndex], this.order[at.pos]] = [this.order[at.pos], this.order[this.blockIndex]];
    }
    const block = this.block;
    const clearedStage = this.stageIndex;
    this.blockIndex++;
    let stageCleared = false;
    if (this.blockIndex >= this.stage.blocks.length) {
      stageCleared = true;
      this.stageIndex++;
      this.blockIndex = 0;
      this.order = this.done ? [] : identity(this.stage.blocks.length);
      this.skipEmptyStages();
    }
    this.spawn();
    return { ok: true, block, stageCleared, clearedStage, done: this.done };
  }

  // 置き終わったブロック（描画用）
  placedBlocks() {
    const out = [];
    for (let s = 0; s < this.stages.length; s++) {
      const n = s < this.stageIndex ? this.stages[s].blocks.length : s === this.stageIndex ? this.blockIndex : 0;
      for (let i = 0; i < n; i++) out.push(this.stages[s].blocks[s === this.stageIndex ? this.order[i] : i]);
    }
    return out;
  }

  snapshot() {
    return { stage: this.stageIndex, block: this.blockIndex, stageTimes: this.stageTimes.slice(), order: this.order.slice() };
  }
}
