// 画面の組み立て（取得・画面の切り替え・ボタン）
import { fetchSeed, fetchImageData, decodeNoun } from './nouns.js';
import { colorById, hexToRgb } from './palette.js';
import { makePlan } from './plan.js';
import { buildSteps } from './steps.js';
import { Board } from './board.js';
import { Play, loadSave } from './play.js';
import * as sound from './sound.js';

// プレートの色は未確認（手順書 7）。決まるまでの仮の色
const PLATE_HEX = 'd9d6cf';

const $ = (id) => document.getElementById(id);

function show(view) {
  for (const v of ['start', 'loading', 'play']) $(`view-${v}`).hidden = v !== view;
  document.body.dataset.view = view;
}

export function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}分${sec % 60}秒`;
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

function showFinish(id, result, play) {
  $('finish-title').textContent = `Noun ${id} 完成！`;
  $('finish-stats').textContent = `使ったパーツ ${result.pieces} 個・かかった時間 ${formatTime(result.elapsedMs)}`;
  $('finish').hidden = false;
  $('finish-again').onclick = () => { $('finish').hidden = true; play.restart(); };
}

async function start(id) {
  show('loading');
  $('loading-text').textContent = `Noun ${id} を読み込み中…`;
  let noun, partsData;
  try {
    const [seed, imageData, pd] = await Promise.all([
      fetchSeed(id),
      fetchImageData(),
      fetch('data/parts.json').then((r) => r.json()),
    ]);
    noun = decodeNoun(seed, imageData);
    partsData = pd;
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

  show('play');
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
      onChange: updateHud,
      onStepDone: (si) => toast(`ステップ ${si + 1} 完了！`),
      onComplete: (result) => showFinish(id, result, play),
    },
  });
  if (!save) play.restart(); // 「最初から」を選んだら保存も消す
  if (play.done) showFinish(id, { pieces: play.total, elapsedMs: play.elapsedMs }, play);

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

  const id = new URLSearchParams(location.search).get('noun');
  if (id != null && /^\d+$/.test(id)) {
    start(String(Number(id)));
  } else {
    show('start');
  }
}

init();
