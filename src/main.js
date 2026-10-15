// 画面の組み立て（取得・画面の切り替え・ボタン・キーボード）
import { makePlan } from './plan.js';
import { VERSION } from './version.js';
import { buildSteps } from './steps.js';
import { buildBlocks } from './pieces.js';
import { buildStages } from './stages.js';
import { Game } from './game.js';
import { GameView, drawBlockPreview } from './gameview.js';
import * as sound from './sound.js';
import { completedPixels, originalPixels, drawPixels } from './sample.js';
import { formatTime, shareWithImage, drawFinishImage, downloadBlob, renderRealParts, renderResult } from './finish.js';
import { loadRanking, recordRanking } from './ranking.js';
import { renderPages, renderPagesNow, pagesToPdf, fillPrintRoot } from './print.js';
import { subjectFromUrl, qrProblem, saveKey, PICTURES, CATEGORIES } from './subjects.js';
import { nounBrowser } from './nounlist.js';
import { qrPanel } from './qrpanel.js';

// プレートの色は未確認（手順書 7）。決まるまでの仮の色
const PLATE_HEX = 'd9d6cf';

const HELP_KEY = 'naoblock:help-seen-game';
const GUIDE_KEY = 'naoblock:guide'; // ガイドあり／なし（前回の選択を覚えておく。はじめての人は「あり」）
const TAB_KEY = 'naoblock:tab'; // スタート画面で開いていたタブ（遊んで戻ったとき、同じタブを開く）
const CLEAR_PAUSE_MS = 1300;
const AUTO_MS = 100; // 「最後まで自動で組み立てる」で 1 個置く間隔（時計の針と同じ 0.1 秒ごと）
// タイムアタック（仮の数字。遊んで調整する）
const TA_MS_PER_BLOCK = 10000; // 制限時間＝ステージのブロック数 × 10 秒
const TA_HINT_PENALTY_MS = 3000; // ヒント 1 回で +3 秒
const TA_LIVES = 3; // ♥ の数。下まで落ちきる・時間切れで 1 つ減り、0 でゲームオーバー

const MODES = { practice: 'れんしゅう', timeattack: 'タイムアタック' };
const modeLabel = (mode, guide) => `${MODES[mode]}${guide ? '・ガイドあり' : ''}`;

const $ = (id) => document.getElementById(id);

function show(view) {
  for (const v of ['start', 'loading', 'play', 'finish']) $(`view-${v}`).hidden = v !== view;
  document.body.dataset.view = view;
}

// ステージのタイム（「23秒」「1分5秒」）
// タイムアタックの経過時間（増えていく表示。「3:12.4」）
function formatClock(ms) {
  const tenths = Math.floor(ms / 100);
  const sec = Math.floor(tenths / 10);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}.${tenths % 10}`;
}

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

// ---- 途中保存（題材とモードごと。名前は src/subjects.js の saveKey） ----

// ブロックの分け方が変わったら古い保存は使わない
function signature(stages) {
  const s = JSON.stringify(stages.map((st) => st.blocks.map((b) => b.cells)));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

function loadSave(subject, mode, sig) {
  try {
    const save = JSON.parse(localStorage.getItem(saveKey(subject, mode)) || 'null');
    return save && save.sig === sig ? save : null;
  } catch { return null; }
}

function writeSave(subject, mode, data) {
  try { localStorage.setItem(saveKey(subject, mode), JSON.stringify(data)); } catch { /* 保存できない環境では途中保存なし */ }
}

function clearSave(subject, mode) {
  try { localStorage.removeItem(saveKey(subject, mode)); } catch { /* 無視 */ }
}

function askResume(save, game, mode, guide) {
  return new Promise((resolve) => {
    const d = $('resume');
    const done = save.done;
    $('resume-text').textContent = done
      ? `${modeLabel(mode, guide)}：この絵は完成しています（${formatTime(save.elapsedMs)}）。`
      : mode === 'timeattack'
        ? `${modeLabel(mode, guide)}：ステージ ${save.stage + 1} / ${game.stages.length} から続けられます（それまでのタイム ${formatTime(save.elapsedMs)}）。ステージの途中からではなく、ステージの最初からです。`
        : `${modeLabel(mode, guide)}：途中まで組んであります（ステージ ${save.stage + 1} / ${game.stages.length}・ブロック ${game.placedCount} / ${game.totalBlocks}・${formatTime(save.elapsedMs)}）。`;
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

function showHelp(closeLabel = 'はじめる') {
  return new Promise((resolve) => {
    $('help-close').textContent = closeLabel;
    $('help').hidden = false;
    $('help-close').onclick = () => {
      $('help').hidden = true;
      try { localStorage.setItem(HELP_KEY, '1'); } catch { /* 保存できなければ次回も出る */ }
      resolve();
    };
  });
}

const anyModalOpen = () => ['help', 'resume', 'sample', 'mode', 'gameover', 'menu'].some((m) => !$(m).hidden);

// ---- モードをえらぶ（ガイドあり／なしのスイッチ付き。タイムアタックのボタンに、この端末のベストを出す） ----

function loadGuide() {
  try { return localStorage.getItem(GUIDE_KEY) !== '0'; } catch { return true; }
}

function chooseMode(subject) {
  return new Promise((resolve) => {
    let guide = loadGuide();
    const sync = () => {
      $('guide-on').setAttribute('aria-pressed', String(guide));
      $('guide-off').setAttribute('aria-pressed', String(!guide));
      const best = loadRanking(subject, guide)[0];
      $('mode-best').textContent = best ? `この端末のベスト（${guide ? 'ガイドあり' : 'ガイドなし'}）：${formatTime(best.totalMs)}` : `まだ記録はありません（${guide ? 'ガイドあり' : 'ガイドなし'}）`;
    };
    const setGuide = (v) => {
      guide = v;
      try { localStorage.setItem(GUIDE_KEY, v ? '1' : '0'); } catch { /* 保存できなければ次回は「あり」 */ }
      sync();
    };
    $('guide-on').onclick = () => setGuide(true);
    $('guide-off').onclick = () => setGuide(false);
    sync();
    $('mode').hidden = false;
    const pick = (m) => { $('mode').hidden = true; resolve({ mode: m, guide }); };
    $('mode-practice').onclick = () => pick('practice');
    $('mode-timeattack').onclick = () => pick('timeattack');
  });
}

// ---- お手本の絵 ----

const sample = { completed: null, original: null, note: '', frame: null, mode: 'completed' };

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
    ? sample.note
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
function showFinish(subject, result, { plan, partsData, steps, stages, onAgain }) {
  const { label } = subject;
  const ta = result.mode === 'timeattack';
  $('finish-title').textContent = `${label} 完成！`;
  const rankText = ta && result.continued ? '（ゲームオーバーから続けたので、ランキングには入りません）'
    : ta && result.rank === 0 ? '（ベスト更新！）' : ta && result.rank > 0 ? `（この端末で ${result.rank + 1} 位）` : '';
  $('finish-stats').textContent = `${modeLabel(result.mode, result.guide)}・合計 ${formatTime(result.elapsedMs)}${rankText}・使ったパーツ ${result.pieces}個`;
  renderResult($('finish-result'), {
    mode: result.mode, guide: result.guide, scope: subject.scope, totalMs: result.elapsedMs, stageTimes: result.stageTimes, stages,
    ranking: ta ? (result.ranking || loadRanking(subject, result.guide)) : null, rank: result.rank ?? -1,
  });
  const canvas = $('finish-canvas');
  drawFinishImage(canvas, { layout: plan.layout, pieces: plan.pieces, plateHex: PLATE_HEX });
  // X にシェア：完成図の画像を付ける（画像は先に作っておく）
  let shareBlob = null;
  canvas.toBlob((b) => { shareBlob = b; }, 'image/png');
  $('share-note').hidden = true;
  $('share-x').onclick = async () => {
    try {
      const blob = shareBlob || await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const how = await shareWithImage({ text: subject.shareText(result), url: subject.url(location.href), blob, fileName: subject.fileName });
      if (how === 'saved') {
        $('share-note').textContent = '画像を保存しました。投稿画面に添付してください。';
        $('share-note').hidden = false;
      }
    } catch (e) {
      console.error(e);
      $('share-note').textContent = `シェアできませんでした：${e.message}`;
      $('share-note').hidden = false;
    }
  };
  renderRealParts($('real-parts'), plan, partsData);
  // 組立図：アプリがページの絵を描き、PDF もプリンターも同じ絵から作る。
  // 「実物で組むなら」を開いたら先に作り始める（ボタンを押したときにすぐ出せるように）
  const printOpts = { label, plan, partsData, steps, plateHex: PLATE_HEX, url: subject.url(location.href) };
  let pages = null; // できあがったページの絵
  let making = null;
  const preparePages = () => (making ??= renderPages(printOpts).then((p) => (pages = p)));
  const status = (msg) => { $('print-status').hidden = !msg; $('print-status').textContent = msg || ''; };
  const busy = async (btn, msg, work) => {
    btn.disabled = true;
    status(msg);
    try { await work(); status(''); } catch (e) { console.error(e); status(`うまくいきませんでした：${e.message}`); } finally { btn.disabled = false; }
  };
  $('print-root').replaceChildren();
  document.querySelector('.real').ontoggle = (e) => { if (e.target.open) setTimeout(preparePages, 50); };
  $('save-pdf').onclick = () => busy($('save-pdf'), '組立図の PDF を作っています…', async () => {
    downloadBlob(pagesToPdf(await preparePages()), subject.pdfName);
  });
  $('print-guide').onclick = () => busy($('print-guide'), '印刷の準備をしています…', async () => {
    await fillPrintRoot($('print-root'), await preparePages());
    window.print();
  });
  // ⌘P / Ctrl+P で印刷の画面が先に開いたとき：できていればそれを、まだならその場で作る
  window.onbeforeprint = () => {
    if ($('view-finish').hidden || $('print-root').childElementCount) return;
    const now = pages || renderPagesNow(printOpts);
    $('print-root').replaceChildren(...now.map((p) => Object.assign(document.createElement('img'), { src: p.dataUrl, alt: '' })));
  };
  $('finish-again').onclick = () => {
    document.title = `${label} を組み立てる｜naoblock`;
    show('play');
    onAgain();
  };
  document.title = `${label} 完成！｜naoblock`;
  show('finish');
  window.scrollTo(0, 0);
}

// ---- 遊ぶ画面 ----

// subject：src/subjects.js の題材
async function start(subject) {
  const { label } = subject;
  show('loading');
  $('loading-text').textContent = `${label} を読み込み中…`;
  let noun, partsData, bgHex;
  try {
    const [pic, pd] = await Promise.all([subject.load(), fetch('data/parts.json').then((r) => r.json())]);
    ({ grid: noun, bgHex } = pic);
    partsData = pd;
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
  document.title = `${label} を組み立てる｜naoblock`;
  $('play-noun').textContent = label;

  sample.completed = completedPixels(plan.board, PLATE_HEX);
  sample.original = originalPixels(noun, bgHex, plan.layout.width, plan.layout.height);
  sample.note = subject.originalNote;
  initSample();

  show('play');
  drawMini();

  // ---- モードをえらぶ（毎回最初に） ----
  const { mode, guide } = await chooseMode(subject);
  const ta = mode === 'timeattack';
  // 途中保存の置き場所：タイムアタックはガイドあり／なしでランキングが別なので、保存も分ける
  const slot = ta && guide ? 'timeattack-guide' : mode;
  // れんしゅうは落ちてこない（全ステージをパズル型にする）。ブロックの分け方は同じなので、途中保存の sig は変わらない
  const playStages = ta ? stages : stages.map((st) => ({ ...st, type: 'puzzle', fallMs: null }));

  let save = loadSave(subject, slot, sig);
  if (save && (save.done || save.stage > 0 || save.block > 0)) {
    const preview = new Game({ stages: playStages, layout: plan.layout, save });
    if (!(await askResume(save, preview, mode, guide))) { save = null; clearSave(subject, slot); }
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
    held: false, // ⏸ メニューを開いている間は動かさない（閉じたら動かす）
    wanted: false,
    start() { if (this.held) { this.wanted = true; return; } if (this.since == null) this.since = performance.now(); },
    pause() { if (this.since != null) { this.elapsed += performance.now() - this.since; this.since = null; } },
    get now() { return this.elapsed + (this.since != null ? performance.now() - this.since : 0); },
  };
  // タイムアタック：合計は「クリアしたステージのタイムの合計」。時間切れでやり直した分は入れない
  if (ta && save && !save.done) {
    const sum = (save.stageTimes || []).reduce((n, t) => n + (t || 0), 0);
    clock.elapsed = sum;
    clock.stageStart = sum;
  }

  let game = new Game({ stages: playStages, layout: plan.layout, save: save && !save.done ? save : null });
  let finished = !!save?.done;
  // タイムアタックの ♥ と、ゲームオーバーから続けたか（続けた記録はランキングに入れない）
  // ゲームオーバーの画面のまま閉じた（♥ が 0 で保存されている）ときは、「続けた」として ♥ を戻す
  const overSaved = !!(ta && save && !save.done && save.lives === 0);
  let lives = ta && save && !save.done && save.lives > 0 ? save.lives : TA_LIVES;
  let continued = !!(ta && save && !save.done && (save.continued || overSaved));
  let locked = false;
  let fallMs = 0;
  // nanoQR のれんしゅうだけ：⏸ メニューの「最後まで自動で組み立てる」
  const canAuto = subject.kind === 'qr' && !ta;
  let auto = false;
  let autoMs = 0;

  const view = new GameView($('board-wrap'), $('board'), {
    layout: plan.layout,
    pieces: plan.pieces,
    plateHex: PLATE_HEX,
    game,
    guide,
    onTap: (cx, cy) => act(() => tap(cx, cy)),
  });

  const stageElapsed = () => clock.now - clock.stageStart;
  const stageLimit = () => (game.done ? 0 : game.stage.blocks.length * TA_MS_PER_BLOCK);
  const fallInterval = () => game.stage.fallMs || 800;

  const persist = () => {
    // タイムアタックは、ステージの最初の時点だけを残す（途中で閉じたらそのステージの最初から）
    const snap = game.snapshot();
    writeSave(subject, slot, {
      v: 1, sig, mode, ...snap, block: ta && !finished ? 0 : snap.block, done: finished,
      elapsedMs: Math.round(ta && !finished ? clock.stageStart : clock.now), stageStartMs: Math.round(clock.stageStart),
      ...(ta ? { lives, continued } : {}),
    });
  };

  // タイムアタック：合計タイムを増えていく形で出す。ステージののこり時間は細いバーで見せ、10 秒を切ったら秒数も出す
  const updateTimer = () => {
    const t = $('timer');
    const bar = $('limit');
    if (!ta || finished || game.done) { t.hidden = true; bar.hidden = true; return; }
    const limit = stageLimit();
    const left = Math.max(0, limit - stageElapsed());
    const low = left < 10000;
    t.hidden = false;
    t.textContent = low ? `${formatClock(clock.now)}・のこり${Math.ceil(left / 1000)}秒` : formatClock(clock.now);
    t.classList.toggle('low', low);
    bar.hidden = false;
    bar.classList.toggle('low', low);
    $('limit-bar').style.width = `${limit ? (left / limit) * 100 : 0}%`;
  };

  const updateLives = () => {
    const el = $('lives');
    el.hidden = !ta || finished || game.done;
    el.textContent = '♥'.repeat(lives) + '♡'.repeat(TA_LIVES - lives);
    el.setAttribute('aria-label', `のこり ${lives}`);
  };

  const updateHud = () => {
    if (game.done) {
      $('step-label').textContent = '完成！';
    } else {
      const where = game.stage.label.replace('プレート', '');
      $('step-label').textContent = `ステージ ${game.stageIndex + 1}/${game.stages.length} ${where}${game.falling ? '・落ちてくる' : ''}`;
    }
    $('progress-text').textContent = `ブロック ${game.placedCount}/${game.totalBlocks}`;
    $('mode-badge').textContent = MODES[mode]; // ガイドの有無は盤面で見えるので、バッジはモードだけ（幅が足りない）
    $('mode-badge').classList.toggle('ta', ta);
    $('progress-bar').style.width = `${(game.placedCount / game.totalBlocks) * 100}%`;
    drawBlockPreview($('next-canvas'), game.nextBlock);
    sample.frame = game.done ? null : game.stageArea();
    $('hint').hidden = !ta;
    $('pad-up').disabled = game.falling; // 落ちてくる型では上へは動かせない（タップでは飛べる）
    updateTimer();
    updateLives();
    drawMini();
  };

  // 黄色い枠：れんしゅうはブロックが出た瞬間から出す。タイムアタックは 💡 を押したときだけ
  const resetHint = () => { view.hint = !ta; $('hint').disabled = false; };
  resetHint();

  const stopAuto = () => {
    auto = false;
    $('auto-stop').hidden = true;
  };
  const startAuto = () => {
    auto = true;
    autoMs = AUTO_MS;
    $('auto-stop').hidden = false;
    clock.start();
  };
  // 自動：持っているブロックを本来の場所に重ねて、はめる
  const autoStep = () => {
    game.snapToTarget();
    const res = game.place();
    if (res.ok) afterPlaced(res.block, res);
    if (res.done || !res.ok) stopAuto();
  };

  // 操作の共通の入口：止めている間や案内を出している間は受け付けない。自動で組み立てている間に触ったら、止めるだけ
  const act = (fn) => {
    if (locked || finished || game.done || anyModalOpen()) return;
    if (auto) { stopAuto(); return; }
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
    const ranked = ta && !continued ? recordRanking(subject, total, game.stageTimes, guide) : { list: null, rank: -1 };
    persist();
    updateHud();
    setTimeout(() => sound.complete(), 400);
    // 完成した盤面を少し見せてから完成画面へ
    setTimeout(() => showFinish(subject, {
      pieces: plan.pieces.length, elapsedMs: total, mode, guide, stageTimes: game.stageTimes.slice(), ranking: ranked.list, rank: ranked.rank, continued,
    }, { plan, partsData, steps, stages, onAgain: restart }), 1200);
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
    const res = game.place();
    if (res.ok) afterPlaced(res.block, res);
    return true;
  };

  const place = () => {
    const from = { ...game.held };
    const res = game.place();
    if (res.ok) afterPlaced(res.block, res);
    else { view.shake(); moved(from); sound.nope(); }
  };

  const tap = (cx, cy) => {
    const from = { ...game.held };
    const r = game.tapCell(cx, cy);
    if (r === 'placed') {
      const res = game.place();
      if (res.ok) afterPlaced(res.block, res);
    } else if (r === 'moved') {
      moved(from);
    } else {
      autoPlace();
    }
  };

  // 今のステージを最初からやり直す（時間切れ・ゲームオーバーから続ける）。やり直した分の時間は合計に入れない
  const retryStage = () => {
    game.restartStage();
    clock.elapsed = clock.stageStart;
    clock.since = null;
    clock.start();
    resetHint();
    fallMs = 0;
    view.refresh();
    updateHud();
  };

  // タイムアタック：♥ が 0 になった
  const gameOver = () => {
    clock.pause();
    locked = true;
    view.locked = true;
    sound.nope();
    persist();
    updateLives();
    $('gameover-text').textContent = `ステージ ${game.stageIndex + 1} で、ミスが ${TA_LIVES} 回になりました。続けて遊べますが、この回の記録はランキングに入りません。`;
    $('gameover').hidden = false;
  };
  $('gameover-continue').onclick = () => {
    $('gameover').hidden = true;
    lives = TA_LIVES;
    continued = true;
    locked = false;
    view.locked = false;
    retryStage();
    persist();
  };
  $('gameover-restart').onclick = () => { $('gameover').hidden = true; restart(); };

  // タイムアタック：ミス（下まで落ちきった・時間切れ）で ♥ を 1 つ減らす。0 になったら true
  const miss = () => {
    lives = Math.max(0, lives - 1);
    updateLives();
    if (lives > 0) return false;
    gameOver();
    return true;
  };

  const fallStep = () => {
    const from = { ...game.held };
    const r = game.fall();
    if (r === 'reset') {
      view.shake();
      sound.nope();
      if (ta && miss()) return;
      if (ta) toast(`ミス！ のこり ${'♥'.repeat(lives)}`, 900);
    }
    moved(from);
    autoPlace();
  };

  // タイムアタック：時間切れ → ミス 1 回。♥ が残っていれば、そのステージを最初からやり直し
  const timeUp = () => {
    if (miss()) return;
    clock.pause();
    sound.nope();
    toast(`時間切れ！ のこり ${'♥'.repeat(lives)}`, CLEAR_PAUSE_MS + 200);
    lockFor(CLEAR_PAUSE_MS + 200, retryStage);
  };

  const restart = () => {
    stopAuto();
    clearSave(subject, slot);
    lives = TA_LIVES;
    continued = false;
    game = new Game({ stages: playStages, layout: plan.layout });
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
  // ---- ⏸ メニュー：開いている間はゲームを止める ----
  const menuEl = $('menu');
  const showMenuPart = (confirmText) => {
    $('menu-main').hidden = !!confirmText;
    $('menu-confirm').hidden = !confirmText;
    $('menu-confirm-text').textContent = confirmText || '';
  };
  const syncMenu = () => {
    $('hint').hidden = !ta;
    const noLives = ta && lives <= 1;
    $('menu-retry').disabled = noLives;
    $('menu-retry').textContent = noLives ? '↺ やり直す（♥ が足りません）' : '↺ やり直す';
    $('menu-auto').hidden = !canAuto;
  };
  const openMenu = () => {
    if (locked || finished || game.done || $('view-play').hidden || anyModalOpen()) return;
    stopAuto();
    clock.wanted = clock.since != null;
    clock.pause();
    clock.held = true;
    syncMenu();
    showMenuPart(null);
    menuEl.hidden = false;
  };
  const closeMenu = () => {
    menuEl.hidden = true;
    clock.held = false;
    if (clock.wanted) clock.start();
    clock.wanted = false;
    last = performance.now();
  };
  $('pause').onclick = () => openMenu();
  $('menu-continue').onclick = () => closeMenu();
  $('menu-retry').onclick = () => showMenuPart(ta
    ? `このステージを最初からやり直しますか？（♥ が 1 つ減って、タイムはステージの最初にもどります）`
    : 'このステージを最初からやり直しますか？');
  $('menu-auto').onclick = () => { closeMenu(); startAuto(); };
  $('auto-stop').onclick = () => stopAuto();
  $('menu-confirm-no').onclick = () => showMenuPart(null);
  $('menu-confirm-yes').onclick = () => {
    closeMenu();
    if (ta) {
      // タイムアタック（仮）：時間切れと同じ扱い。♥ が 1 つ減って、タイムはステージの最初にもどる
      if (lives <= 1) return;
      lives -= 1;
      updateLives();
      retryStage();
      toast(`やり直し のこり ${'♥'.repeat(lives)}`, 900);
    } else {
      game.restartStage();
      resetHint();
      fallMs = 0;
      view.refresh();
      updateHud();
    }
    persist();
  };
  $('menu-quit').onclick = () => {
    // 途中までの記録は今どおり保存して、スタート画面へ（次に同じ絵を選ぶと「続きから」）
    clock.held = false;
    if (!finished && !game.done) persist();
    location.href = './';
  };
  // タイムアタック：十字キーの真ん中の 💡 でヒント（押すと正しい場所が光る。1 回 +3 秒。もう光っているときは数えない）
  $('hint').onclick = () => act(() => {
    if (!ta || view.hint) return;
    view.hint = true;
    $('hint').disabled = true;
    clock.elapsed += TA_HINT_PENALTY_MS;
    toast('ヒント ＋3秒', 700);
    updateTimer();
  });
  // 遊び方：閉じたら ⏸ メニューにもどる
  $('help-open').onclick = async () => {
    menuEl.hidden = true;
    await showHelp('閉じる');
    menuEl.hidden = false;
  };

  // ---- キーボード（矢印・Z / X・スペース） ----
  window.addEventListener('keydown', (e) => {
    if ($('view-play').hidden) return;
    // Esc：⏸ メニューを開く／閉じる
    if (e.key === 'Escape') {
      if (!menuEl.hidden) { e.preventDefault(); if (!$('menu-confirm').hidden) showMenuPart(null); else closeMenu(); }
      else if (!anyModalOpen()) { e.preventDefault(); openMenu(); }
      return;
    }
    if (anyModalOpen()) return;
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
    // 自動で組み立てる（ステージクリアの表示の間は locked なので待つ）
    if (auto) {
      autoMs += dt;
      if (autoMs >= AUTO_MS) { autoMs = 0; autoStep(); }
      return;
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
    showFinish(subject, { pieces: plan.pieces.length, elapsedMs: clock.elapsed, mode, guide, stageTimes: save?.stageTimes || [] },
      { plan, partsData, steps, stages, onAgain: restart });
  } else {
    if (!helpSeen()) await showHelp();
    if (ta) clock.start(); // タイムアタックは、ここから数える
  }
}

// 版の番号を画面のすみに出す。index.html と食い違ったら、古いファイルが残っている
function showVersion() {
  const page = document.documentElement.dataset.version;
  const stale = page !== VERSION;
  const text = stale ? `v${VERSION}（ページは v${page}：古いファイルが残っています。再読み込みしてください）` : `v${VERSION}`;
  for (const el of document.querySelectorAll('.version')) {
    el.textContent = text;
    el.classList.toggle('stale', stale);
  }
}

// スタート画面：CATEGORIES の順にタブを並べ、選んだタブの中身（番号の欄・絵のカード・準備中）だけを出す。
// 最初に開くタブは、URL の #（例：#cnp）→ この画面で前に開いていたタブ → いちばん前のタブ の順に決める
function pictureCard(name, pic) {
  const a = document.createElement('a');
  a.className = 'picture-card';
  a.href = `?pic=${encodeURIComponent(name)}`;
  const img = document.createElement('img');
  img.src = pic.file;
  img.alt = '';
  a.append(img, pic.label);
  return a;
}

function categoryPanel(cat, form, qrOpts) {
  const soon = (note) => {
    const p = document.createElement('p');
    p.className = 'soon';
    p.textContent = '準備中';
    if (!note) return [p];
    const n = document.createElement('p');
    n.className = 'soon-note';
    n.textContent = note;
    return [p, n];
  };
  const sec = document.createElement('section');
  sec.className = `category category-${cat.key}`;
  if (!cat.ready) {
    sec.append(...soon(cat.note));
  } else if (cat.input === 'noun') {
    // 番号を入れて遊ぶ欄はそのまま。その下に 30 体の一覧（タブを開いたときに読み込む）
    const browser = nounBrowser();
    sec.append(form, browser.element);
    sec.onshow = browser.show;
  } else if (cat.input === 'cards') {
    const cards = Object.entries(PICTURES).filter(([, pic]) => pic.category === cat.key).map(([name, pic]) => pictureCard(name, pic));
    if (cards.length) {
      const list = document.createElement('div');
      list.className = 'picture-list';
      list.append(...cards);
      sec.append(list);
    } else {
      sec.append(...soon(cat.note));
    }
  } else if (cat.input === 'url') {
    sec.append(qrPanel(cat, qrOpts));
  } else {
    sec.append(...soon(cat.note));
  }
  return sec;
}

function firstTab() {
  const keys = CATEGORIES.map((c) => c.key);
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (keys.includes(fromHash)) return fromHash;
  let saved = null;
  try { saved = sessionStorage.getItem(TAB_KEY); } catch { /* 覚えられない環境では、いちばん前のタブ */ }
  return keys.includes(saved) ? saved : keys[0];
}

// qr：?qr= がおかしかったとき { message, value, colors }（nanoQR タブを開いて言葉を出す）
function renderCategories(qr = null) {
  const box = $('categories');
  const form = $('noun-form');
  const tabs = document.createElement('div');
  tabs.className = 'category-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '絵の種類');
  const buttons = [];
  const panels = [];
  const select = (key, { focus = false, remember = true } = {}) => {
    CATEGORIES.forEach((cat, i) => {
      const on = cat.key === key;
      buttons[i].setAttribute('aria-selected', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      if (on) panels[i].onshow?.();
      if (on && focus) buttons[i].focus();
    });
    if (!remember) return;
    try { sessionStorage.setItem(TAB_KEY, key); } catch { /* 覚えられなくても切り替えはできる */ }
    history.replaceState(null, '', `${location.pathname}${location.search}#${key}`);
  };
  CATEGORIES.forEach((cat, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'category-tab';
    b.id = `tab-${cat.key}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `panel-${cat.key}`);
    b.textContent = cat.label;
    b.onclick = () => select(cat.key);
    // ← → で隣のタブへ（キーボードで使う人向け）
    b.onkeydown = (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      select(CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length].key, { focus: true });
    };
    const panel = categoryPanel(cat, form, qr || {});
    panel.id = `panel-${cat.key}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', b.id);
    buttons.push(b);
    panels.push(panel);
  });
  tabs.append(...buttons);
  box.replaceChildren(tabs, ...panels);
  select(qr ? 'qr' : firstTab(), { remember: false });
}

function init() {
  showVersion();
  const muteBtn = $('mute');
  const syncMute = () => {
    muteBtn.textContent = sound.isMuted() ? '🔇 音（いまは消音）' : '🔊 音';
    muteBtn.setAttribute('aria-label', sound.isMuted() ? '音を出す' : '消音');
    muteBtn.setAttribute('aria-pressed', String(sound.isMuted()));
  };
  muteBtn.onclick = () => { sound.setMuted(!sound.isMuted()); sound.unlock(); syncMute(); };
  syncMute();

  $('loading-retry').onclick = () => location.reload();

  const subject = subjectFromUrl(location.search);
  if (subject) {
    start(subject);
  } else {
    const params = new URLSearchParams(location.search);
    const problem = qrProblem(location.search);
    renderCategories(problem ? { message: problem, value: params.get('qr'), colors: { dark: params.get('dark'), accent: params.get('accent') } } : null);
    show('start');
  }
}

init();
