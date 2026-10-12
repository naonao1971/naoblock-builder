// 盤面の描画の部品（ポッチ・パーツ・輪郭・完成した盤面）
import { colorById, hexToRgb } from './palette.js';
import { pieceCells } from './tiling.js';


export function rgb(hex, amount = 0, alpha = 1) {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v + amount))));
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---- 描画の部品（盤面と完成画面で共通。s は 1 マスの実ピクセル）----

export function drawStud(ctx, s, x, y, hex, alpha = 1) {
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

// パーツの輪郭（覆っているマスの外側の辺）。inset だけ内側に寄せる
export function outlinePath(ctx, s, cells, inset) {
  const keys = new Set(cells.map(([x, y]) => `${x},${y}`));
  const has = (x, y) => keys.has(`${x},${y}`);
  ctx.beginPath();
  for (const [x, y] of cells) {
    const l = x * s, t = y * s, r = (x + 1) * s, b = (y + 1) * s;
    if (!has(x, y - 1)) { ctx.moveTo(l, t + inset); ctx.lineTo(r, t + inset); }
    if (!has(x, y + 1)) { ctx.moveTo(l, b - inset); ctx.lineTo(r, b - inset); }
    if (!has(x - 1, y)) { ctx.moveTo(l + inset, t); ctx.lineTo(l + inset, b); }
    if (!has(x + 1, y)) { ctx.moveTo(r - inset, t); ctx.lineTo(r - inset, b); }
  }
}

export function drawPiece(ctx, s, p, { alpha = 1, studs = true, dx = 0, dy = 0 } = {}) {
  const hex = colorById(p.color).hex;
  const cells = pieceCells(p);
  ctx.save();
  ctx.translate(dx, dy);
  ctx.fillStyle = rgb(hex, 0, alpha);
  for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s, s);
  if (studs) for (const [x, y] of cells) drawStud(ctx, s, x, y, hex, alpha);
  ctx.strokeStyle = `rgba(0,0,0,${0.45 * alpha})`;
  ctx.lineWidth = Math.max(1, s * 0.06);
  outlinePath(ctx, s, cells, ctx.lineWidth / 2);
  ctx.stroke();
  ctx.restore();
}

// 完成した盤面（光や薄い表示のない、きれいな絵）を (0, 0) から描く
export function drawFinishedBoard(ctx, { layout, pieces, plateHex, scale }) {
  ctx.fillStyle = `#${plateHex}`;
  ctx.fillRect(0, 0, layout.width * scale, layout.height * scale);
  for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) drawStud(ctx, scale, x, y, plateHex);
  for (const p of pieces) drawPiece(ctx, scale, p);
}
