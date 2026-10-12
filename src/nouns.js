// Nouns の seed 取得と 32×32 への復元
// fetchSeed / fetchImageData だけがネットワークを使う。decodeNoun は純粋関数。

export const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_clnbcoajmebxn33wdbt98f439/subgraphs/nouns-mainnet/1.0.0/gn';
export const IMAGE_DATA_URL = 'https://unpkg.com/@nouns/assets@0.10.0/dist/image-data.json';

export const NOUN_SIZE = 32;

export async function fetchSeed(id) {
  const query = `{ noun(id: "${Number(id)}") { seed { background body accessory head glasses } } }`;
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`サブグラフの取得に失敗しました（HTTP ${res.status}）`);
  const json = await res.json();
  const seed = json?.data?.noun?.seed;
  if (!seed) throw new Error(`Noun ${id} が見つかりません`);
  const out = {};
  for (const k of ['background', 'body', 'accessory', 'head', 'glasses']) out[k] = Number(seed[k]);
  return out;
}

export async function fetchImageData() {
  const res = await fetch(IMAGE_DATA_URL);
  if (!res.ok) throw new Error(`パーツの絵の取得に失敗しました（HTTP ${res.status}）`);
  return res.json();
}

function hexToBytes(hex) {
  const s = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.substr(i * 2, 2), 16);
  return bytes;
}

// RLE の 1 パーツを grid に重ねる。色番号 0 は透明。
export function drawPart(grid, data, palette) {
  const b = hexToBytes(data);
  const top = b[1], right = b[2], left = b[4];
  let x = left, y = top;
  for (let i = 5; i + 1 < b.length; i += 2) {
    const len = b[i], color = b[i + 1];
    for (let n = 0; n < len; n++) {
      if (color !== 0) grid[y][x] = palette[color].toLowerCase();
      x++;
      if (x === right) { x = left; y++; }
    }
  }
  return grid;
}

// seed → 32×32（各マスは 'rrggbb' か null＝透明）。body → accessory → head → glasses の順。
export function decodeNoun(seed, imageData) {
  const grid = Array.from({ length: NOUN_SIZE }, () => new Array(NOUN_SIZE).fill(null));
  const { images, palette } = imageData;
  drawPart(grid, images.bodies[seed.body].data, palette);
  drawPart(grid, images.accessories[seed.accessory].data, palette);
  drawPart(grid, images.heads[seed.head].data, palette);
  drawPart(grid, images.glasses[seed.glasses].data, palette);
  return grid;
}
