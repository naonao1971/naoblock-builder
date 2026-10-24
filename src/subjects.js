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
//   pdfName：組立図の PDF を保存するときの名前
import { fetchSeed, fetchImageData, nounPicture } from './nouns.js';
import { loadPictureGrid } from './picture.js';
import { shareText, shareTextFor, appUrl, pageUrl } from './finish.js';
import { isQrUrl, qrByteLength, qrColors, qrPicture, QR_MAX_BYTES, QR_DEFAULT_COLORS } from './qr.js';

// スタート画面のカテゴリー（この順に並べる）
//   input：'noun'（番号を入れる）| 'cards'（カードから選ぶ）| 'url'（URL を入れる）
//   ready：false なら「準備中」と出すだけ（note があれば一言そえる）。
//   カードのカテゴリーで絵が 1 つもないときも「準備中」
//   until：期間限定のカテゴリー。この日（日本時間）が終わったら、タブを出さない（絵の URL はそのまま遊べる）
export const CATEGORIES = [
  { key: 'halloween', label: '🎃ハロウィン', input: 'cards', ready: true, until: '2026-10-31' },
  { key: 'nouns', label: 'Nouns', input: 'noun', ready: true },
  { key: 'ninja', label: 'クリプト忍者', input: 'cards', ready: true },
  { key: 'cnp', label: 'CNP', input: 'cards', ready: true },
  { key: 'qr', label: 'nanoQR', input: 'url', ready: true, note: 'あなたのサイトへの入口を、ナノブロックで作ろう' },
];

// 絵の一覧（URL に出る名前 → 画像・画面に出す名前・カテゴリー）。
// 絵を足すときは、画像を data/samples/ に置いて、ここに 1 行足すだけ（スタート画面のカードも自動でできる）。
// category は CATEGORIES の input: 'cards' のどれか。カテゴリーは URL・保存・ランキングには入らない
export const PICTURES = {
  // ハロウィンウィーク（10/31 まで）。from の日から 1 体ずつカードが出る
  'halloween-obake': { file: 'data/samples/halloween-obake.png', label: 'おばけとかぼちゃ', category: 'halloween', from: '2026-10-25' },
  'chibi-sakuya': { file: 'data/samples/chibi-sakuya.png', label: 'チビ咲耶', category: 'ninja' },
  // クリプト忍者（NinjaDAO 公式サイトのキャラクター一覧と同じ並び・名前）。背景は透明、ナノブロックの色だけで描いた 40 マスのドット絵
  'ninja-jin': { file: 'data/samples/ninja-jin.png', label: '刃', category: 'ninja' },
  'ninja-sakuya': { file: 'data/samples/ninja-sakuya.png', label: '咲耶', category: 'ninja' },
  'ninja-kohaku': { file: 'data/samples/ninja-kohaku.png', label: '狐白', category: 'ninja' },
  'ninja-shiba': { file: 'data/samples/ninja-shiba.png', label: '柴', category: 'ninja' },
  'ninja-kanaoni': { file: 'data/samples/ninja-kanaoni.png', label: '金鬼', category: 'ninja' },
  'ninja-oto': { file: 'data/samples/ninja-oto.png', label: '於兎', category: 'ninja' },
  'ninja-rotten': { file: 'data/samples/ninja-rotten.png', label: '呂屯', category: 'ninja' },
  'ninja-nagisa': { file: 'data/samples/ninja-nagisa.png', label: '凪紗', category: 'ninja' },
  'ninja-anne': { file: 'data/samples/ninja-anne.png', label: '餡音', category: 'ninja' },
  'ninja-dan': { file: 'data/samples/ninja-dan.png', label: '断', category: 'ninja' },
  'ninja-hinano-joh': { file: 'data/samples/ninja-hinano-joh.png', label: '雛之丞', category: 'ninja' },
  'ninja-torika': { file: 'data/samples/ninja-torika.png', label: '酉花', category: 'ninja' },
  'ninja-atoza': { file: 'data/samples/ninja-atoza.png', label: 'アトザ', category: 'ninja' },
  'ninja-hayate': { file: 'data/samples/ninja-hayate.png', label: 'ハヤテ', category: 'ninja' },
  'ninja-uka': { file: 'data/samples/ninja-uka.png', label: '宇迦', category: 'ninja' },
  'ninja-ganzi': { file: 'data/samples/ninja-ganzi.png', label: '岩爺', category: 'ninja' },
  'ninja-yui': { file: 'data/samples/ninja-yui.png', label: '結', category: 'ninja' },
  'ninja-futa': { file: 'data/samples/ninja-futa.png', label: '風太', category: 'ninja' },
  'ninja-rei': { file: 'data/samples/ninja-rei.png', label: '令', category: 'ninja' },
  'ninja-sattva': { file: 'data/samples/ninja-sattva.png', label: 'サットヴァ', category: 'ninja' },
  'ninja-nekomata': { file: 'data/samples/ninja-nekomata.png', label: '猫又', category: 'ninja' },
  'ninja-janome': { file: 'data/samples/ninja-janome.png', label: '蛇ノ目', category: 'ninja' },
  'ninja-benten': { file: 'data/samples/ninja-benten.png', label: '弁天', category: 'ninja' },
  'ninja-karma': { file: 'data/samples/ninja-karma.png', label: 'カルマ', category: 'ninja' },
  'ninja-ichiya': { file: 'data/samples/ninja-ichiya.png', label: 'イチヤ', category: 'ninja' },
  'ninja-nemu': { file: 'data/samples/ninja-nemu.png', label: 'ネム', category: 'ninja' },
  'ninja-karura': { file: 'data/samples/ninja-karura.png', label: 'カルラ', category: 'ninja' },
  'ninja-xiaolan': { file: 'data/samples/ninja-xiaolan.png', label: 'シャオラン', category: 'ninja' },
  'ninja-aum': { file: 'data/samples/ninja-aum.png', label: 'アウン', category: 'ninja' },
  'ninja-konga': { file: 'data/samples/ninja-konga.png', label: 'コンガ', category: 'ninja' },
  'ninja-shion': { file: 'data/samples/ninja-shion.png', label: '紫苑', category: 'ninja' },
  'ninja-seori': { file: 'data/samples/ninja-seori.png', label: '瀬織', category: 'ninja' },
  'ninja-quon': { file: 'data/samples/ninja-quon.png', label: '久遠', category: 'ninja' },
  'ninja-magoichi': { file: 'data/samples/ninja-magoichi.png', label: '孫市', category: 'ninja' },
  'ninja-ibuki': { file: 'data/samples/ninja-ibuki.png', label: 'イブキ', category: 'ninja' },
  'ninja-oen': { file: 'data/samples/ninja-oen.png', label: 'おえん', category: 'ninja' },
  'ninja-izuna': { file: 'data/samples/ninja-izuna.png', label: 'イズナ', category: 'ninja' },
  'ninja-sekishusai': { file: 'data/samples/ninja-sekishusai.png', label: '石舟斎', category: 'ninja' },
  'ninja-sasagane': { file: 'data/samples/ninja-sasagane.png', label: 'ササガネ', category: 'ninja' },
  // CNP（咲耶ゲームの CNP_DEFS と同じ並び・名前）。背景は透明、ナノブロックの色だけで描いた 40 マスのドット絵
  'cnp-leelee': { file: 'data/samples/cnp-leelee.png', label: 'リーリー', category: 'cnp' },
  'cnp-mitama': { file: 'data/samples/cnp-mitama.png', label: 'ミタマ', category: 'cnp' },
  'cnp-narukami': { file: 'data/samples/cnp-narukami.png', label: 'ナルカミ', category: 'cnp' },
  'cnp-orochi': { file: 'data/samples/cnp-orochi.png', label: 'オロチ', category: 'cnp' },
  'cnp-luna': { file: 'data/samples/cnp-luna.png', label: 'ルナ', category: 'cnp' },
  'cnp-yama': { file: 'data/samples/cnp-yama.png', label: 'ヤマ', category: 'cnp' },
  'cnp-makami': { file: 'data/samples/cnp-makami.png', label: 'マカミ', category: 'cnp' },
  'cnp-towa': { file: 'data/samples/cnp-towa.png', label: 'トワ', category: 'cnp' },
  'cnp-setsuna': { file: 'data/samples/cnp-setsuna.png', label: 'セツナ', category: 'cnp' },
  'cnp-ema': { file: 'data/samples/cnp-ema.png', label: 'エマ', category: 'cnp' },
  'cnp-taruto': { file: 'data/samples/cnp-taruto.png', label: 'タルト', category: 'cnp' },
};
// 今日の日付（日本時間の 'YYYY-MM-DD'）
export const todayJst = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
// スタート画面に出すカテゴリー（期間限定は until の日まで）
export const shownCategories = (today = todayJst()) => CATEGORIES.filter((c) => !c.until || today <= c.until);
// スタート画面に出す絵（from があれば、その日から。1 日 1 体ずつ増やすため）
export const isPictureShown = (pic, today = todayJst()) => !pic.from || pic.from <= today;
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
      // あとから足されたパーツの Noun は noun.pics から（src/nouns.js の nounPicture）
      const [seed, imageData] = await Promise.all([fetchSeed(id), fetchImageData()]);
      return nounPicture(id, seed, imageData);
    },
    originalNote: '元絵：Nouns の本来の色と背景色',
    shareText: (r) => shareText(id, r.pieces, r.elapsedMs, r.mode, r.guide),
    url: (href) => appUrl(id, href),
    fileName: `naoblock-noun${id}.png`,
    pdfName: `Noun_${id}_naoblock.pdf`,
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
    pdfName: `${name}_naoblock.pdf`,
  };
}

// URL（location.search）から題材を作る。当てはまらなければ null（スタート画面）
// ?pic=<名前>、?sample=<名前>（PR #16 の確認用 URL のため残す）、?noun=<番号>。古い名前（1）は今の名前に読み替える
// nanoQR：入れた URL を QR コードにして元絵にする（src/qr.js）。
// 保存・ランキングの名前に色は入れない（同じ URL なら同じ記録）。シェアの文面には入れた URL を出す
export function qrSubject(url, colors = {}) {
  const c = qrColors(colors);
  return {
    kind: 'qr',
    id: url,
    label: 'nanoQR',
    scope: 'この QR',
    colors: c,
    load: async () => qrPicture(url, c),
    originalNote: '元絵：QR コード（外枠と余白つき）',
    shareText: (r) => `${shareTextFor('nanoQR', '#naoblock', r.pieces, r.elapsedMs, r.mode, r.guide)}\nこのQRの行き先：${url}`,
    url: (href) => {
      const u = new URL(pageUrl(href, 'qr', url));
      if (c.dark !== QR_DEFAULT_COLORS.dark || c.accent !== QR_DEFAULT_COLORS.accent) {
        u.searchParams.set('dark', c.dark);
        u.searchParams.set('accent', c.accent);
      }
      return u.toString();
    },
    fileName: 'naoblock-qr.png',
    pdfName: 'nanoQR_naoblock.pdf',
  };
}

// ?qr= の URL がおかしいとき、スタート画面に出す言葉（問題なければ null）
export function qrProblem(search) {
  const url = new URLSearchParams(search).get('qr');
  if (url == null) return null;
  if (!isQrUrl(url)) return 'QR にできるのは http:// か https:// で始まる URL だけです。';
  const over = qrByteLength(url) - QR_MAX_BYTES;
  if (over > 0) return `URL が長すぎます。あと ${over} 文字短くしてください（短縮 URL も使えます）。`;
  return null;
}

export function subjectFromUrl(search) {
  const params = new URLSearchParams(search);
  if (params.get('qr') != null) {
    return qrProblem(search) ? null : qrSubject(params.get('qr'), { dark: params.get('dark'), accent: params.get('accent') });
  }
  const pic = params.get('pic') ?? params.get('sample');
  if (pic != null) return pictureSubject(pic);
  const n = params.get('noun');
  if (n != null && /^\d+$/.test(n)) return nounSubject(n);
  return null;
}

// 途中保存の名前。Nouns は今までと同じ naoblock:game:v1:noun:<番号>:<モード>
export const saveKey = (subject, slot) => `naoblock:game:v1:${subject.kind}:${subject.id}:${slot}`;
