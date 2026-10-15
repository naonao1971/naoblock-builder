// スタート画面の nanoQR タブ：URL の入力欄・色の欄・見本
import { colorById } from './palette.js';
import { qrSubject } from './subjects.js';
import { isQrUrl, qrByteLength, qrPicture, QR_MAX_BYTES, QR_DARK_CHOICES, QR_ACCENT_CHOICES, QR_DEFAULT_COLORS } from './qr.js';

const SAMPLE_URL = 'https://naoblock.jp';
const PREVIEW_DOT = 4; // 見本の 1 マスの大きさ（px）

const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...children.filter((c) => c != null));
  return e;
};

function colorSelect(label, choices, value) {
  const select = el('select', {}, ...choices.map((id) => el('option', { value: id, selected: id === value }, colorById(id).name)));
  return { select, field: el('label', { class: 'qr-color' }, label, select) };
}

// message：?qr= がおかしかったときの言葉。value・colors：そのときの入力
export function qrPanel(cat, { message = null, value = '', colors = {} } = {}) {
  const input = el('input', { type: 'url', inputMode: 'url', autocomplete: 'url', placeholder: 'https://', value, name: 'qr', spellcheck: false });
  const button = el('button', { type: 'submit', class: 'primary' }, '組み立てる');
  const count = el('p', { class: 'qr-count', 'aria-live': 'polite' });
  const dark = colorSelect('濃いマス', QR_DARK_CHOICES, QR_DARK_CHOICES.includes(colors.dark) ? colors.dark : QR_DEFAULT_COLORS.dark);
  const accent = colorSelect('目印の輪', QR_ACCENT_CHOICES, QR_ACCENT_CHOICES.includes(colors.accent) ? colors.accent : QR_DEFAULT_COLORS.accent);
  const canvas = el('canvas', { class: 'qr-preview' });
  const caption = el('p', { class: 'qr-caption muted' });
  const form = el('form', { class: 'qr-form' },
    el('label', { class: 'qr-url' }, 'URL', input), button);

  // 入力に合わせて、あと何文字入るか・ボタン・見本を直す
  const update = () => {
    const url = input.value.trim();
    const over = qrByteLength(url) - QR_MAX_BYTES;
    const ok = isQrUrl(url) && over <= 0;
    button.disabled = !ok;
    count.classList.toggle('bad', !!url && !ok);
    if (!url) count.textContent = `${QR_MAX_BYTES} 文字まで入ります（http:// か https:// で始まる URL）`;
    else if (over > 0) count.textContent = `長すぎます。あと ${over} 文字短くしてください（短縮 URL も使えます）`;
    else if (!isQrUrl(url)) count.textContent = 'http:// か https:// で始まる URL を入れてください';
    else count.textContent = `あと ${-over} 文字入ります`;
    const shown = ok ? url : SAMPLE_URL;
    const pic = qrPicture(shown, { dark: dark.select.value, accent: accent.select.value });
    canvas.width = canvas.height = pic.side * PREVIEW_DOT;
    const ctx = canvas.getContext('2d');
    pic.grid.forEach((row, y) => row.forEach((c, x) => { ctx.fillStyle = `#${c}`; ctx.fillRect(x * PREVIEW_DOT, y * PREVIEW_DOT, PREVIEW_DOT, PREVIEW_DOT); }));
    caption.textContent = ok ? `見本：${pic.size}×${pic.size} の QR（外枠と余白つきで ${pic.side}×${pic.side} マス）` : `見本（${SAMPLE_URL} のとき）`;
  };
  input.addEventListener('input', update);
  dark.select.addEventListener('change', update);
  accent.select.addEventListener('change', update);
  form.onsubmit = (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!isQrUrl(url) || qrByteLength(url) > QR_MAX_BYTES) return;
    location.href = qrSubject(url, { dark: dark.select.value, accent: accent.select.value }).url(location.href);
  };
  update();

  return el('div', { class: 'qr-panel' },
    el('p', { class: 'qr-lead' }, cat.note),
    message ? el('p', { class: 'qr-error', role: 'alert' }, message) : null,
    form,
    count,
    el('div', { class: 'qr-colors' }, dark.field, accent.field),
    canvas,
    caption);
}
