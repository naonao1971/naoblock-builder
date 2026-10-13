// 印刷用の組立図（表紙・部品リスト・買い物リスト・組立手順）
import { colorById, hexToRgb } from './palette.js';
import { drawFinishedBoard, outlinePath } from './board.js';
import { pieceCells, SHAPE_ORDER } from './tiling.js';

const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const shapeLabel = (s) => s.replace('x', '×');
const STEPS_PER_PAGE = 4;

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}

const swatch = (hex) => el('span', { class: 'swatch', style: `background:#${hex}` });

// canvas を画像にして差し込む（印刷でぼけないように、表示より大きく描いて縮める）
function canvasImage(width, height, draw, alt) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  return el('img', { src: canvas.toDataURL('image/png'), alt });
}

function plateSeams(ctx, layout, s, ox = 0, oy = 0, w = layout.width, h = layout.height) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.setLineDash([s * 0.4, s * 0.3]);
  for (let c = 1; c < layout.cols; c++) {
    const x = (c * layout.plateSize - ox) * s;
    if (x > 0 && x < w * s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * s); ctx.stroke(); }
  }
  for (let r = 1; r < layout.rows; r++) {
    const y = (r * layout.plateSize - oy) * s;
    if (y > 0 && y < h * s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w * s, y); ctx.stroke(); }
  }
  ctx.restore();
}

// ---- 表紙 ----

function coverPage({ label, plan, plateHex, url }) {
  const s = 24;
  const img = canvasImage(plan.layout.width * s, plan.layout.height * s, (ctx) => {
    drawFinishedBoard(ctx, { layout: plan.layout, pieces: plan.pieces, plateHex, scale: s });
    plateSeams(ctx, plan.layout, s);
  }, `${label} の完成図`);
  const cm = (plan.layout.width * 4) / 10;
  return el('section', { class: 'print-page print-cover' },
    el('p', { class: 'print-brand' }, 'ナオブロック（naoblock）組立図'),
    el('h1', {}, label),
    el('div', { class: 'print-cover-figure' }, img),
    el('table', { class: 'print-facts' },
      el('tbody', {},
        el('tr', {}, el('th', {}, '大きさの目安'), el('td', {}, `約 ${cm}cm 角（1 ポッチ約 4mm で計算。実物で要確認）`)),
        el('tr', {}, el('th', {}, 'パーツの総数'), el('td', {}, `${plan.pieces.length} 個`)),
        el('tr', {}, el('th', {}, '合計金額'), el('td', {}, `${yen(plan.shopping.total)}（税込。パーツ ${plan.shopping.bags} 袋＋20×20 プレート ${plan.shopping.plate.count} 枚）`)),
        el('tr', {}, el('th', {}, 'アプリ'), el('td', { class: 'print-url' }, url)))),
    el('p', { class: 'print-legal' },
      'Nouns は CC0 です。nanoblock（ナノブロック）は株式会社カワダの登録商標です。本アプリは非公式のファン作品です。'));
}

// ---- 部品リスト・買い物リスト ----

function partsSection(plan) {
  const rows = plan.parts.map((p) => {
    const c = colorById(p.color);
    return el('tr', {},
      el('td', { class: 'check' }, '□'),
      el('td', {}, swatch(c.hex), c.name),
      el('td', {}, shapeLabel(p.shape)),
      el('td', { class: 'num' }, `${p.count}`));
  });
  return el('section', { class: 'print-section' },
    el('h2', {}, '部品リスト'),
    el('p', { class: 'print-note' }, '袋から出した部品を数えたら、□ に印を付けてください。'),
    el('table', { class: 'print-table' },
      el('thead', {}, el('tr', {}, el('th', { class: 'check' }, '✓'), el('th', {}, '色'), el('th', {}, '形'), el('th', { class: 'num' }, '個数'))),
      el('tbody', {}, rows),
      el('tfoot', {}, el('tr', {}, el('td', {}), el('td', { colspan: '2' }, '合計'), el('td', { class: 'num' }, `${plan.pieces.length}`)))));
}

function shoppingSection(plan, partsData) {
  const sh = plan.shopping;
  const rows = sh.lines.map((l) => {
    const c = colorById(l.color);
    return el('tr', {},
      el('td', {}, swatch(c.hex), c.name, ' ', shapeLabel(l.shape)),
      el('td', { class: 'num' }, `${l.count}個 ÷ ${l.perBag}個入`),
      el('td', { class: 'num' }, `${l.bags}袋`),
      el('td', { class: 'num' }, yen(l.price)));
  });
  rows.push(el('tr', {},
    el('td', {}, sh.plate.name),
    el('td', { class: 'num' }, ''),
    el('td', { class: 'num' }, `${sh.plate.count}枚`),
    el('td', { class: 'num' }, yen(sh.plate.price))));
  const warnings = plan.seams.filter((s) => s.weak).map((s) =>
    el('p', { class: 'print-warn' }, `⚠ ${s.label}の継ぎ目は、またぐパーツがありません。ここは割れやすい。裏打ちが必要`));
  return el('section', { class: 'print-section' },
    el('h2', {}, '買い物リスト'),
    ...warnings,
    el('table', { class: 'print-table' },
      el('thead', {}, el('tr', {}, el('th', {}, '部品'), el('th', { class: 'num' }, '必要数'), el('th', { class: 'num' }, '袋数'), el('th', { class: 'num' }, '金額'))),
      el('tbody', {}, rows),
      el('tfoot', {}, el('tr', {},
        el('td', { colspan: '3' }, `合計（パーツ ${sh.bags}袋 ＋ プレート ${sh.plate.count}枚）`),
        el('td', { class: 'num' }, yen(sh.total))))),
    el('p', { class: 'print-note' }, `値段は税込。買う先：Kawada Base（単色部品） ${partsData.shopUrl}`));
}

// ---- 組立手順 ----

// ステップの図：置き済みは薄く、このステップで置くパーツは濃い色＋太い黒枠。
// プレートのステップはそのプレートだけを拡大、つなぎのステップは全体図
function drawStep(ctx, { plan, plateHex, done, current, area, s }) {
  const { x: ox, y: oy, w, h } = area;
  const [pr, pg, pb] = hexToRgb(plateHex);
  ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
  ctx.fillRect(0, 0, w * s, h * s);

  // マス目（数えやすいように 5 マスごとに少し濃く）
  ctx.lineWidth = 1;
  for (let i = 0; i <= w; i++) {
    ctx.strokeStyle = (ox + i) % 5 === 0 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(i * s + 0.5, 0); ctx.lineTo(i * s + 0.5, h * s); ctx.stroke();
  }
  for (let j = 0; j <= h; j++) {
    ctx.strokeStyle = (oy + j) % 5 === 0 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(0, j * s + 0.5); ctx.lineTo(w * s, j * s + 0.5); ctx.stroke();
  }

  const inArea = (p) => p.x < ox + w && p.x + p.w > ox && p.y < oy + h && p.y + p.h > oy;
  // 図の中の座標にずらしたマス（L 字もマスごとに塗る）
  const cellsIn = (p) => pieceCells(p).map(([x, y]) => [x - ox, y - oy]);

  // 置き済み：薄く
  for (const p of done) {
    if (!inArea(p)) continue;
    const cells = cellsIn(p);
    const [r, g, b] = hexToRgb(colorById(p.color).hex);
    ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
    for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    outlinePath(ctx, s, cells, 0.5);
    ctx.stroke();
  }

  // このステップ：濃く＋太い黒枠（白黒でも分かるように、内側に白い線も）
  const thick = Math.max(3, Math.round(s * 0.16));
  for (const p of current) {
    const cells = cellsIn(p);
    ctx.fillStyle = `#${colorById(p.color).hex}`;
    for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s, s);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = thick;
    outlinePath(ctx, s, cells, thick / 2);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    outlinePath(ctx, s, cells, thick + 0.5);
    ctx.stroke();
  }

  plateSeams(ctx, plan.layout, s, ox, oy, w, h);
}

function stepUsage(step, pieces) {
  const counts = new Map();
  for (const i of step.pieces) {
    const k = pieces[i].shape;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => SHAPE_ORDER.indexOf(a[0]) - SHAPE_ORDER.indexOf(b[0]))
    .map(([shape, n]) => `${shapeLabel(shape)} × ${n}`)
    .join('、');
}

function stepBlock({ plan, plateHex, steps, si, done }) {
  const step = steps[si];
  const { layout } = plan;
  const area = step.kind === 'plate'
    ? { x: (step.plate % layout.cols) * layout.plateSize, y: Math.floor(step.plate / layout.cols) * layout.plateSize, w: layout.plateSize, h: layout.plateSize }
    : { x: 0, y: 0, w: layout.width, h: layout.height };
  const s = Math.round(640 / Math.max(area.w, area.h)); // 図は 640px 四方くらい
  const current = step.pieces.map((i) => plan.pieces[i]);
  const color = colorById(step.color);
  const img = canvasImage(area.w * s, area.h * s,
    (ctx) => drawStep(ctx, { plan, plateHex, done, current, area, s }),
    `ステップ ${si + 1} の図`);
  return el('div', { class: 'print-step' },
    el('p', { class: 'print-step-title' }, `ステップ ${si + 1} / ${steps.length}　${step.label}・${color.name}`),
    el('div', { class: 'print-step-figure' }, img),
    el('p', { class: 'print-step-parts' }, swatch(color.hex), `${color.name}：${stepUsage(step, plan.pieces)}（${step.pieces.length} 個）`),
    step.kind === 'plate' ? null : el('p', { class: 'print-note' }, '全体図（継ぎ目をまたぐパーツ）'));
}

function stepPages({ plan, plateHex, steps }) {
  const pages = [];
  const done = [];
  for (let si = 0; si < steps.length; si += STEPS_PER_PAGE) {
    const blocks = [];
    for (let k = si; k < Math.min(si + STEPS_PER_PAGE, steps.length); k++) {
      blocks.push(stepBlock({ plan, plateHex, steps, si: k, done: [...done] }));
      for (const i of steps[k].pieces) done.push(plan.pieces[i]);
    }
    pages.push(el('section', { class: 'print-page print-steps' },
      si === 0 ? el('h2', {}, '組立手順') : null,
      el('div', { class: 'print-step-grid' }, blocks)));
  }
  return pages;
}

// 印刷用の中身を container に作る
export function buildPrintout(container, { label, plan, partsData, steps, plateHex, url }) {
  container.replaceChildren(
    coverPage({ label, plan, plateHex, url }),
    el('section', { class: 'print-page print-lists' },
      partsSection(plan),
      shoppingSection(plan, partsData)),
    ...stepPages({ plan, plateHex, steps }),
  );
}
