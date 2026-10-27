// 組立図（表紙・部品リスト・買い物リスト・組立手順）。
// 各ページを、アプリ自身が A4 縦の 1 枚の絵（canvas）として描く。ページの分け方はブラウザにまかせない。
// 「PDF で保存」も「プリンターで印刷」も、同じページの絵から作るので中身は同じになる。
import { colorById, hexToRgb } from './palette.js';
import { drawFinishedBoard, outlinePath } from './board.js';
import { pieceCells, SHAPE_ORDER } from './tiling.js';
import { plateName } from './steps.js';
import { buildPdf, dataUrlBytes } from './kit.js';

// A4 縦・150dpi。余白 12mm はページの絵の中に描き込む
export const PAGE_W = 1240;
export const PAGE_H = 1754;
const M = Math.round((12 / 25.4) * 150);
const CW = PAGE_W - M * 2; // 中身の幅
const BOTTOM = PAGE_H - M;
const STEPS_PER_PAGE = 4;
const JPEG_QUALITY = 0.9;
const FONT = '"Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';

const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const shapeLabel = (s) => s.replace('x', '×');

// ---- 文字 ----

let collecting = null; // 1 回目に描くとき、使う文字を集める（フォントを読み込んでおくため）

function font(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function text(ctx, str, x, y, { align = 'left', color = '#000' } = {}) {
  if (collecting) collecting.add(str);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

// 幅に収まるように折り返す。「、」の後ろで切れるならそこで、切れなければ 1 文字ずつ
function wrap(ctx, str, maxW) {
  const lines = [];
  let line = '';
  const fits = (t) => ctx.measureText(t).width <= maxW;
  for (const token of str.split(/(?<=、)/)) {
    if (fits(line + token)) { line += token; continue; }
    if (line && fits(token)) { lines.push(line); line = token; continue; }
    for (const ch of token) {
      if (line && !fits(line + ch)) { lines.push(line); line = ch; } else line += ch;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// 1 行に収まるまで文字を小さくする（下限 min）
function fitFont(ctx, str, maxW, size, weight, min) {
  let s = size;
  font(ctx, s, weight);
  while (s > min && ctx.measureText(str).width > maxW) { s -= 1; font(ctx, s, weight); }
  return s;
}

function swatch(ctx, hex, x, y, size) {
  ctx.fillStyle = `#${hex}`;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
}

// ---- ページ ----

class Doc {
  constructor() { this.pages = []; this.ctx = null; this.y = M; }
  newPage() {
    const c = document.createElement('canvas');
    c.width = PAGE_W;
    c.height = PAGE_H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    this.pages.push(c);
    this.ctx = ctx;
    this.y = M;
    return ctx;
  }
  room() { return BOTTOM - this.y; }
}

function plateSeams(ctx, layout, s, ox, oy, rect) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1.5, s * 0.1);
  ctx.setLineDash([s * 0.4, s * 0.3]);
  for (let c = 1; c < layout.cols; c++) {
    const gx = c * layout.plateSize;
    if (gx <= rect.x || gx >= rect.x + rect.w) continue;
    ctx.beginPath(); ctx.moveTo((gx - ox) * s, (rect.y - oy) * s); ctx.lineTo((gx - ox) * s, (rect.y + rect.h - oy) * s); ctx.stroke();
  }
  for (let r = 1; r < layout.rows; r++) {
    const gy = r * layout.plateSize;
    if (gy <= rect.y || gy >= rect.y + rect.h) continue;
    ctx.beginPath(); ctx.moveTo((rect.x - ox) * s, (gy - oy) * s); ctx.lineTo((rect.x + rect.w - ox) * s, (gy - oy) * s); ctx.stroke();
  }
  ctx.restore();
}

// ---- 表紙 ----

function coverPage(doc, { label, plan, plateHex, url }) {
  const ctx = doc.newPage();
  const cx = PAGE_W / 2;
  font(ctx, 28);
  text(ctx, 'ナオブロック（naoblock）組立図', cx, M + 28, { align: 'center', color: '#444' });
  const titleSize = fitFont(ctx, label, CW, 64, 700, 32);
  text(ctx, label, cx, M + 28 + 18 + titleSize, { align: 'center' });
  const top = M + 28 + 18 + titleSize + 36;

  // 下から：注意書き、表
  const cm = (plan.layout.width * 4) / 10;
  const facts = [
    ['大きさの目安', `約 ${cm}cm 角（1 ポッチ約 4mm で計算。実物で要確認）`],
    ['パーツの総数', `${plan.pieces.length} 個`],
    ['合計金額', `${yen(plan.shopping.total)}（税込。パーツ ${plan.shopping.bags} 袋＋20×20 プレート ${plan.shopping.plate.count} 枚）`],
    ['アプリ', url],
  ];
  const thW = 210, tdW = CW - thW - 40, line = 40;
  font(ctx, 26);
  const factLines = facts.map(([, v]) => wrap(ctx, v, tdW));
  const factsH = factLines.reduce((n, ls) => n + ls.length * line + 10, 0);
  const legalText = 'Nouns は CC0 です。nanoblock（ナノブロック）は株式会社カワダの登録商標です。本アプリは非公式のファン作品です。';
  const legalSize = fitFont(ctx, legalText, CW, 20, 400, 14);
  const legal = wrap(ctx, legalText, CW);
  const legalH = legal.length * 30;

  // 完成図：残りの高さに収まる大きさ
  const size = Math.min(CW - 120, BOTTOM - top - 40 - factsH - 40 - legalH);
  const s = size / plan.layout.width;
  ctx.save();
  ctx.translate(cx - size / 2, top);
  drawFinishedBoard(ctx, { layout: plan.layout, pieces: plan.pieces, plateHex, scale: s });
  plateSeams(ctx, plan.layout, s, 0, 0, { x: 0, y: 0, w: plan.layout.width, h: plan.layout.height });
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  ctx.restore();

  let y = top + size + 40;
  const fx = M + 20;
  facts.forEach(([k], i) => {
    font(ctx, 26, 700);
    text(ctx, k, fx, y + 28, { color: '#333' });
    font(ctx, 26);
    factLines[i].forEach((l, j) => text(ctx, l, fx + thW, y + 28 + j * line));
    y += factLines[i].length * line + 10;
  });
  font(ctx, legalSize);
  legal.forEach((l, j) => text(ctx, l, M, BOTTOM - legalH + 22 + j * 30, { color: '#555' }));
}

// ---- 部品リスト・買い物リスト（表。入りきらない行は次のページへ。行の途中では切らない） ----

const ROW_H = 36;
const TABLE_FONT = 22;

// columns: [{ label, w（null は残りの幅）, align }]、rows: [[{ text, swatch? } …]]
function table(doc, { title, notes = [], warnings = [], columns, rows, footer, after = [] }) {
  const fixed = columns.reduce((n, c) => n + (c.w || 0), 0);
  const cols = columns.map((c) => ({ ...c, w: c.w || CW - fixed }));
  const xs = [];
  cols.reduce((x, c) => { xs.push(x); return x + c.w; }, M);

  const heading = (cont) => {
    const ctx = doc.ctx;
    font(ctx, 34, 700);
    text(ctx, cont ? `${title}（つづき）` : title, M, doc.y + 36);
    ctx.fillStyle = '#000';
    ctx.fillRect(M, doc.y + 48, CW, 3);
    doc.y += 64;
  };
  const header = () => {
    const ctx = doc.ctx;
    font(ctx, TABLE_FONT - 2, 700);
    cols.forEach((c, i) => text(ctx, c.label, c.align === 'right' ? xs[i] + c.w - 8 : xs[i] + 8, doc.y + 26, { align: c.align === 'right' ? 'right' : 'left', color: '#333' }));
    ctx.fillStyle = '#000';
    ctx.fillRect(M, doc.y + ROW_H - 2, CW, 2);
    doc.y += ROW_H;
  };
  const row = (cells, bold = false) => {
    const ctx = doc.ctx;
    font(ctx, TABLE_FONT, bold ? 700 : 400);
    cells.forEach((cell, i) => {
      if (!cell) return;
      const c = cols[i];
      let x = c.align === 'right' ? xs[i] + c.w - 8 : xs[i] + 8;
      if (cell.swatch) { swatch(ctx, cell.swatch, x, doc.y + 9, 18); x += 28; }
      if (cell.text) text(ctx, cell.text, x, doc.y + 26, { align: c.align === 'right' ? 'right' : (c.align || 'left') });
    });
    ctx.fillStyle = '#bbb';
    ctx.fillRect(M, doc.y + ROW_H - 1, CW, 1);
    doc.y += ROW_H;
  };
  const noteLines = (list, size, color) => {
    const ctx = doc.ctx;
    font(ctx, size);
    for (const n of list) for (const l of wrap(ctx, n, CW)) {
      if (doc.room() < size + 12) doc.newPage();
      text(doc.ctx, l, M, doc.y + size, { color });
      doc.y += size + 12;
    }
  };

  // 見出し＋表の頭＋最初の 2 行が入らなければ、次のページから
  if (doc.room() < 64 + 80 + ROW_H * 3) doc.newPage();
  heading(false);
  noteLines(notes, 22, '#333');
  for (const w of warnings) {
    const ctx = doc.ctx;
    font(ctx, 24, 700);
    const lines = wrap(ctx, w, CW - 40);
    const h = lines.length * 34 + 20;
    if (doc.room() < h) doc.newPage();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(M + 1.5, doc.y + 1.5, CW - 3, h - 3);
    lines.forEach((l, j) => text(doc.ctx, l, M + 20, doc.y + 36 + j * 34));
    doc.y += h + 10;
  }
  header();
  // 表のあとの注意書きは、最後の行と同じページに入れる（注意書きだけのページを作らない）
  font(doc.ctx, 22);
  const afterH = 10 + after.reduce((n, t) => n + wrap(doc.ctx, t, CW).length * 34, 0);
  const all = [...rows.map((r) => [r, false]), ...(footer ? [[footer, true]] : [])];
  for (const [k, [r, bold]] of all.entries()) {
    // 合計の行は、ひとつ前の行と同じページに（合計だけが次のページに行かないように）
    const left = all.length - k;
    const need = left === 2 && footer ? ROW_H * 2 + afterH : ROW_H + (left === 1 ? afterH : 0);
    if (doc.room() < need) {
      doc.newPage();
      heading(true);
      header();
    }
    row(r, bold);
  }
  doc.y += 10;
  noteLines(after, 22, '#333');
}

function listPages(doc, { plan, partsData }) {
  doc.newPage();
  table(doc, {
    title: '部品リスト',
    notes: ['袋から出した部品を数えたら、□ に印を付けてください。'],
    columns: [{ label: '✓', w: 70 }, { label: '色', w: null }, { label: '形', w: 200 }, { label: '個数', w: 160, align: 'right' }],
    rows: plan.parts.map((p) => {
      const c = colorById(p.color);
      return [{ text: '□' }, { swatch: c.hex, text: c.name }, { text: shapeLabel(p.shape) }, { text: `${p.count}` }];
    }),
    footer: [null, { text: '合計' }, null, { text: `${plan.pieces.length}` }],
  });
  doc.y += 40;
  const sh = plan.shopping;
  table(doc, {
    title: '買い物リスト',
    warnings: plan.seams.filter((s) => s.weak).map((s) => `⚠ ${s.label}の継ぎ目は、またぐパーツがありません。ここは割れやすい。裏打ちが必要`),
    columns: [{ label: '部品', w: null }, { label: '必要数', w: 300, align: 'right' }, { label: '袋数', w: 140, align: 'right' }, { label: '金額', w: 200, align: 'right' }],
    rows: [
      ...sh.lines.map((l) => {
        const c = colorById(l.color);
        return [{ swatch: c.hex, text: `${c.name} ${shapeLabel(l.shape)}` }, { text: `${l.count}個 ÷ ${l.perBag}個入` }, { text: `${l.bags}袋` }, { text: yen(l.price) }];
      }),
      [{ text: sh.plate.name }, null, { text: `${sh.plate.count}枚` }, { text: yen(sh.plate.price) }],
    ],
    footer: [{ text: `合計（パーツ ${sh.bags}袋 ＋ プレート ${sh.plate.count}枚）` }, null, null, { text: yen(sh.total) }],
    after: [`値段は税込。買う先：Kawada Base（単色部品） ${partsData.shopUrl}`],
  });
}

// ---- 組立手順 ----

// 図の範囲（マス）と、塗る範囲（clip）
//  プレート：そのプレートのまわりに 1 マス分の余白（隣のプレートは塗らない）。端のパーツも黒枠ごと見える
//  つなぎ：このステップで置くパーツを囲む範囲に寄せる（まわりに 4 マス、最低 20×20、盤面の中）
export function stepArea(step, plan) {
  const { layout } = plan;
  if (step.kind === 'plate') {
    const s = layout.plateSize;
    const px = (step.plate % layout.cols) * s, py = Math.floor(step.plate / layout.cols) * s;
    return { area: { x: px - 1, y: py - 1, w: s + 2, h: s + 2 }, clip: { x: px, y: py, w: s, h: s } };
  }
  const cells = step.pieces.flatMap((i) => pieceCells(plan.pieces[i]));
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
  const side = Math.min(Math.max(layout.width, layout.height), Math.max(20, x1 - x0 + 8, y1 - y0 + 8));
  const place = (lo, hi, max) => Math.max(0, Math.min(max - side, Math.round((lo + hi) / 2 - side / 2)));
  const area = { x: place(x0, x1, layout.width), y: place(y0, y1, layout.height), w: side, h: side };
  return { area, clip: area };
}

// 置き済みは薄く、このステップで置くパーツは濃い色＋太い黒枠（白黒でも分かるように、内側に白い線も）
function drawStep(ctx, { plan, plateHex, done, current, area, clip, s, join }) {
  const { x: ox, y: oy } = area;
  const cx = (clip.x - ox) * s, cy = (clip.y - oy) * s, cw = clip.w * s, ch = clip.h * s;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, area.w * s, area.h * s);
  const [pr, pg, pb] = hexToRgb(plateHex);
  ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
  ctx.fillRect(cx, cy, cw, ch);

  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, cw, ch);
  ctx.clip();
  // マス目（数えやすいように 5 マスごとに少し濃く）
  ctx.lineWidth = 1;
  for (let i = clip.x; i <= clip.x + clip.w; i++) {
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo((i - ox) * s + 0.5, cy); ctx.lineTo((i - ox) * s + 0.5, cy + ch); ctx.stroke();
  }
  for (let j = clip.y; j <= clip.y + clip.h; j++) {
    ctx.strokeStyle = j % 5 === 0 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(cx, (j - oy) * s + 0.5); ctx.lineTo(cx + cw, (j - oy) * s + 0.5); ctx.stroke();
  }
  const cellsIn = (p) => pieceCells(p).map(([x, y]) => [x - ox, y - oy]);
  for (const p of done) {
    const cells = cellsIn(p);
    const [r, g, b] = hexToRgb(colorById(p.color).hex);
    ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
    for (const [x, y] of cells) ctx.fillRect(x * s, y * s, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    outlinePath(ctx, s, cells, 0.5);
    ctx.stroke();
  }
  ctx.restore();

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
  if (join) plateSeams(ctx, plan.layout, s, ox, oy, clip);
  // プレートの縁
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cw, ch);
  ctx.restore();
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

// 継ぎ目の名前（「左上と右上の継ぎ目」。3 枚以上は「・」でつなぐ）
export function seamName(plates, layout) {
  const names = plates.map((n) => plateName(n, layout));
  return `${names.length === 2 ? names.join('と') : names.join('・')}の継ぎ目`;
}

const GAP = 36;
const HEAD_H = 64;

function stepBox(ctx, { plan, plateHex, steps, si, done, x, y, w, h }) {
  const step = steps[si];
  const color = colorById(step.color);
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  const pad = 18, iw = w - pad * 2;
  // 見出し 2 行：「ステップ 12 / 27」と「左下プレート・イエロー・オレンジ」
  font(ctx, 30, 700);
  text(ctx, `ステップ ${si + 1} / ${steps.length}`, x + pad, y + pad + 30);
  const sub = `${step.label}・${color.name}`;
  fitFont(ctx, sub, iw, 26, 400, 16);
  text(ctx, sub, x + pad, y + pad + 30 + 40, { color: '#222' });

  // 下：使うパーツ（と、つなぎなら継ぎ目の名前）
  font(ctx, 24);
  const usage = wrap(ctx, `${color.name}：${stepUsage(step, plan.pieces)}（${step.pieces.length} 個）`, iw - 34);
  const join = step.kind !== 'plate';
  const footH = usage.length * 34 + (join ? 34 : 0) + 8;
  const figTop = y + pad + 30 + 40 + 20;
  const figSize = Math.min(iw, y + h - pad - footH - figTop);

  const { area, clip } = stepArea(step, plan);
  const s = figSize / Math.max(area.w, area.h);
  const current = step.pieces.map((i) => plan.pieces[i]);
  ctx.save();
  ctx.translate(x + (w - area.w * s) / 2, figTop);
  drawStep(ctx, { plan, plateHex, done, current, area, clip, s, join });
  ctx.restore();

  let fy = figTop + figSize + 8;
  swatch(ctx, color.hex, x + pad, fy + 6, 24);
  font(ctx, 24);
  usage.forEach((l, j) => text(ctx, l, x + pad + 34, fy + 26 + j * 34));
  fy += usage.length * 34;
  if (join) {
    font(ctx, 22);
    text(ctx, seamName(step.plates, plan.layout), x + pad, fy + 26, { color: '#333' });
  }
}

function stepPages(doc, { plan, plateHex, steps }) {
  const done = [];
  const boxW = (CW - GAP) / 2;
  const boxH = (PAGE_H - M * 2 - HEAD_H - GAP) / 2;
  for (let si = 0; si < steps.length; si += STEPS_PER_PAGE) {
    const ctx = doc.newPage();
    font(ctx, 34, 700);
    text(ctx, si === 0 ? '組立手順' : '組立手順（つづき）', M, M + 36);
    ctx.fillStyle = '#000';
    ctx.fillRect(M, M + 48, CW, 3);
    for (let k = si; k < Math.min(si + STEPS_PER_PAGE, steps.length); k++) {
      const n = k - si;
      const x = M + (n % 2) * (boxW + GAP);
      const y = M + HEAD_H + Math.floor(n / 2) * (boxH + GAP);
      stepBox(ctx, { plan, plateHex, steps, si: k, done: [...done], x, y, w: boxW, h: boxH });
      for (const i of steps[k].pieces) done.push(plan.pieces[i]);
    }
  }
}

// ---- まとめ ----

function drawAll(opts) {
  const doc = new Doc();
  coverPage(doc, opts);
  listPages(doc, opts);
  stepPages(doc, opts);
  return doc.pages;
}

const toJpeg = (canvases) => canvases.map((c) => ({ dataUrl: c.toDataURL('image/jpeg', JPEG_QUALITY), width: c.width, height: c.height }));

// ページの絵を作る（フォントを読み込んでから描く）。
// opts: { label, plan, partsData, steps, plateHex, url }。戻り値：[{ dataUrl（JPEG）, width, height }]
export async function renderPages(opts) {
  collecting = new Set();
  try { drawAll(opts); } finally { /* 使う文字を集めただけ */ }
  const sample = [...collecting].join('');
  collecting = null;
  if (document.fonts?.load) {
    try {
      await Promise.all([400, 700].map((w) => document.fonts.load(`${w} 24px "Noto Sans JP"`, sample)));
    } catch { /* 読み込めなくても、ほかのフォントで描く */ }
  }
  return toJpeg(drawAll(opts));
}

// フォントを待たずにすぐ作る（⌘P などで印刷の画面が先に開いたとき用）
export function renderPagesNow(opts) {
  return toJpeg(drawAll(opts));
}

// PDF（Blob）
export function pagesToPdf(pages) {
  const bytes = buildPdf(pages.map((p) => ({ jpeg: dataUrlBytes(p.dataUrl), width: p.width, height: p.height })));
  return new Blob([bytes], { type: 'application/pdf' });
}

// 印刷用：ページの絵を 1 ページに 1 枚ずつ並べる。全部の絵の decode() を待つ
export async function fillPrintRoot(container, pages) {
  const imgs = pages.map((p, i) => {
    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.alt = `組立図 ${i + 1} / ${pages.length} ページ`;
    return img;
  });
  container.replaceChildren(...imgs);
  await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
}
