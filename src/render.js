// 画面の描画
import { BLOCK_COLORS, colorById, hexToRgb } from './palette.js';

const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const shapeLabel = (s) => s.replace('x', '×');

function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v + amount))));
  return `rgb(${r},${g},${b})`;
}

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

function swatch(hex) {
  return el('span', { class: 'swatch', style: `background:#${hex}` });
}

// 完成図：ポッチ付きのマス目。プレートの境目に薄い線、パーツの輪郭に細い線
export function drawBoard(canvas, plan, plateHex, cell = 16) {
  const { layout, board, pieces } = plan;
  canvas.width = layout.width * cell;
  canvas.height = layout.height * cell;
  const ctx = canvas.getContext('2d');

  const stud = (x, y, hex) => {
    const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell, r = cell * 0.32;
    ctx.beginPath();
    ctx.arc(cx + cell * 0.04, cy + cell * 0.06, r, 0, Math.PI * 2);
    ctx.fillStyle = shade(hex, -45);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = shade(hex, 18);
    ctx.fill();
  };

  ctx.fillStyle = `#${plateHex}`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (board[y][x] == null) stud(x, y, plateHex);
    }
  }

  for (const p of pieces) {
    const hex = colorById(p.color).hex;
    ctx.fillStyle = `#${hex}`;
    ctx.fillRect(p.x * cell, p.y * cell, p.w * cell, p.h * cell);
    for (let j = p.y; j < p.y + p.h; j++) for (let i = p.x; i < p.x + p.w; i++) stud(i, j, hex);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x * cell + 0.5, p.y * cell + 0.5, p.w * cell - 1, p.h * cell - 1);
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([cell / 3, cell / 4]);
  for (let c = 1; c < layout.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * layout.plateSize * cell, 0);
    ctx.lineTo(c * layout.plateSize * cell, canvas.height);
    ctx.stroke();
  }
  for (let r = 1; r < layout.rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * layout.plateSize * cell);
    ctx.lineTo(canvas.width, r * layout.plateSize * cell);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// 元の色 → ブロックの色。select を変えると onChange(元の色, ブロックの色 id)
export function renderColorMap(container, plan, onChange) {
  const rows = plan.sources.map((s) => {
    const select = el('select', { 'aria-label': `#${s.hex} のブロックの色` },
      BLOCK_COLORS.map((c) => {
        const o = el('option', { value: c.id }, c.name);
        if (c.id === plan.colorMap[s.hex]) o.selected = true;
        return o;
      }));
    const chosen = swatch(colorById(plan.colorMap[s.hex]).hex);
    select.addEventListener('change', () => onChange(s.hex, select.value));
    return el('tr', {},
      el('td', {}, swatch(s.hex), el('code', {}, `#${s.hex}`)),
      el('td', { class: 'num' }, `${s.count}`),
      el('td', { class: 'arrow' }, '→'),
      el('td', {}, chosen, select));
  });
  container.replaceChildren(el('table', { class: 'colormap' },
    el('thead', {}, el('tr', {}, el('th', {}, '元の色'), el('th', {}, 'ドット'), el('th', {}), el('th', {}, 'ブロックの色'))),
    el('tbody', {}, rows)));
}

export function renderSeams(container, plan) {
  const weak = plan.seams.filter((s) => s.weak);
  container.replaceChildren(...weak.map((s) =>
    el('p', { class: 'warn' }, `⚠ ${s.label} の継ぎ目は、またぐパーツがありません。ここは割れやすい。裏打ちが必要`)));
  container.hidden = weak.length === 0;
}

export function renderParts(container, plan) {
  const rows = plan.parts.map((p) => {
    const c = colorById(p.color);
    return el('tr', {},
      el('td', {}, swatch(c.hex), c.name),
      el('td', {}, shapeLabel(p.shape)),
      el('td', { class: 'num' }, `${p.count}`));
  });
  container.replaceChildren(el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '色'), el('th', {}, '形'), el('th', { class: 'num' }, '個数'))),
    el('tbody', {}, rows),
    el('tfoot', {}, el('tr', {}, el('td', { colspan: '2' }, '合計'), el('td', { class: 'num' }, `${plan.pieces.length}`)))));
}

export function renderShopping(container, plan, partsData) {
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
    el('td', {}, `${sh.plate.name}（${partsData.plate.note}）`),
    el('td', { class: 'num' }, ''),
    el('td', { class: 'num' }, `${sh.plate.count}枚`),
    el('td', { class: 'num' }, yen(sh.plate.price))));
  container.replaceChildren(
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, '部品'), el('th', { class: 'num' }, '必要数'), el('th', { class: 'num' }, '数'), el('th', { class: 'num' }, '金額'))),
      el('tbody', {}, rows),
      el('tfoot', {}, el('tr', {}, el('td', { colspan: '3' }, `合計（パーツ ${sh.bags}袋 ＋ プレート ${sh.plate.count}枚）`), el('td', { class: 'num' }, yen(sh.total))))),
    el('p', { class: 'note' }, '買う先：', el('a', { href: partsData.shopUrl, target: '_blank', rel: 'noopener' }, 'Kawada Base（単色部品）'), '。値段は税込'));
}

export function renderSummary(container, id, plan) {
  const mm = plan.layout.width * 4;
  container.replaceChildren(
    el('h2', {}, `Noun ${id}`),
    el('p', {}, `大きさ 約${mm / 10}cm 角（1 ポッチ約 4mm で計算・要確認）／パーツ ${plan.pieces.length} 個／合計 ${yen(plan.shopping.total)}`));
}
