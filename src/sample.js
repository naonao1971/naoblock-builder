// お手本の絵（完成図の小窓と、大きく表示したときの完成図／元絵）
import { colorById } from './palette.js';

// 完成図：ブロックの色に置き換えた 40×40。空きはプレートの色
export function completedPixels(board, plateHex) {
  return board.map((row) => row.map((c) => (c == null ? plateHex : colorById(c).hex)));
}

// 元絵：Nouns の本来の色。完成図と同じ 40×40 の枠に、背景色で塗って真ん中に置く
export function originalPixels(noun, bgHex, width = 40, height = 40) {
  const ox = Math.floor((width - noun[0].length) / 2), oy = Math.floor((height - noun.length) / 2);
  const out = Array.from({ length: height }, () => new Array(width).fill(bgHex));
  noun.forEach((row, y) => row.forEach((c, x) => { if (c != null) out[y + oy][x + ox] = c; }));
  return out;
}

// ドットをくっきり描く：1 ドットを整数の実ピクセルにして、CSS の大きさをそれに合わせる
// frame（{ x, y, w, h }、ドット単位）があれば細い枠を重ねる
export function drawPixels(canvas, pixels, cssSize, frame = null) {
  const h = pixels.length, w = pixels[0].length;
  const dpr = window.devicePixelRatio || 1;
  const dot = Math.max(1, Math.round((cssSize * dpr) / Math.max(w, h)));
  canvas.width = w * dot;
  canvas.height = h * dot;
  canvas.style.width = `${(w * dot) / dpr}px`;
  canvas.style.height = `${(h * dot) / dpr}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = `#${pixels[y][x]}`;
      ctx.fillRect(x * dot, y * dot, dot, dot);
    }
  }
  if (frame) {
    // どの色の上でも見えるよう、黒い線の内側に黄色い線
    const lw = Math.max(1, Math.round(dpr));
    const rect = (inset) => ctx.strokeRect(frame.x * dot + inset, frame.y * dot + inset, frame.w * dot - inset * 2, frame.h * dot - inset * 2);
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    rect(lw / 2);
    ctx.strokeStyle = '#ffd000';
    rect(lw * 1.5);
  }
}
