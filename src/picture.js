// ドット絵の画像から、40×40 のマスの色を作る（ドット絵）
// 背景は左上の 1 ピクセルの色。背景でない部分をちょうど囲む正方形を size × size に分け、
// 1 マスの中の 5×5 か所を見て、いちばん多い色（近い色はまとめる）をそのマスの色にする。
// 背景がいちばん多いマスは null（ブロックを置かない）。乱数は使わないので、同じ画像なら毎回同じ

const SAMPLES = 5;
const BG_DIFF = 60; // 背景とみなす色の差（RGB の差の合計）

const toHex = (r, g, b) => [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// pixels: RGBA の配列（ImageData の data）、width・height：画像の大きさ
// 戻り値：{ grid: size×size（色コード or null）, bgHex }
export function gridFromPixels(pixels, width, height, size = 40) {
  const at = (x, y) => { const i = (y * width + x) * 4; return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]; };
  const bg = at(0, 0);
  const isBg = ([r, g, b, a]) => a < 128 || Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) < BG_DIFF;

  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (isBg(at(x, y))) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('絵が見つかりませんでした（背景だけの画像です）');

  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const ox = x0 - (side - (x1 - x0 + 1)) / 2, oy = y0 - (side - (y1 - y0 + 1)) / 2;
  const cell = side / size;
  const grid = Array.from({ length: size }, () => new Array(size).fill(null));
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const buckets = new Map(); // 近い色（16 段階）ごとに [数, r, g, b, 背景か]
    for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
      const x = Math.floor(ox + (i + (sx + 0.5) / SAMPLES) * cell);
      const y = Math.floor(oy + (j + (sy + 0.5) / SAMPLES) * cell);
      const p = x >= 0 && y >= 0 && x < width && y < height ? at(x, y) : [...bg.slice(0, 3), 255];
      const bgp = isBg(p);
      const k = bgp ? 'bg' : `${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}`;
      const b = buckets.get(k) || [0, 0, 0, 0, bgp];
      b[0]++; b[1] += p[0]; b[2] += p[1]; b[3] += p[2];
      buckets.set(k, b);
    }
    let best = null;
    for (const b of buckets.values()) if (!best || b[0] > best[0]) best = b;
    if (!best[4]) grid[j][i] = toHex(best[1] / best[0], best[2] / best[0], best[3] / best[0]);
  }
  return { grid, bgHex: toHex(bg[0], bg[1], bg[2]) };
}

// 画像を読み込んで gridFromPixels にかける（ブラウザ用）
export async function loadPictureGrid(url, size = 40) {
  const img = new Image();
  // 確認用の raw.githack は画像を別のサーバー（rawcdn）から返すことがある。
  // そのままだと色を読み出せない（The operation is insecure）ので、CORS で読み込む
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return gridFromPixels(data, canvas.width, canvas.height, size);
}
