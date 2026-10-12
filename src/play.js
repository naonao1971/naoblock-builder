// 遊びの進行（次のパーツ、正誤、自動で置く、時間計測、途中保存）
import { pieceOrder } from './steps.js';
import * as sound from './sound.js';

const AUTO_INTERVAL_MS = 130;
const STEP_PAUSE_MS = 900;

const storageKey = (id) => `naoblock:v1:noun:${id}`;

// パーツ割りが変わったら古い保存は使わない
function signature(pieces) {
  const s = JSON.stringify(pieces.map((p) => [p.x, p.y, p.w, p.h, p.color, p.missing ?? '']));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

export function loadSave(id, pieces) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (save.sig !== signature(pieces) || !(save.placed >= 0 && save.placed <= pieces.length)) return null;
    return save;
  } catch {
    return null;
  }
}

export function clearSave(id) {
  try { localStorage.removeItem(storageKey(id)); } catch { /* 無視 */ }
}

export class Play {
  // hooks: { onChange(info), onStepDone(stepIndex), onComplete({ pieces, elapsedMs }) }
  constructor({ id, pieces, steps, board, hooks, save = null }) {
    this.id = id;
    this.pieces = pieces;
    this.steps = steps;
    this.board = board;
    this.hooks = hooks;
    this.order = pieceOrder(steps);
    this.sig = signature(pieces);

    // order の何番目までが置いてあるか、各番目が何ステップ目か
    this.stepAt = steps.flatMap((s, si) => s.pieces.map(() => si));
    this.stepEnd = [];
    let n = 0;
    for (const s of steps) { n += s.pieces.length; this.stepEnd.push(n); }

    this.placed = save ? save.placed : 0;
    this.elapsedMs = save ? save.elapsedMs || 0 : 0;
    this.runningSince = null;
    this.auto = null;
    this.pausedUntil = 0;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.pauseClock(); this.save(); }
    });
    window.addEventListener('pagehide', () => { this.pauseClock(); this.save(); });

    this.board.setPlaced(this.order.slice(0, this.placed));
    this.refresh(false);
  }

  get total() { return this.order.length; }
  get done() { return this.placed >= this.total; }
  get stepIndex() { return this.done ? this.steps.length - 1 : this.stepAt[this.placed]; }

  // ---- 時間 ----

  startClock() {
    if (this.runningSince == null && !this.done) this.runningSince = performance.now();
  }

  pauseClock() {
    if (this.runningSince != null) {
      this.elapsedMs += performance.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  get time() {
    return this.elapsedMs + (this.runningSince != null ? performance.now() - this.runningSince : 0);
  }

  save() {
    try {
      localStorage.setItem(storageKey(this.id), JSON.stringify({
        v: 1, sig: this.sig, placed: this.placed, elapsedMs: Math.round(this.time), savedAt: Date.now(),
      }));
    } catch { /* 保存できない環境では途中保存なし */ }
  }

  // ---- 進行 ----

  info() {
    const si = this.stepIndex;
    const step = this.steps[si];
    const current = this.done ? null : this.order[this.placed];
    return {
      stepIndex: si,
      stepCount: this.steps.length,
      step,
      current,
      currentPiece: current == null ? null : this.pieces[current],
      remainingInStep: this.done ? 0 : this.stepEnd[si] - this.placed,
      placed: this.placed,
      total: this.total,
      auto: this.auto != null,
      done: this.done,
    };
  }

  refresh(scroll = true) {
    const info = this.info();
    if (this.done || performance.now() < this.pausedUntil) {
      this.board.setGuide(null, []);
    } else {
      const end = this.stepEnd[info.stepIndex];
      this.board.setGuide(info.current, this.order.slice(this.placed + 1, end));
      if (scroll) this.board.ensureVisible(info.current);
    }
    this.hooks.onChange?.(info);
  }

  placeNext() {
    const index = this.order[this.placed];
    const stepBefore = this.stepAt[this.placed];
    this.placed++;
    this.board.drop(index, () => sound.click());
    const stepFinished = this.placed === this.stepEnd[stepBefore];

    if (this.done) {
      this.pauseClock();
      this.stopAuto(false);
      this.save();
      this.refresh(false);
      setTimeout(() => {
        sound.complete();
        this.hooks.onComplete?.({ pieces: this.total, elapsedMs: this.elapsedMs });
      }, 300);
      return;
    }
    this.save();
    if (stepFinished) {
      this.stopAuto(false);
      this.pausedUntil = performance.now() + STEP_PAUSE_MS;
      setTimeout(() => sound.stepDone(), 120);
      this.hooks.onStepDone?.(stepBefore);
      setTimeout(() => this.refresh(), STEP_PAUSE_MS);
    }
    this.refresh();
  }

  // 盤面のタップ（cx, cy はマス）
  tap(cx, cy) {
    sound.unlock();
    if (this.auto) { this.stopAuto(); return; } // 自動中のタップは止めるだけ
    if (this.done || performance.now() < this.pausedUntil) return;
    if (this.board.hits(this.order[this.placed], cx, cy)) {
      this.startClock();
      this.placeNext();
    } else {
      this.board.shake();
      sound.nope();
    }
  }

  // このステップの残りを 1 個ずつ自動で置く
  startAuto() {
    sound.unlock();
    if (this.auto || this.done || performance.now() < this.pausedUntil) return;
    this.startClock();
    this.placeNext();
    if (this.done || performance.now() < this.pausedUntil) return; // 1 個でステップが終わった
    this.auto = setInterval(() => this.placeNext(), AUTO_INTERVAL_MS);
    this.refresh();
  }

  stopAuto(notify = true) {
    if (!this.auto) return;
    clearInterval(this.auto);
    this.auto = null;
    if (notify) this.refresh(false);
  }

  restart() {
    this.stopAuto(false);
    this.placed = 0;
    this.elapsedMs = 0;
    this.runningSince = null;
    this.pausedUntil = 0;
    clearSave(this.id);
    this.board.setPlaced([]);
    this.refresh();
  }
}
