// スタート画面の Nouns タブ：30 体の一覧と範囲検索。
// 絵は前もって用意せず、seed（30 体分を 1 回で問い合わせ）＋パーツの絵（image-data）から、その場で描く
import { fetchSeeds, fetchLatestId, fetchImageData, nounPicture, NOUN_SIZE } from './nouns.js';

export const PAGE_SIZE = 30;

// 見る範囲（純粋関数）：開始番号から 30 体。0 番より前・最新より後ははみ出さないよう、端で止める
// 例：最新 2046 で 2030 → 2017〜2046。戻り値：{ start, end, hasPrev, hasNext }
export function rangeFor(start, latest, size = PAGE_SIZE) {
  const last = Math.max(0, latest);
  const s = Math.max(0, Math.min(Math.floor(start), last - size + 1));
  const e = Math.min(s + size - 1, last);
  return { start: s, end: e, hasPrev: s > 0, hasNext: e < last };
}

// 開始番号の入力：数字だけ（空・数字以外は null）
export function parseStart(text) {
  const t = String(text ?? '').trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...children.filter((c) => c != null));
  return e;
};

// 1 体のカード：背景色＋32×32 の絵（canvas）と「Noun 2046」。押すと ?noun=番号。
// 絵がない（読めなかった）ときは、絵の代わりに「？」（押せばゲームへ。ゲーム側でもう一度読む）
function nounCard(id, pic) {
  let face;
  if (pic) {
    face = el('canvas', { width: NOUN_SIZE, height: NOUN_SIZE });
    const ctx = face.getContext('2d');
    ctx.fillStyle = `#${pic.bgHex}`;
    ctx.fillRect(0, 0, NOUN_SIZE, NOUN_SIZE);
    pic.grid.forEach((row, y) => row.forEach((c, x) => {
      if (c == null) return;
      ctx.fillStyle = `#${c}`;
      ctx.fillRect(x, y, 1, 1);
    }));
  } else {
    face = el('span', { class: 'noun-unknown' }, '？');
  }
  face.setAttribute('aria-hidden', 'true');
  return el('a', { class: 'picture-card noun-card', href: `?noun=${id}` }, face, `Noun ${id}`);
}

// Nouns タブの一覧。戻り値：{ element, show }（show はタブを開いたときに呼ぶ。最初の 1 回だけ読み込む）
export function nounBrowser() {
  const title = el('h3', { class: 'noun-range-title' }, 'Noun の一覧');
  const input = el('input', { type: 'number', inputMode: 'numeric', min: '0', step: '1', placeholder: '100', name: 'from' });
  const viewBtn = el('button', { type: 'submit', class: 'noun-view' }, '見る');
  const form = el('form', { class: 'noun-range-form' }, el('label', {}, '番号 ', input, ' から 30 体'), viewBtn);
  const prev = el('button', { type: 'button', class: 'noun-nav-btn', disabled: true }, '◀ 前の 30 体');
  const next = el('button', { type: 'button', class: 'noun-nav-btn', disabled: true }, '次の 30 体 ▶');
  const list = el('div', { class: 'picture-list noun-list', 'aria-live': 'polite' });
  const element = el('div', { class: 'noun-browse' }, title, form, el('div', { class: 'noun-nav' }, prev, next), list);

  let latest = null;
  let current = null; // 今見ている範囲
  let token = 0;
  const cache = new Map(); // 番号 → seed（同じページの中で、一度見た範囲は問い合わせない）

  const message = (text, retry) => {
    const p = el('p', { class: 'noun-list-message' }, text);
    list.replaceChildren(retry ? el('div', {}, p, el('button', { type: 'button', onclick: retry }, 'もう一度')) : p);
  };

  const showRange = async (start) => {
    const my = ++token;
    try {
      if (latest == null) {
        message('読み込み中…');
        latest = await fetchLatestId();
        if (my !== token) return;
      }
      const r = rangeFor(start ?? latest, latest);
      current = r;
      title.textContent = `Noun ${r.start}〜${r.end}`;
      prev.disabled = !r.hasPrev;
      next.disabled = !r.hasNext;
      const ids = [];
      for (let id = r.start; id <= r.end; id++) ids.push(id);
      const missing = ids.filter((id) => !cache.has(id));
      const [imageData, seeds] = await Promise.all([
        fetchImageData(),
        missing.length ? (message('読み込み中…'), fetchSeeds(missing)) : Promise.resolve(new Map()),
      ]);
      if (my !== token) return;
      for (const id of missing) cache.set(id, seeds.get(id) ?? null);
      // 絵：あとから足されたパーツの Noun だけ noun.pics から。1 体だけ失敗しても一覧は止めず、そのカードは「？」
      const shown = ids.filter((id) => cache.get(id));
      const pics = await Promise.allSettled(shown.map((id) => nounPicture(id, cache.get(id), imageData)));
      if (my !== token) return;
      list.replaceChildren(...shown.map((id, i) => nounCard(id, pics[i].status === 'fulfilled' ? pics[i].value : null)));
      if (!list.childElementCount) message('この範囲の Noun はまだいません');
    } catch (e) {
      if (my !== token) return;
      console.error(e);
      message('Noun の一覧を読み込めませんでした', () => showRange(current ? current.start : start));
    }
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const n = parseStart(input.value);
    if (n == null) return; // 空・数字以外は何もしない
    showRange(n);
  };
  prev.onclick = () => { if (current?.hasPrev) showRange(current.start - PAGE_SIZE); };
  next.onclick = () => { if (current?.hasNext) showRange(current.start + PAGE_SIZE); };

  let shown = false;
  // 最初は最新の 30 体（最新−29〜最新。番号の小さい順）
  const show = () => { if (!shown) { shown = true; showRange(null); } };
  return { element, show };
}
