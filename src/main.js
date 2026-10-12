// 画面の組み立て（取得・画面の切り替え・ボタン・キーボード）
import { fetchSeed, fetchImageData, decodeNoun } from './nouns.js';
import { makePlan } from './plan.js';
import { buildSteps } from './steps.js';
import { buildBlocks } from './pieces.js';
import { buildStages } from './stages.js';
import { Game } from './game.js';
import { GameView, drawBlockPreview } from './gameview.js';
import * as sound from './sound.js';
import { completedPixels, originalPixels, drawPixels } from './sample.js';
import { formatTime, shareText, appUrl, shareIntentUrl, drawFinishImage, downloadCanvas, renderRealParts } from './finish.js';
import { buildPrintout } from './print.js';

// プレートの色は未確認（手順書 7）。決まるまでの仮の色
const PLATE_HEX = 'd9d6cf';

const HELP_KEY = 'naoblock:help-seen-game';
const HINT_MS = 5000; // れんしゅう：5 秒迷ったら正解の場所が光る
const CLEAR_PAUSE_MS = 1300;
// タイムアタック（仮の数字。遊んで調整する）
const TA_MS_PER_BLOCK = 4000; // 制限時間＝ステージのブロック数 × 4 秒
const TA_HINT_PENALTY_MS = 5000; // ヒント 1 回で +5 秒
const PRACTICE_FALL_SLOWER = 2; // れんしゅうの落ちる速さはタイムアタックの半分

const MODES = { practice: 'れんしゅう', timeattack: 'タイムアタック' };

const $ = (id) => document.getElementById(id);

function show(view) {
  for (const v of ['start', 'loading', 'play', 'finish']) $(`view-${v}`).hidden = v !== view;
  document.body.dataset.view = view;
}

// ステージのタイム（「23秒」「1分5秒」）
function formatStageTime(ms) {
  const sec = Math.floor(ms / 1000);
  return sec < 60 ? `${sec}秒` : `${Math.floor(sec / 60)}分${sec % 60}秒`;
}

let toastTimer = 0;
function toast(text, ms = 1100) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  t.classList.remove('pop');
  void t.offsetWidth; // アニメーションをやり直す
  t.classList.add('pop');
  t.style.animationDuration = `${ms}ms`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---- 途中保存（れんしゅうだけ。Noun の番号とモードごと） ----

const saveKey = (id, mode) => `naoblock:game:v1:noun:${id}:${mode}`;

// ブロックの分け方が変わったら古い保存は使わない
function signature(stages) {
  const s = JSON.stringify(stages.map((st) => st.blocks.map((b) => b.cells)));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

function loadSave(id, mode, sig) {
  try {
    const save = JSON.parse(localStorage.getItem(saveKey(id, mode)) || 'null');
    return save && save.sig === sig ? save : null;
  } catch { return null; }
}

function writeSave(id, mode, data) {
  try { localStorage.setItem(saveKey(id, mode), JSON.stringify(data)); } catch { /* 保存できない環境では途中保存なし */ }
}

function clearSave(id, mode) {
  try { localStorage.removeItem(saveKey(id, mode)); } catch { /* 無視 */ }
}

function askResume(save, game, mode) {
  return new Promise((resolve) => {
    const d = $('resume');
    const done = save.done;
    $('resume-text').textContent = done
      ? `${MODES[mode]}：この Noun は完成しています（${formatTime(save.elapsedMs)}）。`
      : mode === 'timeattack'
        ? `タイムアタック：ステージ ${save.stage + 1} / ${game.stages.length} から続けられます（それまでのタイム ${formatTime(save.elapsedMs)}）。ステージの途中からではなく、ステージの最初からです。`
        : `れんしゅう：途中まで組んであります（ステージ ${save.stage + 1} / ${game.stages.length}・ブロック ${game.placedCount} / ${game.totalBlocks}・${formatTime(save.elapsedMs)}）。`;
    $('resume-continue').textContent = done ? '完成図を見る' : '続きから';
    d.hidden = false;
    const finish = (v) => { d.hidden = true; resolve(v); };
    $('resume-continue').onclick = () => finish(true);
    $('resume-restart').onclick = () => finish(false);
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

const anyModalOpen = () => ['help', 'resume', 'sample', 'mode'].some((m) => !$(m).hidden);

// ---- モードと、この端末のベスト記録（タイムアタック、Noun の番号ごと） ----

const bestKey = (id) => `naoblock:best:v1:noun:${id}:timeattack`;

function loadBest(id) {
  try { return JSON.parse(localStorage.getItem(bestKey(id)) || 'null'); } catch { return null; }
}

// ベストを更新したら true
function saveBest(id, totalMs) {
  const best = loadBest(id);
  if (best && best.totalMs <= totalMs) return false;
  try { localStorage.setItem(bestKey(id), JSON.stringify({ totalMs: Math.round(totalMs), at: Date.now() })); } catch { /* 無視 */ }
  return true;
}

function chooseMode(id) {
  return new Promise((resolve) => {
    const best = loadBest(id);
    $('mode-best').textContent = best ? `この端末のベスト：${formatTime(best.totalMs)}` : 'まだ記録はありません';
    $('mode').hidden = false;
    const pick = (m) => { $('mode').hidden = true; resolve(m); };
    $('mode-practice').onclick = () => pick('practice');
    $('mode-timeattack').onclick = () => pick('timeattack');
  });
}

// ---- お手本の絵 ----

const sample = { completed: null, original: null, frame: null, mode: 'completed' };

const landscapeQuery = '(max-height: 500px) and (orientation: landscape)';

function miniSize() {
  if (window.matchMedia(landscapeQuery).matches) return 56;
  if (window.matchMedia('(max-height: 760px) and (orientation: portrait)').matches) return 64;
  return window.matchMedia('(min-width: 700px)').matches ? 100 : 88;
}

function drawMini() {
  if (sample.completed) drawPixels($('mini-canvas'), sample.completed, miniSize(), sample.frame);
  const landscape = window.matchMedia(landscapeQuery).matches;
  // 横向きでは、右の欄の見出しのすぐ下に置く
  $('mini').style.top = landscape
    ? `${Math.round(document.querySelector('.hud-top').getBoundingClientRect().bottom + 6)}px` : '';
  // 縦向きで盤面の上の余白が小窓より狭いときは、盤面の上に小窓の場所を空ける（盤面は少し小さくなる）
  const wrap = $('board-wrap');
  let pad = '';
  if (!landscape && !$('view-play').hidden) {
    // 余白なしで盤面を真ん中に置いたとき、右上の小窓と重なるか
    const area = document.querySelector('.board-area').getBoundingClientRect();
    const mini = $('mini');
    const side = Math.min(area.width, area.height) - 12;
    const boardTop = (area.height - side) / 2, boardRight = (area.width + side) / 2;
    const miniBottom = 8 + mini.offsetHeight, miniLeft = area.width - 8 - mini.offsetWidth;
    if (boardTop < miniBottom + 4 && boardRight > miniLeft - 4) pad = `${mini.offsetHeight + 14}px`;
  }
  if (wrap.style.paddingTop !== pad) wrap.style.paddingTop = pad;
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

// 完成画面
function showFinish(id, result, { plan, partsData, steps, onAgain }) {
  $('finish-title').textContent = `Noun ${id} 完成！`;
  $('finish-stats').textContent = result.mode === 'timeattack'
    ? `タイムアタック ${formatTime(result.elapsedMs)}${result.newBest ? '（ベスト更新！）' : ''}・使ったパーツ ${result.pieces}個`
    : `使ったパーツ ${result.pieces}個・かかった時間 ${formatTime(result.elapsedMs)}`;
  const canvas = $('finish-canvas');
  drawFinishImage(canvas, { layout: plan.layout, pieces: plan.pieces, plateHex: PLATE_HEX });
  $('save-image').onclick = () => downloadCanvas(canvas, `naoblock-noun${id}.png`);
  $('share-x').href = shareIntentUrl(shareText(id, result.pieces, result.elapsedMs), appUrl(id, location.href));
  renderRealParts($('real-parts'), plan, partsData);
  // 印刷用の組立図は、印刷するときに作る（Ctrl+P / ⌘P で印刷したときも）
  let printReady = false;
  const preparePrint = () => {
    if (printReady) return;
    buildPrintout($('print-root'), { id, plan, partsData, steps, plateHex: PLATE_HEX, url: appUrl(id, location.href) });
    printReady = true;
  };
  window.onbeforeprint = () => { if (!$('view-finish').hidden) preparePrint(); };
  $('print-guide').onclick = () => { preparePrint(); window.print(); };
  $('finish-again').onclick = () => {
    document.title = `Noun ${id} を組み立てる｜ナオブロック`;
    show('play');
    onAgain();
  };
  document.title = `Noun ${id} 完成！｜ナオブロック`;
  show('finish');
  window.scrollTo(0, 0);
}

// ---- 遊ぶ画面 ----

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
  const stages = buildStages(buildBlocks(plan.pieces, plan.layout), plan.layout);
  const sig = signature(stages);
  document.title = `Noun ${id} を組み立てる｜ナオブロック`;
  $('play-noun').textContent = `Noun ${id}`;

  sample.completed = completedPixels(plan.board, PLATE_HEX);
  sample.original = originalPixels(noun, bgHex, plan.layout.width, plan.layout.height);
  initSample();

  show('play');
  drawMini();

  // ---- モードをえらぶ（毎回最初に） ----
  const mode = await chooseMode(id);
  const ta = mode === 'timeattack';

  let save = loadSave(id, mode, sig);
  if (save && (save.done || save.stage > 0 || save.block > 0)) {
    const preview = new Game({ stages, layout: plan.layout, save });
    if (!(await askResume(save, preview, mode))) { save = null; clearSave(id, mode); }
  } else {
    save = null;
  }
  // タイムアタックはステージの途中から続けない（ステージの最初から）
  if (save && ta && !save.done) save = { ...save, block: 0 };

  // ---- 時間 ----
  // れんしゅう：最初の操作から数える。タイムアタック：ステージが始まったら数える。
  // どちらも画面を離れている間は止める
  const clock = {
    elapsed: save?.elapsedMs || 0,
    stageStart: save?.stageStartMs || 0,
    since: null,
    start() { if (this.since == null) this.since = performance.now(); },
    pause() { if (this.since != null) { this.elapsed += performance.now() - this.since; this.since = null; } },
    get now() { return this.elapsed + (this.since != null ? performance.now() - this.since : 0); },
  };
  // タイムアタック：合計は「クリアしたステージのタイムの合計」。時間切れでやり直した分は入れない
  if (ta && save && !save.done) {
    const sum = (save.stageTimes || []).reduce((n, t) => n + (t || 0), 0);
    clock.elapsed = sum;
    clock.stageStart = sum;
  }

  let game = new Game({ stages, layout: plan.layout, save: save && !save.done ? save : null });
  let finished = !!save?.done;
  let locked = false;
  let hintMs = 0;
  let fallMs = 0;

  const view = new GameView($('board-wrap'), $('board'), {
    layout: plan.layout,
    pieces: plan.pieces,
    plateHex: PLATE_HEX,
    game,
    onTap: (cx, cy) => act(() => tap(cx, cy)),
  });

  const stageElapsed = () => clock.now - clock.stageStart;
  const stageLimit = () => (game.done ? 0 : game.stage.blocks.length * TA_MS_PER_BLOCK);
  const fallInterval = () => (game.stage.fallMs || 800) * (ta ? 1 : PRACTICE_FALL_SLOWER);

  const persist = () => {
    // タイムアタックは、ステージの最初の時点だけを残す（途中で閉じたらそのステージの最初から）
    const snap = game.snapshot();
    writeSave(id, mode, {
      v: 1, sig, mode, ...snap, block: ta && !finished ? 0 : snap.block, done: finished,
      elapsedMs: Math.round(ta && !finished ? clock.stageStart : clock.now), stageStartMs: Math.round(clock.stageStart),
    });
  };

  const updateTimer = () => {
    const t = $('timer');
    if (!ta || finished || game.done) { t.hidden = true; return; }
    const left = Math.max(0, stageLimit() - stageElapsed());
    t.hidden = false;
    t.textContent = `のこり ${Math.ceil(left / 1000)}秒`;
    t.classList.toggle('low', left < 10000);
  };

  const updateHud = () => {
    if (game.done) {
      $('step-label').textContent = '完成！';
    } else {
      const where = game.stage.label.replace('プレート', '');
      $('step-label').textContent = `ステージ ${game.stageIndex + 1}/${game.stages.length} ${where}${game.falling ? '・落ちてくる' : ''}`;
    }
    $('progress-text').textContent = `ブロック ${game.placedCount}/${game.totalBlocks}`;
    $('mode-badge').textContent = MODES[mode];
    $('mode-badge').classList.toggle('ta', ta);
    $('progress-bar').style.width = `${(game.placedCount / game.totalBlocks) * 100}%`;
    drawBlockPreview($('next-canvas'), game.nextBlock);
    sample.frame = game.done ? null : game.stageArea();
    $('hint').hidden = !ta;
    $('pad-up').disabled = game.falling; // 落ちてくる型では上へは動かせない（タップでは飛べる）
    updateTimer();
    drawMini();
  };

  const resetHint = () => { hintMs = 0; view.hint = false; };

  // 操作の共通の入口：止めている間や案内を出している間は受け付けない
  const act = (fn) => {
    if (locked || finished || game.done || anyModalOpen()) return;
    sound.unlock();
    clock.start();
    fn();
  };

  const moved = (from) => view.movedFrom(from.x, from.y);

  const lockFor = (ms, then) => {
    locked = true;
    view.locked = true;
    setTimeout(() => { locked = false; view.locked = false; then?.(); }, ms);
  };

  const finish = () => {
    clock.pause();
    finished = true;
    const total = ta ? game.stageTimes.reduce((n, t) => n + (t || 0), 0) : clock.elapsed;
    clock.elapsed = total;
    const newBest = ta ? saveBest(id, total) : false;
    persist();
    updateHud();
    setTimeout(() => sound.complete(), 400);
    // 完成した盤面を少し見せてから完成画面へ
    setTimeout(() => showFinish(id, { pieces: plan.pieces.length, elapsedMs: total, mode, newBest },
      { plan, partsData, steps, onAgain: restart }), 1200);
  };

  const afterPlaced = (block, res) => {
    view.dropBlock(block, () => sound.click());
    resetHint();
    fallMs = 0;
    if (res.stageCleared) {
      const st = res.clearedStage;
      const time = stageElapsed();
      game.stageTimes[st] = Math.round(time);
      clock.stageStart = clock.now;
      setTimeout(() => sound.stepDone(), 150);
      if (res.done) { locked = true; view.locked = true; finish(); return; }
      toast(`ステージ ${st + 1} クリア！ ${formatStageTime(time)}`, CLEAR_PAUSE_MS);
      if (ta) clock.pause(); // タイムアタック：クリアの表示の間は時間を止める
      persist();
      updateHud();
      lockFor(CLEAR_PAUSE_MS, () => { if (ta) clock.start(); });
      return;
    }
    persist();
    updateHud();
  };

  // 落ちてくる型：正解の位置と向きに重なった瞬間に、自動ではまる
  const autoPlace = () => {
    if (!game.falling || !game.isCorrect()) return false;
    const block = game.block;
    const res = game.place();
    if (res.ok) afterPlaced(block, res);
    return true;
  };

  const place = () => {
    const block = game.block;
    const from = { ...game.held };
    const res = game.place();
    if (res.ok) afterPlaced(block, res);
    else { view.shake(); moved(from); sound.nope(); }
  };

  const tap = (cx, cy) => {
    const block = game.block;
    const from = { ...game.held };
    const r = game.tapCell(cx, cy);
    if (r === 'placed') {
      const res = game.place();
      if (res.ok) afterPlaced(block, res);
    } else if (r === 'moved') {
      moved(from);
    } else {
      autoPlace();
    }
  };

  const fallStep = () => {
    const from = { ...game.held };
    const r = game.fall();
    if (r === 'reset') { view.shake(); sound.nope(); }
    moved(from);
    autoPlace();
  };

  // タイムアタック：時間切れ → そのステージを最初からやり直し
  const timeUp = () => {
    clock.pause();
    sound.nope();
    toast(`時間切れ！ ステージ ${game.stageIndex + 1} をもう一度`, CLEAR_PAUSE_MS + 200);
    lockFor(CLEAR_PAUSE_MS + 200, () => {
      game.restartStage();
      clock.elapsed = clock.stageStart; // やり直した分は合計に入れない
      clock.since = null;
      clock.start();
      resetHint();
      fallMs = 0;
      view.refresh();
      updateHud();
    });
  };

  const restart = () => {
    clearSave(id, mode);
    game = new Game({ stages, layout: plan.layout });
    view.game = game;
    finished = false;
    locked = false;
    view.locked = false;
    clock.elapsed = 0; clock.stageStart = 0; clock.since = null;
    if (ta) clock.start();
    resetHint();
    fallMs = 0;
    view.refresh();
    updateHud();
  };

  // ---- コントローラー（押しっぱなしで続けて動く） ----
  const hold = (btn, fn) => {
    let timer = 0, repeat = 0;
    const stop = () => { clearTimeout(timer); clearInterval(repeat); btn.classList.remove('pressed'); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      fn();
      timer = setTimeout(() => { repeat = setInterval(fn, 80); }, 280);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
    btn.addEventListener('click', (e) => e.preventDefault());
  };
  const tapButton = (btn, fn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.add('pressed'); fn(); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => btn.classList.remove('pressed'));
  };

  const move = (dx, dy) => act(() => {
    if (game.falling && dy < 0) return; // 落ちてくる型では上へは動かせない
    if (game.falling && dy > 0) { fallMs = 0; fallStep(); return; } // 下：速く落とす
    const from = { ...game.held };
    game.move(dx, dy);
    moved(from);
    autoPlace();
  });
  const rotate = (dir) => act(() => { game.rotate(dir); autoPlace(); });

  document.querySelectorAll('.dpad .pad').forEach((b) => hold(b, () => move(Number(b.dataset.dx), Number(b.dataset.dy))));
  tapButton($('rotate-left'), () => rotate(-1));
  tapButton($('rotate-right'), () => rotate(1));
  tapButton($('place'), () => act(place));
  // タイムアタック：ヒントボタン（押すと正しい場所が光る。1 回 +5 秒）
  tapButton($('hint'), () => act(() => {
    if (view.hint) return; // もう光っているときは数えない
    view.hint = true;
    clock.elapsed += TA_HINT_PENALTY_MS;
    toast('ヒント ＋5秒', 700);
    updateTimer();
  }));

  // ---- キーボード（矢印・Z / X・スペース） ----
  window.addEventListener('keydown', (e) => {
    if ($('view-play').hidden || anyModalOpen()) return;
    const keys = {
      ArrowLeft: () => move(-1, 0), ArrowRight: () => move(1, 0), ArrowUp: () => move(0, -1), ArrowDown: () => move(0, 1),
      z: () => rotate(-1), Z: () => rotate(-1), x: () => rotate(1), X: () => rotate(1),
      ' ': () => act(place), Enter: () => act(place),
    };
    const fn = keys[e.key];
    if (!fn) return;
    e.preventDefault();
    if ((e.key === ' ' || e.key === 'Enter') && e.repeat) return;
    fn();
  });

  // ---- 時計の針（100ms ごと）：落ちる・ヒント・制限時間 ----
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (document.hidden || locked || finished || game.done || anyModalOpen() || $('view-play').hidden) return;
    // れんしゅう：5 秒迷ったら正解の場所が光る
    if (!ta) {
      hintMs += dt;
      if (hintMs >= HINT_MS) view.hint = true;
    }
    // 落ちてくる型：一定の間隔で 1 マスずつ落とす（れんしゅうは最初の操作のあとから）
    if (game.falling && (ta || clock.since != null)) {
      fallMs += dt;
      if (fallMs >= fallInterval()) { fallMs = 0; fallStep(); }
    }
    // タイムアタック：制限時間
    if (ta) {
      updateTimer();
      if (stageElapsed() >= stageLimit()) timeUp();
    }
  }, 100);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clock.pause(); if (!finished && !game.done) persist(); }
    else if (ta && !finished && !game.done && !locked) { clock.start(); last = performance.now(); }
  });
  window.addEventListener('pagehide', () => { clock.pause(); if (!finished && !game.done) persist(); });

  updateHud();
  if (finished) {
    showFinish(id, { pieces: plan.pieces.length, elapsedMs: clock.elapsed, mode }, { plan, partsData, steps, onAgain: restart });
  } else {
    if (!helpSeen()) await showHelp();
    if (ta) clock.start(); // タイムアタックは、ここから数える
  }
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
