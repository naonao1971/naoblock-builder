// Nouns の seed 取得と 32×32 への復元
// fetchSeed / fetchSeeds / fetchLatestId / fetchImageData だけがネットワークを使う。decodeNoun は純粋関数。

export const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_clnbcoajmebxn33wdbt98f439/subgraphs/nouns-mainnet/1.0.0/gn';
export const IMAGE_DATA_URL = 'https://unpkg.com/@nouns/assets@0.10.0/dist/image-data.json';

export const NOUN_SIZE = 32;

const SEED_KEYS = ['background', 'body', 'accessory', 'head', 'glasses'];
const toSeed = (seed) => Object.fromEntries(SEED_KEYS.map((k) => [k, Number(seed[k])]));

async function query(q) {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(`サブグラフの取得に失敗しました（HTTP ${res.status}）`);
  const json = await res.json();
  if (json?.errors?.length) throw new Error(`サブグラフの取得に失敗しました（${json.errors[0].message}）`);
  return json?.data;
}

export async function fetchSeed(id) {
  const data = await query(`{ noun(id: "${Number(id)}") { seed { background body accessory head glasses } } }`);
  const seed = data?.noun?.seed;
  if (!seed) throw new Error(`Noun ${id} が見つかりません`);
  return toSeed(seed);
}

// まとめて取る（1 回の問い合わせ）。戻り値：Map（番号 → seed）。まだない番号は入らない
export async function fetchSeeds(ids) {
  const list = ids.map((id) => `"${Number(id)}"`).join(', ');
  const data = await query(`{ nouns(first: ${ids.length}, where: { id_in: [${list}] }) { id seed { background body accessory head glasses } } }`);
  return new Map((data?.nouns || []).filter((n) => n.seed).map((n) => [Number(n.id), toSeed(n.seed)]));
}

// いちばん新しい Noun の番号（いまオークション中の Noun）。
// nouns を id で並べると文字の順（999 が最大）になるので、オークションの開始時刻で並べる
export async function fetchLatestId() {
  const data = await query('{ auctions(first: 1, orderBy: startTime, orderDirection: desc) { id } }');
  const id = Number(data?.auctions?.[0]?.id);
  if (!Number.isInteger(id)) throw new Error('いちばん新しい Noun の番号が分かりませんでした');
  return id;
}

// パーツの絵（約 32KB）は 1 回だけ読んで使い回す（一覧とゲームで同じもの）。失敗したら次はまた読みに行く
let imageDataPromise = null;
export function fetchImageData() {
  imageDataPromise ??= fetch(IMAGE_DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`パーツの絵の取得に失敗しました（HTTP ${res.status}）`);
      return res.json();
    })
    .catch((e) => { imageDataPromise = null; throw e; });
  return imageDataPromise;
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

// ---- あとからチェーン上に足されたパーツ（image-data にない）の Noun ----
// image-data（@nouns/assets@0.10.0）にないパーツを使う Noun は、noun.pics の SVG（チェーン上の絵そのもの）から 32×32 にする

export const NOUN_PICS_URL = (id) => `https://noun.pics/${Number(id)}.svg`;

// seed のパーツ（と背景色）が image-data に全部あるか
export function hasAllParts(seed, imageData) {
  const { images, bgcolors } = imageData;
  return images.bodies[seed.body] != null && images.accessories[seed.accessory] != null
    && images.heads[seed.head] != null && images.glasses[seed.glasses] != null && bgcolors[seed.background] != null;
}

const attrOf = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const hexOf = (fill) => (fill || '').replace(/^#/, '').toLowerCase();

// noun.pics の SVG（320×320、1 マス＝10px）→ { grid: 32×32（'rrggbb' か null）, bgHex }（純粋関数）
// 最初の <rect width="100%"> の fill が背景色。ほかの <rect width x y fill> は横に並んだマス（width / 10 マス分）。
// 書いてある順に塗る（後のものが上）。塗られないマスは null（透明）
export function parseNounSvg(svg) {
  const grid = Array.from({ length: NOUN_SIZE }, () => new Array(NOUN_SIZE).fill(null));
  let bgHex = null;
  for (const [tag] of svg.matchAll(/<rect\b[^>]*>/g)) {
    const width = attrOf(tag, 'width');
    const fill = hexOf(attrOf(tag, 'fill'));
    if (width === '100%') { if (bgHex == null) bgHex = fill; continue; }
    const w = Math.round(Number(width) / 10), x = Math.round(Number(attrOf(tag, 'x') || 0) / 10), y = Math.round(Number(attrOf(tag, 'y') || 0) / 10);
    if (!fill || !Number.isFinite(w) || y < 0 || y >= NOUN_SIZE) continue;
    for (let i = 0; i < w; i++) if (x + i >= 0 && x + i < NOUN_SIZE) grid[y][x + i] = fill;
  }
  if (bgHex == null) throw new Error('noun.pics の絵に背景色がありません');
  return { grid, bgHex };
}

// noun.pics から読む。一度読んだ絵は覚えておく（失敗したら次はまた読みに行く）
const svgGrids = new Map();
export function fetchNounSvgGrid(id) {
  const key = Number(id);
  if (!svgGrids.has(key)) {
    svgGrids.set(key, fetch(NOUN_PICS_URL(key))
      .then((res) => {
        if (!res.ok) throw new Error(`Noun ${key} の絵を読めませんでした（HTTP ${res.status}）`);
        return res.text();
      })
      .then(parseNounSvg)
      .catch((e) => { svgGrids.delete(key); throw e; }));
  }
  return svgGrids.get(key);
}

// 「seed → 絵」はここ 1 か所：パーツが全部 image-data にあれば今までどおり、なければ noun.pics から。
// 戻り値：{ grid: 32×32, bgHex }（ゲームも一覧も同じものを使う）
export async function nounPicture(id, seed, imageData) {
  if (hasAllParts(seed, imageData)) {
    return { grid: decodeNoun(seed, imageData), bgHex: imageData.bgcolors[seed.background] };
  }
  return fetchNounSvgGrid(id);
}

