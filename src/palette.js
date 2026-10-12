// ブロックの色の表と、いちばん近い色を選ぶ処理（純粋関数）
// RGB は仮の値。実物・商品写真で直すときはこの表だけ変える。

export const BLOCK_COLORS = [
  { id: 'black', name: 'ブラック', hex: '1a1a1a' },
  { id: 'white', name: 'ホワイト', hex: 'f4f4f4' },
  { id: 'light-gray', name: 'ライトグレー', hex: 'c8c8c8' },
  { id: 'gray', name: 'グレー', hex: '9a9a9a' },
  { id: 'dark-gray', name: 'ダークグレー', hex: '5a5a5a' },
  { id: 'red', name: 'レッド', hex: 'd32f2f' },
  { id: 'orange', name: 'オレンジ', hex: 'f57c00' },
  { id: 'yellow-orange', name: 'イエロー・オレンジ', hex: 'ffb300' },
  { id: 'yellow', name: 'イエロー', hex: 'fdd835' },
  { id: 'light-green', name: 'ライトグリーン', hex: '8bc34a' },
  { id: 'green', name: 'グリーン', hex: '2e7d32' },
  { id: 'dark-blue', name: 'ダークブルー', hex: '1a3a8a' },
  { id: 'pastel-blue', name: 'パステルブルー', hex: '90c8f0' },
  { id: 'purple', name: 'パープル', hex: '7b3fa0' },
  { id: 'pink', name: 'ピンク', hex: 'f48fb1' },
  { id: 'peach', name: 'ピーチ', hex: 'f6c7a4' },
  { id: 'beige', name: 'ベージュ', hex: 'd9c49a' },
  { id: 'brown', name: 'ブラウン', hex: '7a4a2a' },
];

export function colorById(id, colors = BLOCK_COLORS) {
  return colors.find((c) => c.id === id);
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
}

// sRGB → CIE Lab（D65）
export function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// 同じ距離なら表の先にある色を選ぶ（毎回同じ結果にするため）
export function nearestBlockColor(hex, colors = BLOCK_COLORS) {
  const lab = hexToLab(hex);
  let best = null, bestD = Infinity;
  for (const c of colors) {
    const d = labDistance(lab, hexToLab(c.hex));
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.id;
}

// 元の色の一覧 → { 元の色: ブロックの色 id }。overrides で手の変更を上書き。
export function buildColorMap(sourceHexes, overrides = {}, colors = BLOCK_COLORS) {
  const map = {};
  for (const hex of sourceHexes) {
    map[hex] = overrides[hex] && colorById(overrides[hex], colors) ? overrides[hex] : nearestBlockColor(hex, colors);
  }
  return map;
}
