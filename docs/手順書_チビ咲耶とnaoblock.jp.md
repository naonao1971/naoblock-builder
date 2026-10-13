# naoblock builder 手順書（チビ咲耶を正式な絵に／naoblock.jp からつなぐ準備）

スマホのちーちゃん（実装）へ。MacBook のちーちゃん（検証）が下の「検証チェックリスト」で確かめるので、その前提で作ってください。
なおなおと 2026-10-14 に決めた内容です。決定事項は勝手に変えず、迷ったらなおなおに聞いてください。「（仮）」と書いたものは、なおなおに確認してから決めます。

※ 前の手順書 `docs/手順書_絵の入口.md`（PR #18 でマージ済み、v18）の続き。遊び方・部品割りは変えません。

## 1. 作るもの

PR を 2 本に分ける。

| PR | 中身 |
|---|---|
| A | **チビ咲耶を正式な絵にする**。「ドット絵 1」を「チビ咲耶」にして、スタート画面に絵を選ぶ欄を作る。絵を足すときは「画像を置いて一覧に 1 行足すだけ」で済む形にする |
| B | **naoblock.jp からつなぐ準備**。シェアしたときのカード画像（OGP）と、naoblock.jp へ戻るリンク |

ほかの咲耶 GAMES と同じく、最後は `<名前>.naoblock.jp` で公開して、naoblock.jp のゲーム一覧にカードを並べる。ドメインの付け替えと naoblock.jp 側のカード追加は、この手順書ではやらない（8 章）。

## 2. 決定事項（変えない）

| 項目 | 決定 |
|---|---|
| チビ咲耶の絵 | 今の `data/samples/1.png` をそのまま使う（中身は変えない） |
| 絵の名前 | **チビ咲耶** |
| URL | `?pic=chibi-sakuya`。今までの `?pic=1`・`?sample=1` も開ける（チビ咲耶になる） |
| シェア | 「チビ咲耶 をナオブロックで組み立てた！ …」。ハッシュタグは **#naoblock だけ**（前の手順書のまま） |
| 絵を足すとき | **画像ファイルを置いて、一覧に 1 行足すだけ**。ほかのファイルは触らずに済むこと |
| URL・パス | 今のまま**相対パスだけ**を使う（`/` から始まるパスや `github.io` を書かない）。どのドメインに置いても動くように |
| 3D | やらない（後回しのまま） |

## 3. PR A：チビ咲耶を正式な絵にする

### 3-1. ファイルと一覧

- `data/samples/1.png` を `data/samples/chibi-sakuya.png` に名前を変える（`git mv`。中身は同じ）
- `src/subjects.js` の `PICTURES` を、名前（URL に出る英数字）→ `{ file, label }` にする：
  ```js
  export const PICTURES = {
    'chibi-sakuya': { file: 'data/samples/chibi-sakuya.png', label: 'チビ咲耶' },
  };
  // 古い URL の名前 → 今の名前（?pic=1・?sample=1 のため）
  const PICTURE_ALIASES = { 1: 'chibi-sakuya' };
  ```
- `pictureSubject(name)` は、古い名前が来たら今の名前に読み替えてから作る。`id`・保存・ランキング・シェアの URL は**今の名前**（`chibi-sakuya`）を使う
- 今日（10/14）の確認で `picture:1` に入った保存・ランキングは引き継がなくてよい（なおなおと検証用だけなので）

### 3-2. スタート画面に「絵をえらぶ」欄

- 今の「ドット絵で遊ぶ」リンク 1 本を、**`PICTURES` から自動で作る絵のボタンの並び**に置き換える
  - 見出し：「ドット絵で遊ぶ」
  - ボタン 1 つ：絵の小さな画像（元の画像をそのまま縮めたもの）＋名前（「チビ咲耶」）。押すと `?pic=<名前>`
  - 1 列に並べて、増えたら折り返す。今は 1 つだけ
- Nouns の番号を入れる欄は今のまま上に残す
- 説明文（`.lead`）を、Nouns だけでなくドット絵でも遊べることが分かる文にする（例：「Nouns の番号を入れるか、ドット絵をえらぶと、40×40 のブロックパズルで遊べます。…」）

### 3-3. 検算

- `tools/check.mjs --subjects` の題材の検算を、チビ咲耶に合わせて直す：
  - `?pic=chibi-sakuya`・`?pic=1`・`?sample=1` → どれも `picture:chibi-sakuya`「チビ咲耶」
  - 保存の名前 `naoblock:game:v1:picture:chibi-sakuya:practice`、シェアの URL は `?pic=chibi-sakuya`
- **`PICTURES` の全部の絵について、ファイルが実際にあるか**を確かめる検算を足す（ネットなしで動く）

## 4. PR B：naoblock.jp からつなぐ準備

### 4-1. シェアしたときのカード（OGP）

naoblock.jp のゲーム一覧は、各ゲームの `ogp.png`（1200×630）をカードの画像に使っている（例：`https://rally.naoblock.jp/ogp.png`）。同じ形にそろえる。

- `ogp.png`（1200×630）をリポジトリの**いちばん上**に置く
  - 中身（仮）：左に Nouns の完成図、右にチビ咲耶の完成図（どちらもブロックの色に置き換えた絵）＋「ナオブロック」の文字。作り方は任せる（アプリの描画を使って書き出してもよい）
- `index.html` の `<head>` に、ほかの咲耶 GAMES と同じ項目をそろえる：`description`、`og:title`、`og:description`、`og:image`、`og:url`、`twitter:card`（`summary_large_image`）
  - `og:image`・`og:url` は**公開する URL が決まるまで（仮）で今の GitHub Pages の URL**にしておき、コメントで「ドメインが決まったら差し替え」と書く。ここだけは絶対 URL でよい
- `<title>` は今のまま「ナオブロック（naoblock）」

### 4-2. naoblock.jp へ戻るリンク

- スタート画面と完成画面のいちばん下（今の注意書きの近く）に「**naoblock.jp へ**」のリンクを置く（`https://naoblock.jp/`）
- 遊ぶ画面には置かない（遊んでいる途中で押してしまわないように）

### 4-3. favicon

- 今は空（`data:,`）。naoblock.jp と同じアイコンがあればそれを使う。なければこの PR では空のままでよい

## 5. 進め方

- A → B の順に PR を出す。版の番号はいつもどおり上げる（PR の番号）
- 各 PR の説明に貼るもの：確認用 URL（コミット指定の raw.githack：`?noun=11`、`?pic=chibi-sakuya`、`?pic=1`、スタート画面）と、`node tools/check.mjs --subjects` の出力
- B は `ogp.png` の画像も PR の説明に貼る

## 6. 検証チェックリスト（MacBook のちーちゃんがやる）

### PR A

- [ ] スタート画面に「ドット絵で遊ぶ」とチビ咲耶のボタンが出る。押すとチビ咲耶で遊べる
- [ ] `?pic=chibi-sakuya`・`?pic=1`・`?sample=1` がどれも「チビ咲耶」で、同じ絵
- [ ] チビ咲耶の途中保存・ランキングが、どの URL から開いても同じものになる（`picture:chibi-sakuya`）
- [ ] シェアの文面が「チビ咲耶 をナオブロックで組み立てた！ …#naoblock」、URL が `?pic=chibi-sakuya`
- [ ] **絵を足すのが 1 か所で済む**：手元だけで別の画像を `data/samples/` に置き、`PICTURES` に 1 行足す → スタート画面にボタンが増え、遊べて、保存・ランキングも別になる（この確認用の絵はコミットしない）
- [ ] Noun 11 の見た目・保存・ランキング・シェアが前の版と同じ
- [ ] `node tools/check.mjs 0`・`11`・`1000` のパーツ割りが前の版と同じ。`--subjects` が全部 OK
- [ ] スマホ縦でスタート画面のボタンが押しやすい。コンソールのエラーが 0

### PR B

- [ ] `ogp.png` が 1200×630。naoblock.jp のほかのカードと並べて見て違和感がない
- [ ] X のカード確認（投稿画面に URL を貼って、カード画像とタイトルが出るか）。※ GitHub Pages に出たあとで確認
- [ ] スタート画面と完成画面に「naoblock.jp へ」があり、naoblock.jp が開く。遊ぶ画面にはない
- [ ] `index.html`・`src/`・`style.css` に `/` から始まるパスや `github.io` が増えていない（`og:image`・`og:url` を除く）

## 7. この次（この手順書ではやらない）

1. 自分の画像を読み込んで遊ぶ（スマホの写真やドット絵）
2. 3D（段で積む）は、立体の設計図をどう用意するか決まってから

## 8. naoblock.jp につなぐときにやること（なおなお＋MacBook のちーちゃん）

この手順書の PR がマージされたあとにやる。ほかの咲耶 GAMES（`rally.naoblock.jp` など）と同じ手順。

1. 公開の名前を決める（例：`block.naoblock.jp`、8 章の「決めること」）
2. DNS に CNAME を足し、`naoblock-builder` の GitHub Pages にカスタムドメインを設定（リポジトリに `CNAME` ファイルができる）
3. `index.html` の `og:image`・`og:url` を新しい URL に差し替える
4. naoblock.jp（`naoblock` リポジトリ）のゲーム一覧にカードを 1 枚足す
5. 注意：**途中保存とランキングはドメインごと**なので、github.io で遊んだ記録は新しいドメインには引き継がれない。公開前に付け替えれば困る人はいない

### 決めること（なおなおに確認）

- 公開の名前：`block.naoblock.jp`／`builder.naoblock.jp`／ほか
- OGP 画像の中身（4-1 の（仮））
