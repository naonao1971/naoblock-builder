// nanoQR：URL を QR コードにして、元絵（QR ＋ 白い余白 ＋ 黒い外枠）を作る（純粋関数）。
// QR は src/vendor/qrcode.mjs（qrcode-generator、MIT）で作る。誤り訂正は M、文字は UTF-8 のバイトモード
import qrcode from './vendor/qrcode.mjs';
import { colorById } from './palette.js';

export const QR_MAX_VERSION = 4; // 33×33 まで（40×40 の盤面に外枠・余白ごと入る大きさ）
const CAPACITY_M = [0, 14, 26, 42, 62]; // バージョンごとに入るバイト数（誤り訂正 M・バイトモード）
export const QR_MAX_BYTES = CAPACITY_M[QR_MAX_VERSION];

// 色（パレットの id）。濃いマスと目印の輪は、それぞれの組から選ぶ（入れ替わると読めなくなるので）
export const QR_DARK_CHOICES = ['black', 'dark-gray', 'dark-blue', 'green', 'purple', 'brown', 'red'];
export const QR_ACCENT_CHOICES = ['yellow', 'yellow-orange', 'pastel-blue', 'peach', 'beige', 'light-gray', 'white'];
export const QR_DEFAULT_COLORS = { dark: 'dark-blue', accent: 'yellow' };
const LIGHT = 'white';
const FRAME = 'black';

const toBytes = (text) => new TextEncoder().encode(text);
export const qrByteLength = (text) => toBytes(text).length;

// 入れられる URL：http:// か https:// で始まる URL だけ
export function isQrUrl(text) {
  if (typeof text !== 'string' || !/^https?:\/\/\S+$/i.test(text)) return false;
  try { return Boolean(new URL(text).host); } catch { return false; }
}

// 色の id を確かめる（組にない色は初期の色）
export function qrColors({ dark, accent } = {}) {
  return {
    dark: QR_DARK_CHOICES.includes(dark) ? dark : QR_DEFAULT_COLORS.dark,
    accent: QR_ACCENT_CHOICES.includes(accent) ? accent : QR_DEFAULT_COLORS.accent,
  };
}

// URL → QR のマス目。戻り値：{ version, size, modules: size×size（true＝濃い）, finders: 目印の四角の左上 [x, y] ×3 }
// 入るいちばん小さいバージョンを選ぶ。バージョン 4 に入らなければエラー
export function makeQr(text) {
  const bytes = toBytes(text);
  const version = CAPACITY_M.findIndex((cap, v) => v >= 1 && bytes.length <= cap);
  if (version < 1) throw new Error(`長すぎます（${bytes.length} バイト。${QR_MAX_BYTES} バイトまで）`);
  const qr = qrcode(version, 'M');
  // UTF-8 のバイト列を 1 文字 1 バイトの文字列にして渡す（ライブラリはそのまま 1 バイトずつ使う）
  qr.addData(String.fromCharCode(...bytes), 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const modules = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => qr.isDark(y, x)));
  return { version, size, modules, finders: [[0, 0], [size - 7, 0], [0, size - 7]] };
}

// 元絵：外側から 黒い外枠 1 マス → 白い余白 q マス → QR → 白い余白 q マス → 黒い外枠 1 マス。
// 余白 q ＝ min(4, floor((40 - 2 - N) / 2))。色はパレットの色コードをそのまま入れる（近い色に寄せてもずれない）。
// 目印の四角（7×7）は、外側の輪＝濃い色、その内側の輪＝目印の色、真ん中 3×3＝濃い色。白いマスもブロックで埋める（null なし）
// 戻り値：{ grid, bgHex, version, size, quiet, side }
export function qrPicture(text, colors = {}, board = 40) {
  const { version, size, modules, finders } = makeQr(text);
  const { dark, accent } = qrColors(colors);
  const hex = (id) => colorById(id).hex;
  const quiet = Math.min(4, Math.floor((board - 2 - size) / 2));
  const side = size + quiet * 2 + 2;
  const grid = Array.from({ length: side }, () => new Array(side).fill(hex(LIGHT)));
  for (let i = 0; i < side; i++) {
    grid[0][i] = grid[side - 1][i] = grid[i][0] = grid[i][side - 1] = hex(FRAME);
  }
  const off = 1 + quiet;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    grid[off + y][off + x] = modules[y][x] ? hex(dark) : hex(LIGHT);
  }
  // 目印の四角の内側の輪（1 マス幅）
  for (const [fx, fy] of finders) {
    for (let k = 1; k <= 5; k++) {
      for (const [x, y] of [[fx + k, fy + 1], [fx + k, fy + 5], [fx + 1, fy + k], [fx + 5, fy + k]]) grid[off + y][off + x] = hex(accent);
    }
  }
  return { grid, bgHex: hex(LIGHT), version, size, quiet, side };
}
