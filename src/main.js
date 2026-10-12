// 画面の組み立て（取得・状態・イベント）
import { fetchSeed, fetchImageData, decodeNoun } from './nouns.js';
import { BLOCK_COLORS, colorById } from './palette.js';
import { makePlan } from './plan.js';
import { drawBoard, renderColorMap, renderSeams, renderParts, renderShopping, renderSummary } from './render.js';

const $ = (id) => document.getElementById(id);

const state = {
  id: null,
  noun: null,
  overrides: {},
  plateColor: 'light-gray',
  partsData: null,
  imageData: null,
};

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
  $('status').hidden = !text;
}

function update() {
  const plan = makePlan(state.noun, { overrides: state.overrides, partsData: state.partsData });
  if (!plan.check.ok) console.error('パーツ割りの検算に失敗', plan.check.errors);
  renderSummary($('summary'), state.id, plan);
  renderSeams($('seams'), plan);
  drawBoard($('board'), plan, colorById(state.plateColor).hex);
  renderColorMap($('colormap'), plan, (hex, colorId) => {
    state.overrides = { ...state.overrides, [hex]: colorId };
    update();
  });
  renderParts($('parts'), plan);
  renderShopping($('shopping'), plan, state.partsData);
  $('result').hidden = false;
}

async function load(id) {
  state.id = id;
  state.overrides = {};
  $('result').hidden = true;
  setStatus(`Noun ${id} を読み込み中…`);
  try {
    const [seed, imageData, partsData] = await Promise.all([
      fetchSeed(id),
      state.imageData ?? fetchImageData(),
      state.partsData ?? fetch('data/parts.json').then((r) => r.json()),
    ]);
    state.imageData = imageData;
    state.partsData = partsData;
    state.noun = decodeNoun(seed, imageData);
    setStatus('');
    update();
  } catch (e) {
    console.error(e);
    setStatus(e.message, true);
  }
}

function init() {
  const plateSelect = $('plate-color');
  for (const c of BLOCK_COLORS) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name;
    o.selected = c.id === state.plateColor;
    plateSelect.append(o);
  }
  plateSelect.addEventListener('change', () => {
    state.plateColor = plateSelect.value;
    if (state.noun) update();
  });

  $('noun-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = $('noun-id').value.trim();
    if (!/^\d+$/.test(id)) return;
    const url = new URL(location.href);
    url.searchParams.set('noun', id);
    history.pushState(null, '', url);
    load(id);
  });

  const fromUrl = () => {
    const id = new URLSearchParams(location.search).get('noun');
    if (id && /^\d+$/.test(id)) {
      $('noun-id').value = id;
      load(id);
    }
  };
  window.addEventListener('popstate', fromUrl);
  fromUrl();
}

init();
