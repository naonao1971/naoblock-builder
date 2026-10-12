// 検証用：node tools/check.mjs 11
// オプション：
//   --seed=body,accessory,head,glasses  サブグラフを使わずに seed を指定する
//   --image-data=path                   unpkg を使わずに image-data.json を読む
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchSeed, fetchImageData, decodeNoun } from '../src/nouns.js';
import { BLOCK_COLORS, colorById } from '../src/palette.js';
import { makePlan } from '../src/plan.js';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const id = args.find((a) => !a.startsWith('--'));
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
const sumCells = plan.pieces.reduce((s, p) => s + p.w * p.h, 0);
const same = JSON.stringify(plan.pieces) === JSON.stringify(again.pieces);
console.log(`  ${mark(v.ok)}全マスがちょうど 1 回／空きに置いていない／中が同じ色／形は 9 種だけ${v.ok ? '' : `（${v.errors.length} 件）`}`);
for (const e of v.errors.slice(0, 20)) console.log(`      ${e}`);
console.log(`  ${mark(sumCount === plan.pieces.length)}部品リストの合計 ${sumCount} 個 ＝ パーツ ${plan.pieces.length} 個`);
console.log(`  ${mark(sumCells === v.filledCells)}覆ったマス ${sumCells} ＝ 色の付いたマス ${v.filledCells}`);
console.log(`  ${mark(same)}同じ入力で 2 回作って同じ結果`);
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

const allOk = v.ok && sumCount === plan.pieces.length && sumCells === v.filledCells && same;
process.exit(allOk ? 0 : 1);
