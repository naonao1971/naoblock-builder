// 検証用：node tools/check.mjs 11（パーツ割りと組立順の検算）
//         node tools/check.mjs --qr（nanoQR：URL → QR の元絵・パーツ割り。ネットなしで動く）
//         node tools/check.mjs --subjects（題材：URL → 題材・保存の名前・シェアの文面だけ。ネットなしで動く）
// オプション：
//   --seed=body,accessory,head,glasses  サブグラフを使わずに seed を指定する
//   --image-data=path                   unpkg を使わずに image-data.json を読む
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchSeed, fetchImageData, decodeNoun, hasAllParts, fetchNounSvgGrid, parseNounSvg } from '../src/nouns.js';
import { BLOCK_COLORS, colorById } from '../src/palette.js';
import { makePlan } from '../src/plan.js';
import { tile, pieceCells } from '../src/tiling.js';
import { buildBlocks, verifyBlocks, orientationCount } from '../src/pieces.js';
import { buildStages } from '../src/stages.js';
import { partsList, shoppingList } from '../src/plan.js';
import { buildSteps, verifySteps } from '../src/steps.js';
import { subjectFromUrl, saveKey, PICTURES, CATEGORIES, todayJst, shownCategories, isPictureShown } from '../src/subjects.js';
import { gridFromPixels } from '../src/picture.js';
import { rankingKey } from '../src/ranking.js';
import { rangeFor, parseStart } from '../src/nounlist.js';
import { qrPicture, makeQr, QR_MAX_BYTES } from '../src/qr.js';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const id = args.find((a) => !a.startsWith('--'));

// 題材（src/subjects.js）の検算：URL → 題材、保存とランキングの名前、シェアの文面・URL
// Nouns の名前と文面は、題材に分ける前（v16）と 1 文字も変わらないこと
function checkSubjects() {
  const href = 'https://naonao1971.github.io/naoblock-builder/?noun=11';
  const r = { pieces: 93, elapsedMs: 754000, mode: 'practice', guide: false };
  const ta = { ...r, mode: 'timeattack', guide: true };
  const cases = [
    { search: '?noun=11', kind: 'noun', id: '11', label: 'Noun 11',
      save: 'naoblock:game:v1:noun:11:practice', rank: 'naoblock:ranking:v1:noun:11:timeattack', rankGuide: 'naoblock:ranking:v1:noun:11:timeattack:guide',
      share: 'Noun 11 をナオブロックで組み立てた！ パーツ 93個・12分 #naoblock #Nouns',
      shareTa: 'Noun 11 をナオブロックで組み立てた！ タイムアタック（ガイドあり） 12分34秒 #naoblock #Nouns',
      url: 'https://naonao1971.github.io/naoblock-builder/?noun=11', file: 'naoblock-noun11.png', pdf: 'Noun_11_naoblock.pdf' },
    { search: '?noun=007', kind: 'noun', id: '7', label: 'Noun 7' },
    { search: '?pic=chibi-sakuya', kind: 'picture', id: 'chibi-sakuya', label: 'チビ咲耶',
      save: 'naoblock:game:v1:picture:chibi-sakuya:practice', rank: 'naoblock:ranking:v1:picture:chibi-sakuya:timeattack', rankGuide: 'naoblock:ranking:v1:picture:chibi-sakuya:timeattack:guide',
      share: 'チビ咲耶 をナオブロックで組み立てた！ パーツ 93個・12分 #naoblock',
      shareTa: 'チビ咲耶 をナオブロックで組み立てた！ タイムアタック（ガイドあり） 12分34秒 #naoblock',
      url: 'https://naonao1971.github.io/naoblock-builder/?pic=chibi-sakuya', file: 'naoblock-pic-chibi-sakuya.png', pdf: 'chibi-sakuya_naoblock.pdf' },
    { search: '?pic=1', kind: 'picture', id: 'chibi-sakuya', label: 'チビ咲耶' },
    { search: '?sample=1', kind: 'picture', id: 'chibi-sakuya', label: 'チビ咲耶' },
    { search: `?qr=${encodeURIComponent('https://naoblock.jp')}`, kind: 'qr', id: 'https://naoblock.jp', label: 'nanoQR',
      save: 'naoblock:game:v1:qr:https://naoblock.jp:practice', rank: 'naoblock:ranking:v1:qr:https://naoblock.jp:timeattack', rankGuide: 'naoblock:ranking:v1:qr:https://naoblock.jp:timeattack:guide',
      share: 'nanoQR をナオブロックで組み立てた！ パーツ 93個・12分 #naoblock\nこのQRの行き先：https://naoblock.jp',
      shareTa: 'nanoQR をナオブロックで組み立てた！ タイムアタック（ガイドあり） 12分34秒 #naoblock\nこのQRの行き先：https://naoblock.jp',
      url: 'https://naonao1971.github.io/naoblock-builder/?qr=https%3A%2F%2Fnaoblock.jp', file: 'naoblock-qr.png', pdf: 'nanoQR_naoblock.pdf' },
    { search: `?qr=${encodeURIComponent('https://naoblock.jp')}&dark=red&accent=peach`, kind: 'qr', id: 'https://naoblock.jp', label: 'nanoQR',
      save: 'naoblock:game:v1:qr:https://naoblock.jp:practice', rank: 'naoblock:ranking:v1:qr:https://naoblock.jp:timeattack', rankGuide: 'naoblock:ranking:v1:qr:https://naoblock.jp:timeattack:guide',
      share: 'nanoQR をナオブロックで組み立てた！ パーツ 93個・12分 #naoblock\nこのQRの行き先：https://naoblock.jp',
      shareTa: 'nanoQR をナオブロックで組み立てた！ タイムアタック（ガイドあり） 12分34秒 #naoblock\nこのQRの行き先：https://naoblock.jp',
      url: 'https://naonao1971.github.io/naoblock-builder/?qr=https%3A%2F%2Fnaoblock.jp&dark=red&accent=peach', file: 'naoblock-qr.png', pdf: 'nanoQR_naoblock.pdf' },
    { search: '?qr=ftp%3A%2F%2Fexample.com', none: true },
    { search: `?qr=${encodeURIComponent(`https://example.com/${'a'.repeat(60)}`)}`, none: true },
    { search: '?pic=nothing', none: true },
    { search: '?pic=constructor', none: true },
    { search: '?noun=abc', none: true },
    { search: '', none: true },
  ];
  let ok = true;
  console.log('## 題材（URL → 題材・保存の名前・シェア）');
  for (const c of cases) {
    const s = subjectFromUrl(c.search);
    const got = s ? { kind: s.kind, id: s.id, label: s.label } : null;
    const checks = [];
    if (c.none) checks.push(['スタート画面', s === null]);
    else {
      checks.push([`${got?.kind}:${got?.id}「${got?.label}」`, s && s.kind === c.kind && s.id === c.id && s.label === c.label]);
      if (c.save) {
        checks.push([`保存 ${saveKey(s, 'practice')}`, saveKey(s, 'practice') === c.save]);
        checks.push([`ランキング ${rankingKey(s, false)}`, rankingKey(s, false) === c.rank && rankingKey(s, true) === c.rankGuide]);
        checks.push([`シェア「${s.shareText(r)}」`, s.shareText(r) === c.share]);
        checks.push([`シェア（タイムアタック）「${s.shareText(ta)}」`, s.shareText(ta) === c.shareTa]);
        checks.push([`URL ${s.url(href)}`, s.url(href) === c.url]);
        checks.push([`画像の名前 ${s.fileName}`, s.fileName === c.file]);
        checks.push([`組立図の PDF の名前 ${s.pdfName}`, s.pdfName === c.pdf]);
      }
    }
    for (const [text, good] of checks) { console.log(`  ${good ? 'OK ' : 'NG '}${c.search || '（なし）'} → ${text}`); ok = ok && !!good; }
  }
  // ドット絵の一覧の画像が、全部ちゃんとあるか
  for (const [name, pic] of Object.entries(PICTURES)) {
    const there = existsSync(fileURLToPath(new URL(`../${pic.file}`, import.meta.url)));
    console.log(`  ${there ? 'OK ' : 'NG '}絵「${pic.label}」（${name}）の画像 ${pic.file} がある`);
    const cat = CATEGORIES.find((c) => c.key === pic.category && c.input === 'cards');
    console.log(`  ${cat ? 'OK ' : 'NG '}絵「${pic.label}」のカテゴリー ${pic.category ?? '（なし）'} が、カードから選ぶカテゴリー（${CATEGORIES.filter((c) => c.input === 'cards').map((c) => c.key).join('・')}）のどれか${cat ? `：${cat.label}` : ''}`);
    ok = ok && there && !!cat;
  }
  // 背景が透明な絵：透明なところだけが空き、白いマスはブロックになる（2×2 の画像で確かめる）
  const clearPx = [0, 0, 0, 0, 244, 244, 244, 255, 26, 26, 26, 255, 0, 0, 0, 0];
  const clearGrid = gridFromPixels(clearPx, 2, 2, 2).grid.flat().join(',');
  const clearOk = clearGrid === ',f4f4f4,1a1a1a,';
  console.log(`  ${clearOk ? 'OK ' : 'NG '}背景が透明な絵で、白（f4f4f4）と黒が残り、透明だけが空く：${clearGrid}`);
  ok = ok && clearOk;
  const order = CATEGORIES.map((c) => c.label).join('・');
  const orderOk = order === '🎃ハロウィン・Nouns・クリプト忍者・CNP・nanoQR';
  console.log(`  ${orderOk ? 'OK ' : 'NG '}スタート画面のカテゴリーの順：${order}`);
  const chibiOk = PICTURES['chibi-sakuya']?.category === 'ninja';
  console.log(`  ${chibiOk ? 'OK ' : 'NG '}チビ咲耶はクリプト忍者（ninja）`);
  ok = ok && orderOk && chibiOk;
  // 期間限定：ハロウィンのタブは 10/31（日本時間）まで。絵は from の日から
  const shown = (d) => shownCategories(d).map((c) => c.key).includes('halloween');
  const obake = PICTURES['halloween-obake'];
  const limitCases = [
    ['10/31 23:59（日本時間）は今日が 10/31', todayJst(new Date('2026-10-31T14:59:00Z')) === '2026-10-31'],
    ['11/1 0:00（日本時間）は今日が 11/1', todayJst(new Date('2026-10-31T15:00:00Z')) === '2026-11-01'],
    ['10/31 はハロウィンのタブが出る', shown('2026-10-31')],
    ['11/1 はハロウィンのタブが出ない', !shown('2026-11-01')],
    ['11/1 でもほかのタブは 4 つとも出る', shownCategories('2026-11-01').length === 4],
    ['おばけとかぼちゃは 10/24 には出ない', !isPictureShown(obake, '2026-10-24')],
    ['おばけとかぼちゃは 10/25 から出る', isPictureShown(obake, '2026-10-25')],
    ['期間が終わっても ?pic=halloween-obake で遊べる', subjectFromUrl('?pic=halloween-obake')?.label === 'おばけとかぼちゃ'],
  ];
  for (const [text, good] of limitCases) { console.log(`  ${good ? 'OK ' : 'NG '}${text}`); ok = ok && good; }
  // Nouns タブの一覧：見る範囲（最新 2046 として）と、開始番号の入力
  const R = (st) => { const r = rangeFor(st, 2046); return `${r.start}〜${r.end}${r.hasPrev ? '' : '（◀ なし）'}${r.hasNext ? '' : '（▶ なし）'}`; };
  const rangeCases = [[2046, '2017〜2046（▶ なし）'], [100, '100〜129'], [130, '130〜159'], [0, '0〜29（◀ なし）'], [2030, '2017〜2046（▶ なし）'], [5000, '2017〜2046（▶ なし）']];
  for (const [st, want] of rangeCases) {
    const got = R(st);
    console.log(`  ${got === want ? 'OK ' : 'NG '}一覧：開始 ${st} → ${got}`);
    ok = ok && got === want;
  }
  const small = rangeFor(0, 10);
  const smallOk = small.start === 0 && small.end === 10 && !small.hasPrev && !small.hasNext;
  console.log(`  ${smallOk ? 'OK ' : 'NG '}一覧：最新が 10 のとき 0〜10`);
  const parseOk = parseStart('100') === 100 && parseStart(' 7 ') === 7 && parseStart('') === null && parseStart('abc') === null && parseStart('-3') === null && parseStart('1.5') === null;
  console.log(`  ${parseOk ? 'OK ' : 'NG '}一覧：開始番号は数字だけ（空・数字以外・マイナス・小数は何もしない）`);
  ok = ok && smallOk && parseOk;

  // noun.pics の SVG を 32×32 に（4.5）。後に書いたものが上・塗らないマスは null・背景は最初の 100% の rect
  const svg = '<svg width="320" height="320" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">'
    + '<rect width="100%" height="100%" fill="#d5d7e1" />'
    + '<rect width="40" height="10" x="100" y="210" fill="#1F1D29" />'
    + '<rect width="10" height="10" x="120" y="210" fill="#ff0000" />'
    + '<rect width="20" height="10" x="0" y="0" fill="#00ff00" /></svg>';
  const g = parseNounSvg(svg);
  const row = g.grid[21].slice(9, 15).map((c) => c ?? '.').join(' ');
  const svgOk = g.bgHex === 'd5d7e1' && row === '. 1f1d29 1f1d29 ff0000 1f1d29 .' && g.grid[0][0] === '00ff00' && g.grid[0][1] === '00ff00' && g.grid[0][2] === null
    && g.grid.flat().filter(Boolean).length === 6;
  console.log(`  ${svgOk ? 'OK ' : 'NG '}noun.pics の SVG → 32×32：背景 ${g.bgHex}、21 行目 ${row}`);
  const fake = { images: { bodies: [{}], accessories: [{}], heads: [{}], glasses: [{}] }, bgcolors: ['d5d7e1', 'e1d7d5'] };
  const partsOk = hasAllParts({ background: 1, body: 0, accessory: 0, head: 0, glasses: 0 }, fake)
    && !hasAllParts({ background: 0, body: 0, accessory: 0, head: 1, glasses: 0 }, fake)
    && !hasAllParts({ background: 2, body: 0, accessory: 0, head: 0, glasses: 0 }, fake);
  console.log(`  ${partsOk ? 'OK ' : 'NG '}パーツが image-data に全部あるか（1 つでもなければ noun.pics）`);
  ok = ok && svgOk && partsOk;
  return ok;
}

// nanoQR の検算：長さの違う URL 4 本（バージョン 1〜4）と、長すぎる URL 1 本
function checkQr() {
  const pd = JSON.parse(readFileSync(fileURLToPath(new URL('../data/parts.json', import.meta.url)), 'utf8'));
  const hex = (id) => colorById(id).hex;
  const cases = [
    ['https://a.jp', 1, 21, 4, 31],
    ['https://naoblock.jp', 2, 25, 4, 35],
    ['https://naoblock.jp/very/long/path?x=1', 3, 29, 4, 39],
    ['https://builder.naoblock.jp/?pic=chibi-sakuya&x=1234567', 4, 33, 2, 39],
  ];
  let ok = true;
  const say = (good, text) => { console.log(`  ${good ? 'OK ' : 'NG '}${text}`); ok = ok && !!good; };
  console.log('## nanoQR（URL → QR の元絵）');
  for (const [url, v, n, q, side] of cases) {
    const p = qrPicture(url);
    console.log(`  ${url}（${new TextEncoder().encode(url).length} バイト）`);
    say(p.version === v && p.size === n && p.quiet === q && p.side === side, `バージョン ${p.version}・QR ${p.size}×${p.size}・余白 ${p.quiet}・一辺 ${p.side}（表：${v}・${n}・${q}・${side}）`);
    const g = p.grid;
    const at = (x, y) => g[y][x];
    let frame = true, quiet = true, nulls = 0, yellow = 0, ringYellow = 0;
    const off = 1 + p.quiet;
    const ring = new Set();
    for (const [fx, fy] of [[0, 0], [p.size - 7, 0], [0, p.size - 7]]) for (let k = 1; k <= 5; k++) for (const [x, y] of [[fx + k, fy + 1], [fx + k, fy + 5], [fx + 1, fy + k], [fx + 5, fy + k]]) ring.add(`${off + x},${off + y}`);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const c = at(x, y);
      if (c == null) nulls++;
      const edge = x === 0 || y === 0 || x === side - 1 || y === side - 1;
      const inQr = x >= off && x < off + p.size && y >= off && y < off + p.size;
      if (edge && c !== hex('black')) frame = false;
      if (!edge && !inQr && c !== hex('white')) quiet = false;
      if (c === hex('yellow')) { yellow++; if (ring.has(`${x},${y}`)) ringYellow++; }
    }
    say(frame, '外枠がすべてブラック');
    say(quiet, '余白がすべてホワイト');
    say(nulls === 0, `null のマスがない（${nulls}）`);
    say(ringYellow === 48 && yellow === 48, `目印の輪 3 か所（16 マス × 3）がイエローで、ほかにイエローがない（イエロー ${yellow} マス）`);
    const plan = makePlan(g, { partsData: pd });
    const steps = buildSteps(plan.pieces, plan.layout);
    const blocks = buildBlocks(plan.pieces, plan.layout);
    say(plan.check.ok, `パーツ割り（全マスちょうど 1 回）：パーツ ${plan.pieces.length} 個・${plan.shopping.total.toLocaleString('ja-JP')}円`);
    say(verifyBlocks(plan.pieces, blocks, plan.layout).ok, `ゲームのブロック（${blocks.length} 個）`);
    say(verifySteps(plan.pieces, steps, plan.layout).ok, `組立順（${steps.length} ステップ）`);
  }
  const long = `https://example.com/${'a'.repeat(QR_MAX_BYTES)}`;
  let threw = false;
  try { makeQr(long); } catch { threw = true; }
  say(threw, `長すぎる URL（${new TextEncoder().encode(long).length} バイト）はエラー`);
  return ok;
}

if (args.includes('--qr')) process.exit(checkQr() ? 0 : 1);
if (args.includes('--subjects')) process.exit(checkSubjects() ? 0 : 1);

if (id == null || !/^\d+$/.test(id)) {
  console.error('使い方: node tools/check.mjs <Noun の番号> [--seed=body,accessory,head,glasses] [--image-data=path]');
  process.exit(2);
}

const partsData = JSON.parse(readFileSync(fileURLToPath(new URL('../data/parts.json', import.meta.url)), 'utf8'));

let seed;
if (opt('seed')) {
  const [body, accessory, head, glasses] = opt('seed').split(',').map(Number);
  seed = { background: 0, body, accessory, head, glasses };
} else {
  seed = await fetchSeed(id);
}
const imageData = opt('image-data')
  ? JSON.parse(readFileSync(opt('image-data'), 'utf8'))
  : await fetchImageData();

// あとから足されたパーツ（image-data にない）の Noun は noun.pics の絵から（アプリと同じ）
const fromImageData = hasAllParts(seed, imageData);
const decode = async () => (fromImageData ? decodeNoun(seed, imageData) : (await fetchNounSvgGrid(id)).grid);
const noun = await decode();
const plan = makePlan(noun, { partsData });
const again = makePlan(await decode(), { partsData });
const name = (cid) => colorById(cid).name;
const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const mark = (ok) => (ok ? 'OK ' : 'NG ');

console.log(`# Noun ${id}`);
console.log(`seed: body=${seed.body} accessory=${seed.accessory} head=${seed.head} glasses=${seed.glasses}（background=${seed.background} は使わない）`);
console.log(`絵：${fromImageData ? 'image-data から' : 'noun.pics から（image-data にないパーツを使う Noun）'}`);
console.log('');

console.log('## 元の色 → ブロックの色');
for (const s of plan.sources) console.log(`  #${s.hex} (${String(s.count).padStart(3)} ドット) → ${name(plan.colorMap[s.hex])}`);
console.log('');

console.log('## 盤面（. は空き。記号はブロックの色）');
const symbols = '#WLgdROYylGbpPkeBn'; // BLOCK_COLORS の順
const sym = Object.fromEntries(BLOCK_COLORS.map((c, i) => [c.id, symbols[i]]));
plan.board.forEach((row, y) => {
  if (y === plan.layout.plateSize) console.log('  ' + '-'.repeat(plan.layout.width + 1));
  const line = row.map((c) => (c == null ? '.' : sym[c]));
  line.splice(plan.layout.plateSize, 0, '|');
  console.log('  ' + line.join(''));
});
console.log('  記号: ' + BLOCK_COLORS.map((c) => `${sym[c.id]}=${c.name}`).join(' '));
console.log('');

console.log('## 検算');
const v = plan.check;
const sumCount = plan.parts.reduce((s, p) => s + p.count, 0);
const sumCells = plan.pieces.reduce((s, p) => s + pieceCells(p).length, 0);
const same = JSON.stringify(plan.pieces) === JSON.stringify(again.pieces);
console.log(`  ${mark(v.ok)}全マスがちょうど 1 回／空きに置いていない／中が同じ色／形は 10 種だけ（長方形 9 種＋L 字）${v.ok ? '' : `（${v.errors.length} 件）`}`);
for (const e of v.errors.slice(0, 20)) console.log(`      ${e}`);
console.log(`  ${mark(sumCount === plan.pieces.length)}部品リストの合計 ${sumCount} 個 ＝ パーツ ${plan.pieces.length} 個`);
console.log(`  ${mark(sumCells === v.filledCells)}覆ったマス ${sumCells} ＝ 色の付いたマス ${v.filledCells}`);
console.log(`  ${mark(same)}同じ入力で 2 回作って同じ結果`);
const withoutL = tile(plan.board, plan.layout, { useL: false });
const count = (ps, shape) => ps.filter((p) => p.shape === shape).length;
const singlesNow = count(plan.pieces, '1x1'), singlesBefore = count(withoutL, '1x1');
console.log(`  ${mark(singlesNow <= singlesBefore)}L 字で 1×1 が減る：L 字なし ${singlesBefore} 個 → あり ${singlesNow} 個（L 字 ${count(plan.pieces, '1x2L')} 個、パーツ全体 ${withoutL.length} → ${plan.pieces.length} 個）`);
console.log('');

console.log('## 組立順');
const steps = buildSteps(plan.pieces, plan.layout);
const stepsAgain = buildSteps(again.pieces, again.layout);
const sv = verifySteps(plan.pieces, steps, plan.layout);
const sameSteps = JSON.stringify(steps) === JSON.stringify(stepsAgain);
console.log(`  ${mark(sv.ok)}全パーツがちょうど 1 回ずつどこかのステップに入っている／継ぎ目をまたぐパーツ ${sv.joinCount} 個は両方のプレートの後${sv.ok ? '' : `（${sv.errors.length} 件）`}`);
for (const e of sv.errors.slice(0, 20)) console.log(`      ${e}`);
console.log(`  ${mark(sameSteps)}同じ入力で 2 回作って組立順も同じ`);
console.log('  （各パーツは 幅×高さ@(左上のマスの x,y)。L 字は L(欠けている角: tl 左上・tr 右上・bl 左下・br 右下)@(2×2 の左上の x,y)）');
steps.forEach((st, i) => {
  const list = st.pieces.map((n) => { const p = plan.pieces[n]; return p.shape === '1x2L' ? `L(欠け${p.missing})@(${p.x},${p.y})` : `${p.w}×${p.h}@(${p.x},${p.y})`; }).join(' ');
  console.log(`  ステップ ${String(i + 1).padStart(2)}: ${st.label}・${name(st.color)}（${st.pieces.length} 個） ${list}`);
});
console.log('');

console.log('## ゲームのブロックとステージ');
const blocks = buildBlocks(plan.pieces, plan.layout);
const blocksAgain = buildBlocks(again.pieces, again.layout);
const bv = verifyBlocks(plan.pieces, blocks, plan.layout);
const sameBlocks = JSON.stringify(blocks) === JSON.stringify(blocksAgain);
const stages = buildStages(blocks, plan.layout);
// ブロックの中身（標準パーツ）から部品リスト・買い物リストを作り直して、組み合わせる前と比べる
const piecesFromBlocks = blocks.flatMap((b) => b.pieces).sort((a, b) => a - b).map((i) => plan.pieces[i]);
const partsFromBlocks = partsList(piecesFromBlocks);
const shopFromBlocks = shoppingList(partsFromBlocks, partsData, plan.layout.cols * plan.layout.rows);
const sameParts = JSON.stringify(partsFromBlocks) === JSON.stringify(plan.parts)
  && shopFromBlocks.total === plan.shopping.total && shopFromBlocks.bags === plan.shopping.bags;
console.log(`  ${mark(bv.ok)}全パーツがちょうど 1 回ずつどれかのブロックに入っている／ブロックの中は同じ色／ステージをまたいでいない${bv.ok ? '' : `（${bv.errors.length} 件）`}`);
for (const e of bv.errors.slice(0, 20)) console.log(`      ${e}`);
console.log(`  ${mark(sameBlocks)}同じ入力で 2 回作ってブロックも同じ`);
console.log(`  ${mark(sameParts)}部品リスト・買い物リストの数字が組み合わせる前と同じ（ブロックの中身から作り直して ${piecesFromBlocks.length} 個・${shopFromBlocks.bags} 袋・${yen(shopFromBlocks.total)}）`);
const orient = new Map();
for (const b of blocks) { const n = orientationCount(b.cells); orient.set(n, (orient.get(n) || 0) + 1); }
console.log(`  回したときの向きの数：${[...orient.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n} 通り ${c} 個`).join('、')}`);
for (const st of stages) {
  const combos = st.blocks.filter((b) => b.combo);
  const ratio = st.blocks.length ? Math.round((combos.length / st.blocks.length) * 100) : 0;
  const speed = st.type === 'puzzle' ? 'パズル型' : `落ちてくる型 ${st.fallMs / 1000}秒/マス`;
  console.log(`  ステージ ${st.index + 1}：${st.label}（${speed}）ブロック ${st.blocks.length} 個（組み合わせ ${combos.length} 個・${ratio}%、パーツ ${st.blocks.reduce((n, b) => n + b.pieces.length, 0)} 個）`);
  console.log(`      出る順：${st.blocks.map((b) => `${b.combo ? `組${b.pieces.length}` : plan.pieces[b.pieces[0]].shape.replace('x', '×')}@(${b.x},${b.y})`).join(' ')}`);
}
console.log('  （出る順は 下の行から・同じ行なら左から。「組2」「組3」は標準パーツ 2・3 個の組み合わせブロック、@ は囲む四角の左上）');
console.log('');

console.log('## 継ぎ目');
for (const s of plan.seams) {
  const gaps = s.gaps.map((g) => `${g.from}-${g.to - 1}${g.kind === 'empty' ? '(背景)' : '(ブロックあり)'}`).join(', ');
  console.log(`  ${s.weak ? '⚠ ' : '  '}${s.label}: またぐパーツ ${s.crossing} 個／またぐパーツがない区間: ${gaps || 'なし'}${s.weak ? ' ← 割れやすい。裏打ちが必要' : ''}`);
}
console.log('');

console.log(`## 部品リスト（全 ${plan.pieces.length} 個）`);
for (const p of plan.parts) console.log(`  ${name(p.color).padEnd(9, '　')} ${p.shape.replace('x', '×')} × ${p.count}`);
console.log('');

console.log('## 買い物リスト');
const sh = plan.shopping;
for (const l of sh.lines) {
  console.log(`  ${name(l.color).padEnd(9, '　')} ${l.shape.replace('x', '×')}  ${String(l.count).padStart(3)} 個 ÷ ${l.perBag} 個入 → ${l.bags} 袋  ${yen(l.price)}`);
}
console.log(`  ${sh.plate.name} × ${sh.plate.count} 枚  ${yen(sh.plate.price)}`);
console.log(`  合計: パーツ ${sh.bags} 袋 ${yen(sh.partsTotal)} ＋ プレート ${yen(sh.plate.price)} ＝ ${yen(sh.total)}`);

console.log('');
const subjectsOk = checkSubjects();

const allOk = subjectsOk && v.ok && sumCount === plan.pieces.length && sumCells === v.filledCells && same && sv.ok && sameSteps && singlesNow <= singlesBefore && bv.ok && sameBlocks && sameParts;
process.exit(allOk ? 0 : 1);
