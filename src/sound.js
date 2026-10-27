// カチッ音・揺れ音・ステップ完了音（Web Audio で鳴らす。音声ファイルは置かない）

const MUTE_KEY = 'naoblock:muted';

let ctx = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 保存できない環境では毎回鳴らす設定から */ }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// タップのたびに呼ぶ（iOS はユーザー操作の中で鳴らし始める必要がある）
export function unlock() {
  if (!muted) audio();
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* 無視 */ }
}

function noiseBurst(ac, t, { duration, freq, q, gain }) {
  const len = Math.ceil(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
}

function tone(ac, t, { freq, duration, gain, type = 'sine' }) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// パーツがはまる「カチッ」
export function click() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  noiseBurst(ac, t, { duration: 0.025, freq: 3200, q: 1.2, gain: 0.9 });
  tone(ac, t, { freq: 1900, duration: 0.03, gain: 0.08, type: 'square' });
  noiseBurst(ac, t + 0.028, { duration: 0.02, freq: 2200, q: 1.5, gain: 0.5 });
}

// 違う場所をタップしたとき（控えめ）
export function nope() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  tone(ac, ac.currentTime, { freq: 180, duration: 0.09, gain: 0.08, type: 'triangle' });
}

// ステップ完了
export function stepDone() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [784, 1047].forEach((f, i) => tone(ac, t + i * 0.08, { freq: f, duration: 0.18, gain: 0.12 }));
}

// 全部完成
export function complete() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(ac, t + i * 0.1, { freq: f, duration: 0.35, gain: 0.12 }));
}

// コンボが続くと、カチッに重ねて鳴らす音。回数が増えるほど高くなる（3D版と同じ上がり方）
export function combo(n) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const f = 520 * Math.pow(2, Math.min(n - 1, 12) / 12);
  tone(ac, ac.currentTime, { freq: f, duration: 0.12, gain: 0.1, type: 'triangle' });
}

// 飛んでくる ♥ を取ったとき
export function heart() {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [880, 1175, 1568].forEach((f, i) => tone(ac, t + i * 0.07, { freq: f, duration: 0.2, gain: 0.12, type: 'triangle' }));
}
