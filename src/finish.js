// 完成画面（画像保存・シェア・リスト）
import { colorById } from './palette.js';
import { drawFinishedBoard } from './board.js';

const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const shapeLabel = (s) => s.replace('x', '×');

export function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}分${sec % 60}秒`;
}

// 結果の表・ランキング用（0.1 秒まで。「12.3秒」「1分05.3秒」）
export function formatTimeFine(ms) {
  const tenths = Math.round(ms / 100);
  const sec = Math.floor(tenths / 10), t = tenths % 10;
  if (sec < 60) return `${sec}.${t}秒`;
  return `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}.${t}秒`;
}

// シェアの文面用（「12分」。1 分未満は「45秒」）
export function formatTimeShort(ms) {
  const sec = Math.floor(ms / 1000);
  return sec < 60 ? `${sec}秒` : `${Math.floor(sec / 60)}分`;
}

export function shareText(id, pieces, elapsedMs, mode = 'practice', guide = false) {
  if (mode === 'timeattack') return `Noun ${id} をナオブロックで組み立てた！ タイムアタック${guide ? '（ガイドあり）' : ''} ${formatTime(elapsedMs)} #naoblock #Nouns`;
  return `Noun ${id} をナオブロックで組み立てた！ パーツ ${pieces}個・${formatTimeShort(elapsedMs)} #naoblock #Nouns`;
}

// アプリの URL（?noun= だけを付ける）
export function appUrl(id, href) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('noun', id);
  return url.toString();
}

export function shareIntentUrl(text, url) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
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

const swatch = (hex) => el('span', { class: 'swatch', style: `background:#${hex}` });

// 完成図の画像（保存する PNG と同じもの）。完成図の下に小さく「naoblock」
const IMAGE_CELL = 24;
const IMAGE_PAD = 24;
const IMAGE_FOOT = 44;

export function drawFinishImage(canvas, { layout, pieces, plateHex }) {
  const boardW = layout.width * IMAGE_CELL, boardH = layout.height * IMAGE_CELL;
  canvas.width = boardW + IMAGE_PAD * 2;
  canvas.height = boardH + IMAGE_PAD + IMAGE_FOOT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(IMAGE_PAD, IMAGE_PAD);
  drawFinishedBoard(ctx, { layout, pieces, plateHex, scale: IMAGE_CELL });
  ctx.restore();
  ctx.fillStyle = '#9a9a9a';
  ctx.font = 'bold 20px system-ui, -apple-system, "Hiragino Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('naoblock', canvas.width - IMAGE_PAD, IMAGE_PAD + boardH + IMAGE_FOOT / 2);
}

export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

function partsTable(plan) {
  const rows = plan.parts.map((p) => {
    const c = colorById(p.color);
    return el('tr', {},
      el('td', {}, swatch(c.hex), c.name),
      el('td', {}, shapeLabel(p.shape)),
      el('td', { class: 'num' }, `${p.count}`));
  });
  return el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, '色'), el('th', {}, '形'), el('th', { class: 'num' }, '個数'))),
    el('tbody', {}, rows),
    el('tfoot', {}, el('tr', {}, el('td', { colspan: '2' }, '合計'), el('td', { class: 'num' }, `${plan.pieces.length}`))));
}

function shoppingTable(plan, partsData) {
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
  return [
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, '部品'), el('th', { class: 'num' }, '必要数'), el('th', { class: 'num' }, '袋数'), el('th', { class: 'num' }, '金額'))),
      el('tbody', {}, rows),
      el('tfoot', {}, el('tr', {},
        el('td', { colspan: '3' }, `合計（パーツ ${sh.bags}袋 ＋ プレート ${sh.plate.count}枚）`),
        el('td', { class: 'num' }, yen(sh.total))))),
    el('p', { class: 'note' }, '値段は税込。買う先：',
      el('a', { href: partsData.shopUrl, target: '_blank', rel: 'noopener' }, 'Kawada Base（単色部品）')),
  ];
}

function seamWarnings(plan) {
  return plan.seams.filter((s) => s.weak).map((s) =>
    el('p', { class: 'warn' }, `⚠ ${s.label}の継ぎ目は、またぐパーツがありません。ここは割れやすい。裏打ちが必要`));
}

// 「実物で組むなら」の中身
export function renderRealParts(container, plan, partsData) {
  container.replaceChildren(
    ...seamWarnings(plan),
    el('h3', {}, '部品リスト'),
    partsTable(plan),
    el('h3', {}, '買い物リスト'),
    ...shoppingTable(plan, partsData),
  );
}

const formatDate = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 結果：モード・合計タイム・ステージごとのタイム。タイムアタックはランキング（この端末の上位 5 件）も
// stages は src/stages.js の buildStages の結果（ステージ名とブロック数に使う）
export function renderResult(container, { mode, guide = false, totalMs, stageTimes = [], stages, ranking = null, rank = -1 }) {
  const ta = mode === 'timeattack';
  const rows = stages.map((st, i) => {
    const t = stageTimes[i];
    const time = st.blocks.length === 0 ? '（ブロックなし）' : t == null ? '—' : formatTimeFine(t);
    return el('tr', {}, el('td', {}, `ステージ ${i + 1}　${st.label}`), el('td', { class: 'num' }, time));
  });
  const parts = [
    el('h3', {}, `${ta ? 'タイムアタック' : 'れんしゅう'}${guide ? '（ガイドあり）' : ''}の結果`),
    el('table', { class: 'result-table' },
      el('tbody', {}, rows),
      el('tfoot', {}, el('tr', {}, el('td', {}, '合計'), el('td', { class: 'num' }, formatTimeFine(totalMs))))),
  ];
  if (!ta) parts.push(el('p', { class: 'note' }, 'れんしゅうのタイムは、最初の操作からの時間です（ステージクリアの表示の間も入ります）。'));
  if (ta && ranking) {
    parts.push(el('h3', {}, `ランキング（この端末・この Noun・${guide ? 'ガイドあり' : 'ガイドなし'}）`));
    parts.push(el('ol', { class: 'ranking' }, ranking.map((r, i) => el('li', { class: i === rank ? 'me' : '' },
      el('span', { class: 'rank-no' }, `${i + 1}位`),
      el('span', { class: 'rank-time' }, formatTimeFine(r.totalMs)),
      el('span', { class: 'rank-date' }, i === rank ? 'いま' : formatDate(r.at))))));
    if (rank < 0) parts.push(el('p', { class: 'note' }, `今回の記録は ${ranking.length} 位までに入りませんでした。`));
  }
  container.replaceChildren(...parts);
}
