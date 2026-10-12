// 画面の組み立て（取得・画面の切り替え・ボタン）
import { fetchSeed, fetchImageData, decodeNoun } from './nouns.js';
import { colorById, hexToRgb } from './palette.js';
import { makePlan } from './plan.js';
import { buildSteps, stepArea } from './steps.js';
import { Board } from './board.js';
import { Play, loadSave } from './play.js';
import * as sound from './sound.js';
import { completedPixels, originalPixels, drawPixels } from './sample.js';
import { formatTime, shareText, appUrl, shareIntentUrl, drawFinishImage, downloadCanvas, renderRealParts } from './finish.js';

// プレートの色は未確認（手順書 7）。決まるまでの仮の色
const PLATE_HEX = 'd9d6cf';

const HELP_KEY = 'naoblock:help-seen';

const $ = (id) => document.getElementById(id);

function show(view) {
  for (const v of ['start', 'loading', 'play', 'finish']) $(`view-${v}`).hidden = v !== view;
  document.body.dataset.view = view;
}

const shapeLabel = (p) => `${Math.min(p.w, p.h)}×${Math.max(p.w, p.h)}`;

function drawPreview(canvas, piece) {
  const cell = 18;
  const w = Math.max(piece.w, piece.h), h = Math.min(piece.w, piece.h); // 横長で見せる
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * cell * dpr;
  canvas.height = h * cell * dpr;
  canvas.style.width = `${w * cell}px`;
  canvas.style.height = `${h * cell}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const hex = colorById(piece.color).hex;
  const [r, g, b] = hexToRgb(hex);
  const tint = (a) => `rgb(${[r, g, b].map((v) => Math.max(0, Math.min(255, v + a))).join(',')})`;
  ctx.fillStyle = `#${hex}`;
  ctx.fillRect(0, 0, w * cell, h * cell);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.beginPath();
      ctx.arc((x + 0.5) * cell + 1, (y + 0.5) * cell + 1, cell * 0.31, 0, Math.PI * 2);
      ctx.fillStyle = tint(-45);
      ctx.fill();
      ctx.beginPath();
      ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.31, 0, Math.PI * 2);
      ctx.fillStyle = tint(18);
      ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w * cell - 1, h * cell - 1);
}

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  t.classList.remove('pop');
  void t.offsetWidth; // アニメーションをやり直す
  t.classList.add('pop');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1100);
}

function askResume(save, total) {
  return new Promise((resolve) => {
    const d = $('resume');
    $('resume-text').textContent = save.placed >= total
      ? `この Noun は完成しています（${formatTime(save.elapsedMs)}）。`
      : `途中まで組んであります（${save.placed} / ${total} 個・${formatTime(save.elapsedMs)}）。`;
    $('resume-continue').textContent = save.placed >= total ? '完成図を見る' : '続きから';
    d.hidden = false;
    const done = (v) => { d.hidden = true; resolve(v); };
    $('resume-continue').onclick = () => done(true);
    $('resume-restart').onclick = () => done(false);
  });
}

// ---- 遊び方の案内 ----

function helpSeen() {
  try { return localStorage.getItem(HELP_KEY) === '1'; } catch { return false; }
}

function showHelp() {
  return new Promise((resolve) => {
    $('help').hidden = false;
    $('help-close').onclick = () => {
      $('help').hidden = true;
      try { localStorage.setItem(HELP_KEY, '1'); } catch { /* 保存できなければ次回も出る */ }
      resolve();
    };
  });
}

// ---- お手本の絵 ----

const sample = { completed: null, original: null, frame: null, mode: 'completed' };

function miniSize() {
  return window.matchMedia('(min-width: 700px)').matches ? 100 : 88;
}

function drawMini() {
  if (sample.completed) drawPixels($('mini-canvas'), sample.completed, miniSize(), sample.frame);
}

// 絵の大きさは、カードの中の実際の幅と、画面に収まる高さの両方を超えないように決める
function sampleSize() {
  const card = document.querySelector('.sample-card');
  const cs = getComputedStyle(card);
  const innerW = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const modal = $('sample');
  const ms = getComputedStyle(modal);
  const outer = (el) => {
    const st = getComputedStyle(el);
    return el.offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
  };
  const innerH = modal.clientHeight - parseFloat(ms.paddingTop) - parseFloat(ms.paddingBottom)
    - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    - outer(document.querySelector('.sample-head')) - outer($('sample-note'));
  return Math.max(80, Math.floor(Math.min(innerW, innerH)));
}

function drawSample() {
  const size = sampleSize();
  const original = sample.mode === 'original';
  drawPixels($('sample-canvas'), original ? sample.original : sample.completed, size);
  $('sample-completed').setAttribute('aria-selected', String(!original));
  $('sample-original').setAttribute('aria-selected', String(original));
  $('sample-note').textContent = original
    ? '元絵：Nouns の本来の色と背景色'
    : '完成図：ブロックの色に置き換えたもの（背景はプレートの色）';
}

function initSample() {
  const modal = $('sample');
  $('mini').onclick = () => { sample.mode = 'completed'; modal.hidden = false; drawSample(); };
  $('sample-completed').onclick = () => { sample.mode = 'completed'; drawSample(); };
  $('sample-original').onclick = () => { sample.mode = 'original'; drawSample(); };
  $('sample-close').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  window.addEventListener('resize', () => {
    drawMini();
    if (!modal.hidden) drawSample();
  });
}

function updateHud(info) {
  const { step } = info;
  $('step-label').textContent = info.done
    ? '完成！'
    : `ステップ ${info.stepIndex + 1} / ${info.stepCount}　${step.label}・${colorById(step.color).name}`;
  $('progress-bar').style.width = `${(info.placed / info.total) * 100}%`;
  $('progress-text').textContent = `${info.placed} / ${info.total} 個`;
  if (info.currentPiece) {
    drawPreview($('next-canvas'), info.currentPiece);
    $('next-label').textContent = `${shapeLabel(info.currentPiece)} ${colorById(info.currentPiece.color).name}`;
    $('next-remaining').textContent = `このステップ あと ${info.remainingInStep} 個`;
    $('next').hidden = false;
  } else {
    $('next').hidden = true;
  }
  $('auto').textContent = info.auto ? '止める' : '残りを自動で置く';
  $('auto').classList.toggle('stop', info.auto);
  $('auto').disabled = info.done;
}

// 完成画面
function showFinish(id, result, { plan, partsData, play }) {
  $('finish-title').textContent = `Noun ${id} 完成！`;
  $('finish-stats').textContent = `使ったパーツ ${result.pieces}個・かかった時間 ${formatTime(result.elapsedMs)}`;
  const canvas = $('finish-canvas');
  drawFinishImage(canvas, { layout: plan.layout, pieces: plan.pieces, plateHex: PLATE_HEX });
  $('save-image').onclick = () => downloadCanvas(canvas, `naoblock-noun${id}.png`);
  $('share-x').href = shareIntentUrl(shareText(id, result.pieces, result.elapsedMs), appUrl(id, location.href));
  renderRealParts($('real-parts'), plan, partsData);
  $('finish-again').onclick = () => {
    document.title = `Noun ${id} を組み立てる｜ナオブロック`;
    show('play');
    play.restart();
  };
  document.title = `Noun ${id} 完成！｜ナオブロック`;
  show('finish');
  window.scrollTo(0, 0);
}

async function start(id) {
  show('loading');
  $('loading-text').textContent = `Noun ${id} を読み込み中…`;
  let noun, partsData, bgHex;
  try {
    const [seed, imageData, pd] = await Promise.all([
      fetchSeed(id),
      fetchImageData(),
      fetch('data/parts.json').then((r) => r.json()),
    ]);
    noun = decodeNoun(seed, imageData);
    partsData = pd;
    bgHex = imageData.bgcolors[seed.background] ?? imageData.bgcolors[0];
  } catch (e) {
    console.error(e);
    $('loading-text').textContent = `読み込めませんでした：${e.message}`;
    $('loading-retry').hidden = false;
    return;
  }

  const plan = makePlan(noun, { partsData });
  const steps = buildSteps(plan.pieces, plan.layout);
  document.title = `Noun ${id} を組み立てる｜ナオブロック`;
  $('play-noun').textContent = `Noun ${id}`;

  sample.completed = completedPixels(plan.board, PLATE_HEX);
  sample.original = originalPixels(noun, bgHex, plan.layout.width, plan.layout.height);
  initSample();

  show('play');
  drawMini();
  let save = loadSave(id, plan.pieces);
  if (save && save.placed > 0 && !(await askResume(save, plan.pieces.length))) save = null;

  let play;
  const board = new Board($('board-wrap'), $('board'), {
    layout: plan.layout,
    pieces: plan.pieces,
    plateHex: PLATE_HEX,
    onTap: (cx, cy) => play?.tap(cx, cy),
  });
  play = new Play({
    id,
    pieces: plan.pieces,
    steps,
    board,
    save,
    hooks: {
      onChange: (info) => {
        updateHud(info);
        sample.frame = info.done ? null : stepArea(info.step, plan.pieces, plan.layout);
        drawMini();
      },
      onStepDone: (si) => toast(`ステップ ${si + 1} 完了！`),
      // 完成した盤面を少し見せてから完成画面へ
      onComplete: (result) => setTimeout(() => showFinish(id, result, { plan, partsData, play }), 700),
    },
  });
  if (!save) play.restart(); // 「最初から」を選んだら保存も消す
  if (play.done) showFinish(id, { pieces: play.total, elapsedMs: play.elapsedMs }, { plan, partsData, play });
  else if (!helpSeen()) showHelp();

  $('auto').onclick = () => (play.auto ? play.stopAuto() : play.startAuto());
  $('zoom-in').onclick = () => { board.zoomBy(1.5); board.ensureVisible(play.info().current, false); };
  $('zoom-out').onclick = () => board.zoomBy(1 / 1.5);
}

function init() {
  const muteBtn = $('mute');
  const syncMute = () => {
    muteBtn.textContent = sound.isMuted() ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', sound.isMuted() ? '音を出す' : '消音');
    muteBtn.setAttribute('aria-pressed', String(sound.isMuted()));
  };
  muteBtn.onclick = () => { sound.setMuted(!sound.isMuted()); sound.unlock(); syncMute(); };
  syncMute();

  $('loading-retry').onclick = () => location.reload();
  $('help-open').onclick = () => showHelp();

  const id = new URLSearchParams(location.search).get('noun');
  if (id != null && /^\d+$/.test(id)) {
    start(String(Number(id)));
  } else {
    show('start');
  }
}

init();
