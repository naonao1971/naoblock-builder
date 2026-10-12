// 盤面の描画・ズーム・タップ判定
import { colorById, hexToRgb } from './palette.js';

const DROP_MS = 170;
const SHAKE_MS = 320;
const MAX_CELL_CSS = 56; // いちばん拡大したときの 1 マスの大きさ（CSS px）
const MAX_BACKING = 4096; // canvas の実ピクセルの上限（iOS の制限よけ）

function rgb(hex, amount = 0, alpha = 1) {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v + amount))));
  return `rgba(${r},${g},${b},${alpha})`;
}

export class Board {
  // container: スクロールする枠、canvas: その中の canvas
  constructor(container, canvas, { layout, pieces, plateHex, onTap }) {
    this.container = container;
    this.canvas = canvas;
    this.layout = layout;
    this.pieces = pieces;
    this.plateHex = plateHex;
    this.onTap = onTap;

    this.placed = new Array(pieces.length).fill(false);
    this.current = null; // 光らせるパーツ
    this.upcoming = []; // このステップでこの後置くパーツ
    this.drops = []; // { index, t0 }
    this.shakeT0 = -Infinity;
    this.zoom = 1;
    this.layer = document.createElement('canvas'); // 置いたパーツとプレート
    this.raf = 0;

    this.resize();
    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  // ---- 大きさ・ズーム ----

  fitCell() {
    const pad = 16;
    const w = this.container.clientWidth - pad, h = this.container.clientHeight - pad;
    return Math.max(4, Math.min(w / this.layout.width, h / this.layout.height));
  }

  get maxZoom() {
    return Math.max(1, MAX_CELL_CSS / this.fitCell());
  }

  get cellCss() {
    return this.fitCell() * this.zoom;
  }

  resize() {
    const cell = this.cellCss;
    const cssW = cell * this.layout.width, cssH = cell * this.layout.height;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_BACKING / Math.max(cssW, cssH));
    this.scale = cell * dpr; // 1 マスの実ピクセル
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = this.layer.width = Math.round(cssW * dpr);
    this.canvas.height = this.layer.height = Math.round(cssH * dpr);
    this.renderLayer();
    this.frame();
  }

  // anchor（画面上の点）の下にある盤面の点を動かさずにズーム
  setZoom(z, anchorX, anchorY) {
    z = Math.max(1, Math.min(this.maxZoom, z));
    if (Math.abs(z - this.zoom) < 1e-3) return;
    const cRect = this.container.getBoundingClientRect();
    const ax = anchorX ?? cRect.left + cRect.width / 2;
    const ay = anchorY ?? cRect.top + cRect.height / 2;
    const before = this.canvas.getBoundingClientRect();
    const fx = (ax - before.left) / before.width, fy = (ay - before.top) / before.height;
    this.zoom = z;
    this.resize();
    const after = this.canvas.getBoundingClientRect();
    this.container.scrollLeft += after.left + fx * after.width - ax;
    this.container.scrollTop += after.top + fy * after.height - ay;
  }

  zoomBy(factor) {
    this.setZoom(this.zoom * factor);
  }

  // パーツが枠の外なら、そこへスクロール
  ensureVisible(index, smooth = true) {
    if (index == null) return;
    const p = this.pieces[index];
    const cell = this.cellCss;
    const c = this.container;
    const left = this.canvas.offsetLeft + p.x * cell, top = this.canvas.offsetTop + p.y * cell;
    const right = left + p.w * cell, bottom = top + p.h * cell;
    const m = cell;
    const inside = left - m >= c.scrollLeft && right + m <= c.scrollLeft + c.clientWidth
      && top - m >= c.scrollTop && bottom + m <= c.scrollTop + c.clientHeight;
    if (inside) return;
    c.scrollTo({
      left: (left + right) / 2 - c.clientWidth / 2,
      top: (top + bottom) / 2 - c.clientHeight / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  // ---- 状態 ----

  setPlaced(indices) {
    this.placed.fill(false);
    for (const i of indices) this.placed[i] = true;
    this.drops = [];
    this.renderLayer();
    this.frame();
  }

  setGuide(current, upcoming = []) {
    this.current = current;
    this.upcoming = upcoming;
    this.frame();
  }

  // パーツを上から落としてはめる。はまった瞬間に onLand
  drop(index, onLand) {
    this.placed[index] = true;
    this.drops.push({ index, t0: performance.now(), onLand });
    this.frame();
  }

  shake() {
    this.shakeT0 = performance.now();
    this.frame();
  }

  // 光っているパーツの周り margin マスまでを当たりにする
  hits(index, cx, cy, margin = 1) {
    const p = this.pieces[index];
    return cx >= p.x - margin && cx < p.x + p.w + margin && cy >= p.y - margin && cy < p.y + p.h + margin;
  }

  // ---- 描画 ----

  drawStud(ctx, x, y, hex, alpha = 1) {
    const s = this.scale;
    const cx = (x + 0.5) * s, cy = (y + 0.5) * s, r = s * 0.31;
    ctx.beginPath();
    ctx.arc(cx + s * 0.04, cy + s * 0.06, r, 0, Math.PI * 2);
    ctx.fillStyle = rgb(hex, -45, alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgb(hex, 18, alpha);
    ctx.fill();
  }

  drawPiece(ctx, p, { alpha = 1, studs = true, dx = 0, dy = 0 } = {}) {
    const s = this.scale;
    const hex = colorById(p.color).hex;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.fillStyle = rgb(hex, 0, alpha);
    ctx.fillRect(p.x * s, p.y * s, p.w * s, p.h * s);
    if (studs) {
      for (let j = p.y; j < p.y + p.h; j++) for (let i = p.x; i < p.x + p.w; i++) this.drawStud(ctx, i, j, hex, alpha);
    }
    ctx.strokeStyle = `rgba(0,0,0,${0.45 * alpha})`;
    ctx.lineWidth = Math.max(1, s * 0.06);
    const lw = ctx.lineWidth / 2;
    ctx.strokeRect(p.x * s + lw, p.y * s + lw, p.w * s - lw * 2, p.h * s - lw * 2);
    ctx.restore();
  }

  renderLayer() {
    const ctx = this.layer.getContext('2d');
    const { width, height, plateSize, cols, rows } = this.layout;
    const s = this.scale;
    ctx.fillStyle = `#${this.plateHex}`;
    ctx.fillRect(0, 0, this.layer.width, this.layer.height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) this.drawStud(ctx, x, y, this.plateHex);
    this.pieces.forEach((p, i) => { if (this.placed[i] && !this.drops.some((d) => d.index === i)) this.drawPiece(ctx, p); });

    // プレートの境目
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.setLineDash([s * 0.4, s * 0.3]);
    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * plateSize * s, 0);
      ctx.lineTo(c * plateSize * s, height * s);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * plateSize * s);
      ctx.lineTo(width * s, r * plateSize * s);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  frame() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => { this.raf = 0; this.draw(t); });
  }

  draw(now) {
    const ctx = this.canvas.getContext('2d');
    const s = this.scale;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.layer, 0, 0);

    // この後置く場所（うすく）
    for (const i of this.upcoming) this.drawPiece(ctx, this.pieces[i], { alpha: 0.2, studs: false });

    // 次に置く場所（点滅する枠＋薄い色）
    let animating = false;
    if (this.current != null && !this.placed[this.current]) {
      const p = this.pieces[this.current];
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      const st = now - this.shakeT0;
      const dx = st < SHAKE_MS ? Math.sin(st / 22) * s * 0.35 * (1 - st / SHAKE_MS) : 0;
      this.drawPiece(ctx, p, { alpha: 0.35 + 0.25 * pulse, studs: true, dx });
      ctx.save();
      ctx.translate(dx, 0);
      ctx.shadowColor = 'rgba(255,200,0,0.9)';
      ctx.shadowBlur = s * (0.4 + 0.5 * pulse);
      ctx.strokeStyle = `rgba(255,${190 + Math.round(50 * pulse)},0,${0.75 + 0.25 * pulse})`;
      ctx.lineWidth = Math.max(2, s * 0.16);
      ctx.strokeRect(p.x * s - s * 0.08, p.y * s - s * 0.08, p.w * s + s * 0.16, p.h * s + s * 0.16);
      ctx.restore();
      animating = true;
    }

    // 落ちてくるパーツ
    const landed = [];
    for (const d of this.drops) {
      const t = Math.min(1, (now - d.t0) / DROP_MS);
      if (t >= 1) { landed.push(d); continue; }
      const e = t * t; // だんだん速く
      const p = this.pieces[d.index];
      ctx.fillStyle = `rgba(0,0,0,${0.25 * e})`;
      ctx.fillRect(p.x * s, p.y * s, p.w * s, p.h * s);
      this.drawPiece(ctx, p, { dy: -(1 - e) * s * 1.6, alpha: 0.6 + 0.4 * e });
      animating = true;
    }
    if (landed.length) {
      this.drops = this.drops.filter((d) => !landed.includes(d));
      const lctx = this.layer.getContext('2d');
      for (const d of landed) {
        this.drawPiece(lctx, this.pieces[d.index]);
        this.drawPiece(ctx, this.pieces[d.index]);
        d.onLand?.();
      }
    }

    if (animating || this.drops.length) this.frame();
  }

  // ---- 入力 ----

  bindInput() {
    const c = this.container;
    let down = null;
    let pinch = null;

    c.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) { down = null; return; }
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    c.addEventListener('pointercancel', () => { down = null; });
    c.addEventListener('pointerup', (e) => {
      if (!down || pinch || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 10) return;
      const r = this.canvas.getBoundingClientRect();
      const cell = r.width / this.layout.width;
      const cx = Math.floor((e.clientX - r.left) / cell), cy = Math.floor((e.clientY - r.top) / cell);
      this.onTap?.(cx, cy);
    });

    // ピンチ（2 本指）
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    c.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinch = { d: dist(e.touches), z: this.zoom };
        down = null;
      }
    }, { passive: true });
    c.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [mx, my] = mid(e.touches);
      this.setZoom(pinch.z * dist(e.touches) / pinch.d, mx, my);
    }, { passive: false });
    c.addEventListener('touchend', (e) => {
      if (e.touches.length < 2 && pinch) setTimeout(() => { pinch = null; }, 50);
    });

    // PC：Ctrl＋ホイール（トラックパッドのピンチも含む）
    c.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY / 200), e.clientX, e.clientY);
    }, { passive: false });
  }

  destroy() {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.raf);
  }
}
