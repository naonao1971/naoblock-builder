// ゲームの盤面の描画とタップ判定（拡大はしない。盤面は枠いっぱいに収める）
import { colorById } from './palette.js';
import { drawStud, drawPiece, outlinePath, rgb } from './board.js';

const FLY_MS = 120;
const DROP_MS = 160;
const SHAKE_MS = 320;
const MAX_BACKING = 4096; // canvas の実ピクセルの上限（iOS の制限よけ）

export class GameView {
  constructor(container, canvas, { layout, pieces, plateHex, game, onTap }) {
    this.container = container;
    this.canvas = canvas;
    this.layout = layout;
    this.pieces = pieces;
    this.plateHex = plateHex;
    this.game = game;
    this.onTap = onTap;
    this.layer = document.createElement('canvas'); // プレートと置き終わったパーツ
    this.hint = false;
    this.locked = false; // ステージクリアの間は光らせない
    this.fly = null; // { fromX, fromY, t0 }
    this.drops = []; // { block, t0, onLand }
    this.shakeT0 = -Infinity;
    this.raf = 0;

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.bindInput();
    this.loop();
  }

  resize() {
    const pad = 12;
    const cw = this.container.clientWidth - pad, ch = this.container.clientHeight - pad;
    const cell = Math.max(3, Math.min(cw / this.layout.width, ch / this.layout.height));
    const cssW = cell * this.layout.width, cssH = cell * this.layout.height;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_BACKING / Math.max(cssW, cssH));
    this.cellCss = cell;
    this.scale = cell * dpr;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = this.layer.width = Math.round(cssW * dpr);
    this.canvas.height = this.layer.height = Math.round(cssH * dpr);
    this.renderLayer();
  }

  // ---- 状態の変化 ----

  // 置き終わったものが変わったとき（はじめ・続きから・もう一度）
  refresh() {
    this.drops = [];
    this.fly = null;
    this.renderLayer();
  }

  // 持っているブロックが飛んだ／動いた（なめらかに動かす）
  movedFrom(x, y) {
    this.fly = { fromX: x, fromY: y, t0: performance.now() };
  }

  // はまった：上から落としてはめる。はまった瞬間に onLand
  dropBlock(block, onLand) {
    this.drops.push({ block, t0: performance.now(), onLand });
  }

  shake() {
    this.shakeT0 = performance.now();
  }

  // ---- 描画 ----

  renderLayer() {
    const ctx = this.layer.getContext('2d');
    const s = this.scale;
    const { width, height } = this.layout;
    ctx.fillStyle = `#${this.plateHex}`;
    ctx.fillRect(0, 0, this.layer.width, this.layer.height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) drawStud(ctx, s, x, y, this.plateHex);
    const dropping = new Set(this.drops.map((d) => d.block.id));
    for (const b of this.game.placedBlocks()) {
      if (dropping.has(b.id)) continue;
      for (const i of b.pieces) drawPiece(ctx, s, this.pieces[i]);
    }
  }

  drawSeams(ctx) {
    const { width, height, plateSize, cols, rows } = this.layout;
    const s = this.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.setLineDash([s * 0.4, s * 0.3]);
    for (let c = 1; c < cols; c++) {
      ctx.beginPath(); ctx.moveTo(c * plateSize * s, 0); ctx.lineTo(c * plateSize * s, height * s); ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * plateSize * s); ctx.lineTo(width * s, r * plateSize * s); ctx.stroke();
    }
    ctx.restore();
  }

  // 今のステージのプレートだけ明るく、ほかは暗く
  drawDim(ctx) {
    const g = this.game;
    if (g.done || g.stage.kind !== 'plate') return;
    const s = this.scale;
    const a = g.stageArea();
    ctx.save();
    ctx.fillStyle = 'rgba(20,20,30,0.42)';
    ctx.beginPath();
    ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    ctx.rect(a.x * s, a.y * s, a.w * s, a.h * s);
    ctx.fill('evenodd');
    ctx.restore();
  }

  // 持っているブロック：半透明で浮かせる。正解の場所に重なったら縁を光らせる
  drawHeld(ctx, now) {
    const g = this.game;
    if (!g.held || this.locked) return;
    const s = this.scale;
    const hex = colorById(g.block.color).hex;
    let ox = 0, oy = 0;
    if (this.fly) {
      const t = Math.min(1, (now - this.fly.t0) / FLY_MS);
      if (t >= 1) this.fly = null;
      else {
        const e = 1 - (1 - t) * (1 - t);
        ox = (this.fly.fromX - g.held.x) * (1 - e) * s;
        oy = (this.fly.fromY - g.held.y) * (1 - e) * s;
      }
    }
    const st = now - this.shakeT0;
    if (st < SHAKE_MS) ox += Math.sin(st / 22) * s * 0.4 * (1 - st / SHAKE_MS);

    const cells = g.heldCells();
    const correct = g.isCorrect() && !this.fly;
    ctx.save();
    ctx.translate(ox, oy - s * 0.18); // 少し浮かせる
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const [x, y] of cells) ctx.fillRect(x * s + s * 0.12, y * s + s * 0.3, s, s);
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = `#${hex}`;
    for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s, s);
    for (const [x, y] of cells) drawStud(ctx, s, x, y, hex);
    ctx.globalAlpha = 1;
    if (correct) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.shadowColor = 'rgba(255,210,0,0.95)';
      ctx.shadowBlur = s * (0.5 + 0.6 * pulse);
      ctx.strokeStyle = `rgba(255,${200 + Math.round(40 * pulse)},0,1)`;
      ctx.lineWidth = Math.max(2, s * 0.2);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(2, s * 0.12);
    }
    outlinePath(ctx, s, cells, ctx.lineWidth / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgb(hex, -80, 0.9);
    ctx.lineWidth = Math.max(1, s * 0.05);
    outlinePath(ctx, s, cells, 0);
    ctx.stroke();
    ctx.restore();
  }

  // ヒント：正解の場所を光らせる
  drawHint(ctx, now) {
    const g = this.game;
    if (!this.hint || !g.held || this.locked) return;
    const s = this.scale;
    const cells = [...g.target.keys].map((k) => k.split(',').map(Number));
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.3 * pulse})`;
    for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s, s);
    ctx.strokeStyle = `rgba(255,170,0,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.setLineDash([s * 0.35, s * 0.2]);
    outlinePath(ctx, s, cells, ctx.lineWidth / 2);
    ctx.stroke();
    ctx.restore();
  }

  drawDrops(ctx, now) {
    const s = this.scale;
    const landed = [];
    for (const d of this.drops) {
      const t = Math.min(1, (now - d.t0) / DROP_MS);
      if (t >= 1) { landed.push(d); continue; }
      const e = t * t;
      for (const i of d.block.pieces) drawPiece(ctx, s, this.pieces[i], { dy: -(1 - e) * s * 0.8, alpha: 0.7 + 0.3 * e });
    }
    if (landed.length) {
      this.drops = this.drops.filter((d) => !landed.includes(d));
      const lctx = this.layer.getContext('2d');
      for (const d of landed) {
        for (const i of d.block.pieces) {
          drawPiece(lctx, s, this.pieces[i]);
          drawPiece(ctx, s, this.pieces[i]);
        }
        d.onLand?.();
      }
    }
  }

  loop() {
    this.raf = requestAnimationFrame((now) => {
      const ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.layer, 0, 0);
      this.drawDrops(ctx, now);
      this.drawDim(ctx);
      this.drawSeams(ctx);
      this.drawHint(ctx, now);
      this.drawHeld(ctx, now);
      this.loop();
    });
  }

  // ---- 入力（盤面のタップ） ----

  bindInput() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointercancel', () => { down = null; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 12) return;
      const r = this.canvas.getBoundingClientRect();
      const cell = r.width / this.layout.width;
      const cx = Math.floor((e.clientX - r.left) / cell);
      const cy = Math.floor((e.clientY - r.top) / cell);
      if (cx < 0 || cy < 0 || cx >= this.layout.width || cy >= this.layout.height) return;
      this.onTap?.(cx, cy);
    });
  }

  destroy() {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.raf);
  }
}

// ブロックの見本（「つぎ」）：形だけを小さく描く
export function drawBlockPreview(canvas, block, cellPx = 12) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  if (!block) {
    canvas.width = canvas.height = 1;
    canvas.style.width = canvas.style.height = '0px';
    return;
  }
  const cells = block.cells.map(([x, y]) => [x - block.x, y - block.y]);
  const s = cellPx * dpr;
  canvas.width = block.w * s;
  canvas.height = block.h * s;
  canvas.style.width = `${block.w * cellPx}px`;
  canvas.style.height = `${block.h * cellPx}px`;
  const hex = colorById(block.color).hex;
  ctx.fillStyle = `#${hex}`;
  for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s, s);
  for (const [x, y] of cells) drawStud(ctx, s, x, y, hex);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, dpr);
  outlinePath(ctx, s, cells, ctx.lineWidth / 2);
  ctx.stroke();
}
