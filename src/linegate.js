// LINE友だち限定アーカイブ（LIFF でログイン → 公式LINE「ナオブロックラボ」の友だちか確かめる。ブラウザ内だけの判定）
// 期間が終わったカテゴリーの絵と、line: true の印を付けた絵・カテゴリー（nanoQR など）をここに出す。
// ?pic= ?qr= の直リンクからは今までどおり誰でも遊べる（簡易版。本格的に守るならサーバー側の判定が要る）
import { PICTURES, archivedCategories, isLinePicture, isPictureShown, lineTools } from './subjects.js';

const LIFF_ID = '2012312496-a5j3Y0Qb'; // LINE Developers の「naoblock 2D アーカイブ」（3D 版とは別の LIFF アプリ）
const LINE_ADD = 'https://line.me/R/ti/p/@134wkonl';
const RETURN_KEY = 'nbArchive'; // LINE ログインから戻ってきたら、アーカイブを開き直す

// 出すものが 1 つもなければ null（ボタンも出さない）
// toolPanel(cat)：nanoQR など絵でないカテゴリーの中身（タブのときと同じもの）
export function lineArchive(pictureCard, toolPanel, onOpen) {
  const tools = lineTools();
  const archived = archivedCategories();
  const seasons = archived.map((cat) => ({ cat, pics: Object.entries(PICTURES).filter(([, pic]) => pic.category === cat.key) })).filter((s) => s.pics.length);
  const lineOnly = Object.entries(PICTURES).filter(([, pic]) => isLinePicture(pic) && isPictureShown(pic) && !archived.some((c) => c.key === pic.category));
  const count = lineOnly.length + seasons.reduce((n, s) => n + s.pics.length, 0);
  if (!count && !tools.length) return null;
  // ログイン前の案内に出す「何が遊べるか」
  const what = [...tools.map((c) => c.label), ...(lineOnly.length ? ['限定の絵'] : []), ...(seasons.length ? ['期間が終わった絵'] : [])].join('と、');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'archive-btn';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = lineOnly.length || tools.length ? '🔒 LINE友だち限定 ' : '🔒 LINE友だち限定アーカイブ ';
  const small = document.createElement('small');
  small.textContent = `（${[...tools.map((c) => c.label), ...(count ? [`${count}枚`] : [])].join('・')}）`;
  button.append(small);
  const panel = document.createElement('section');
  panel.className = 'archive';
  panel.hidden = true;

  const gate = (html) => {
    panel.innerHTML = `<div class="archive-gate">${html}<p class="note">ログインで受け取るのは、友だちかどうかの確認に使う LINE の情報だけです。<a href="privacy.html">プライバシーポリシー</a></p></div>`;
  };
  const list = (title, pics) => {
    const h = document.createElement('h3');
    h.className = 'season';
    h.textContent = title;
    const box = document.createElement('div');
    box.className = 'picture-list';
    box.append(...pics.map(([name, pic]) => pictureCard(name, pic)));
    return [h, box];
  };
  const showArchive = () => {
    panel.replaceChildren(
      ...tools.flatMap((cat) => {
        const h = document.createElement('h3');
        h.className = 'season';
        h.textContent = `🎁 ${cat.label}`;
        return [h, toolPanel(cat)];
      }),
      ...(lineOnly.length ? list('🎁 友だち限定', lineOnly) : []),
      ...seasons.flatMap((s) => list(`${s.cat.label} ${s.cat.until.slice(0, 4)}`, s.pics)),
    );
    const p = document.createElement('p');
    p.className = 'note archive-login';
    p.textContent = 'LINE でログイン中です。';
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'logout';
    out.textContent = 'ログアウト';
    out.onclick = () => { liff.logout(); open(); };
    p.append(out);
    panel.append(p);
  };

  let ready = null;
  const loadLiff = () => ready ||= new Promise((ok, ng) => {
    const s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = () => liff.init({ liffId: LIFF_ID }).then(ok, ng);
    s.onerror = ng;
    document.head.append(s);
  });

  const open = async () => {
    onOpen();
    button.setAttribute('aria-pressed', 'true');
    panel.hidden = false;
    gate('<p>LINE を確かめています…</p>');
    try {
      await loadLiff(); // ログインから戻ったときの ?code= は liff.init が読むので、URL はそのあとで整える
      history.replaceState(null, '', `${location.pathname}#archive`);
      if (!liff.isLoggedIn()) {
        gate(`<p><b>${what}は、公式LINE「ナオブロックラボ」の友だち限定で遊べます。</b></p><p>LINE でログインすると、そのまま友だち追加もできます。</p>
          <div><button type="button" class="line-btn" id="liff-login">LINE でログインして開く</button></div>`);
        panel.querySelector('#liff-login').onclick = () => {
          try { sessionStorage.setItem(RETURN_KEY, '1'); } catch { /* 戻ったら #archive で開き直す */ }
          liff.login({ redirectUri: `${location.origin}${location.pathname}#archive` });
        };
        return;
      }
      const { friendFlag } = await liff.getFriendship();
      if (friendFlag) return showArchive();
      gate(`<p><b>あと一歩です！</b></p><p>公式LINE「ナオブロックラボ」を友だち追加すると、遊べるようになります。</p>
        <div><a class="line-btn" href="${LINE_ADD}" target="_blank" rel="noopener">友だち追加する</a><button type="button" class="line-btn sub" id="liff-recheck">追加したので確かめる</button></div>`);
      panel.querySelector('#liff-recheck').onclick = open;
    } catch (err) {
      console.error(err);
      gate('<p>LINE とつながりませんでした。時間をおいて、もう一度ためしてください。</p><div><button type="button" class="line-btn sub" id="liff-retry">もう一度</button></div>');
      panel.querySelector('#liff-retry').onclick = () => { ready = null; open(); };
    }
  };
  button.onclick = open;

  const close = () => {
    button.setAttribute('aria-pressed', 'false');
    panel.hidden = true;
  };
  // #archive で来たとき・LINE ログインから戻ってきたとき（?liff.state つきもある）・遊んで戻ってきたとき（remembered）は、開いた状態で始める
  // 前に配った #qr のようなリンクも、ここを開く
  const openIfReturning = (remembered = false) => {
    let back = remembered;
    try { back ||= !!sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY); } catch { /* なくても #archive で分かる */ }
    if (back || location.hash === '#archive' || tools.some((c) => location.hash === `#${c.key}`) || new URLSearchParams(location.search).has('liff.state')) open();
  };
  return { button, panel, open, close, openIfReturning };
}
