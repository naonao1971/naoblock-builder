// 検証用：node tools/check.mjs 11（パーツ割りと組立順の検算）
//         node tools/check.mjs --subjects（題材：URL → 題材・保存の名前・シェアの文面だけ。ネットなしで動く）
// オプション：
//   --seed=body,accessory,head,glasses  サブグラフを使わずに seed を指定する
//   --image-data=path                   unpkg を使わずに image-data.json を読む
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchSeed, fetchImageData, decodeNoun } from '../src/nouns.js';
import { BLOCK_COLORS, colorById } from '../src/palette.js';
import { makePlan } from '../src/plan.js';
import { tile, pieceCells } from '../src/tiling.js';
import { buildBlocks, verifyBlocks, orientationCount } from '../src/pieces.js';
import { buildStages } from '../src/stages.js';
import { partsList, shoppingList } from '../src/plan.js';
import { buildSteps, verifySteps } from '../src/steps.js';
import { subjectFromUrl, saveKey } from '../src/subjects.js';
import { rankingKey } from '../src/ranking.js';

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
      url: 'https://naonao1971.github.io/naoblock-builder/?noun=11', file: 'naoblock-noun11.png' },
    { search: '?noun=007', kind: 'noun', id: '7', label: 'Noun 7' },
    { search: '?pic=1', kind: 'picture', id: '1', label: 'ドット絵 1',
      save: 'naoblock:game:v1:picture:1:practice', rank: 'naoblock:ranking:v1:picture:1:timeattack', rankGuide: 'naoblock:ranking:v1:picture:1:timeattack:guide',
      share: 'ドット絵 1 をナオブロックで組み立てた！ パーツ 93個・12分 #naoblock',
      shareTa: 'ドット絵 1 をナオブロックで組み立てた！ タイムアタック（ガイドあり） 12分34秒 #naoblock',
      url: 'https://naonao1971.github.io/naoblock-builder/?pic=1', file: 'naoblock-pic-1.png' },
    { search: '?sample=1', kind: 'picture', id: '1', label: 'ドット絵 1' },
    { search: '?pic=nothing', none: true },
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
      }
    }
    for (const [text, good] of checks) { console.log(`  ${good ? 'OK ' : 'NG '}${c.search || '（なし）'} → ${text}`); ok = ok && !!good; }
  }
  return ok;
}

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

const noun = decodeNoun(seed, imageData);
const plan = makePlan(noun, { partsData });
const again = makePlan(decodeNoun(seed, imageData), { partsData });
const name = (cid) => colorById(cid).name;
const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const mark = (ok) => (ok ? 'OK ' : 'NG ');

console.log(`# Noun ${id}`);
console.log(`seed: body=${seed.body} accessory=${seed.accessory} head=${seed.head} glasses=${seed.glasses}（background=${seed.background} は使わない）`);
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
