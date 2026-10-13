// 題材（subject）：遊ぶ絵 1 つ分。絵の種類ごとの違いはここだけに置き、
// 遊ぶ画面・完成画面・印刷・ランキング・途中保存は題材が持っている情報だけを使う
//   kind：'noun' | 'picture'（保存・ランキングの名前に入る）
//   id：kind の中での名前（Nouns は番号、ドット絵はファイルの名前）
//   label：画面に出す名前
//   scope：ランキングの見出しに出す「この Noun」「この絵」
//   load()：{ grid: 40×40 以下の色（色コード or null）, bgHex }
//   originalNote：「元絵」タブの説明
//   shareText(r)：X のシェア文面（r = { pieces, elapsedMs, mode, guide }）
//   url(href)：この題材を開く URL
//   fileName：完成画像を保存するときの名前
import { fetchSeed, fetchImageData, decodeNoun } from './nouns.js';
import { loadPictureGrid } from './picture.js';
import { shareText, shareTextFor, appUrl, pageUrl } from './finish.js';

// ドット絵の一覧（URL に出る名前 → 画像と画面に出す名前）。
// 絵を足すときは、画像を data/samples/ に置いて、ここに 1 行足すだけ（スタート画面のボタンも自動でできる）
export const PICTURES = {
  'chibi-sakuya': { file: 'data/samples/chibi-sakuya.png', label: 'チビ咲耶' },
};
// 古い URL の名前 → 今の名前（?pic=1・?sample=1 のため）
const PICTURE_ALIASES = { 1: 'chibi-sakuya' };

export function nounSubject(n) {
  const id = String(Number(n));
  return {
    kind: 'noun',
    id,
    label: `Noun ${id}`,
    scope: 'この Noun',
    async load() {
      const [seed, imageData] = await Promise.all([fetchSeed(id), fetchImageData()]);
      return { grid: decodeNoun(seed, imageData), bgHex: imageData.bgcolors[seed.background] ?? imageData.bgcolors[0] };
    },
    originalNote: '元絵：Nouns の本来の色と背景色',
    shareText: (r) => shareText(id, r.pieces, r.elapsedMs, r.mode, r.guide),
    url: (href) => appUrl(id, href),
    fileName: `naoblock-noun${id}.png`,
  };
}

// ドット絵：40×40 いっぱいに縮める
export function pictureSubject(given) {
  const name = Object.hasOwn(PICTURES, given) ? given : Object.hasOwn(PICTURE_ALIASES, given) ? PICTURE_ALIASES[given] : null;
  const pic = name && PICTURES[name];
  if (!pic) return null;
  return {
    kind: 'picture',
    id: String(name),
    label: pic.label,
    scope: 'この絵',
    load: () => loadPictureGrid(pic.file),
    originalNote: '元絵：ドット絵の色（40×40 に縮めたもの）',
    shareText: (r) => shareTextFor(pic.label, '#naoblock', r.pieces, r.elapsedMs, r.mode, r.guide),
    url: (href) => pageUrl(href, 'pic', name),
    fileName: `naoblock-pic-${name}.png`,
  };
}

// URL（location.search）から題材を作る。当てはまらなければ null（スタート画面）
// ?pic=<名前>、?sample=<名前>（PR #16 の確認用 URL のため残す）、?noun=<番号>。古い名前（1）は今の名前に読み替える
export function subjectFromUrl(search) {
  const params = new URLSearchParams(search);
  const pic = params.get('pic') ?? params.get('sample');
  if (pic != null) return pictureSubject(pic);
  const n = params.get('noun');
  if (n != null && /^\d+$/.test(n)) return nounSubject(n);
  return null;
}

// 途中保存の名前。Nouns は今までと同じ naoblock:game:v1:noun:<番号>:<モード>
export const saveKey = (subject, slot) => `naoblock:game:v1:${subject.kind}:${subject.id}:${slot}`;
