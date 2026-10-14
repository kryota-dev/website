# コンテンツの編集

サイトに表示する文言は、すべて `src/content/` の Markdown にあります。各ファイルは frontmatter（YAML）と本文からなり、項目の型は `src/content.config.ts` のスキーマで検査されます。必須の項目が欠けている、空文字列がある、といった誤りはビルドが失敗して知らせます。

編集したら、少なくとも `pnpm build` と `pnpm test:a11y` を通してください。テストは Markdown を直接読んで期待値を作るので、文言を変えるだけならテストを直す必要はありません。

## ファイルの一覧

| パス               | 内容                                                       | 件数 |
| ------------------ | ---------------------------------------------------------- | ---- |
| `site/index.md`    | サイト名・説明文・ナビやテーマ切替のラベル・SEO の人物情報 | 1 件 |
| `hero/index.md`    | トップの見出しと導入文                                     | 1 件 |
| `profile/index.md` | 職務要約・資格・活動・外部リンク                           | 1 件 |
| `sections/*.md`    | 各セクションの見出し・アイコン・ナビの表示名・説明文       | 4 件 |
| `works/*.md`       | 実績のカード 1 枚ずつ                                      | 任意 |
| `skills/*.md`      | スキルのグループ 1 つずつ                                  | 任意 |
| `legal/privacy.md` | プライバシーポリシー（`/privacy/`）                        | 1 件 |

1 件だけのコレクションは、ファイル名を `index.md` から変えないでください。

## 共通の決まり

- リンクの `href` は `https:` か `mailto:` だけを使えます。
- `https://` で始まるリンクは外部リンクとして扱われ、新しいタブで開き、その旨が読み上げられます。サイト内へのリンクは `/privacy/` のような相対パスで書きます。
- 本文の Markdown には HTML も書けます。HTML で書いた `<a>` も外部リンクの扱いを受けます。

## site

`seo.person` は構造化データ（JSON-LD）に使います。住所は都道府県（`addressRegion`）と国コード（`addressCountry`、大文字 2 文字）までで、番地は書きません。`seo.locale` は `ja_JP` の形式です。

## hero

`heading` の `\n` は改行になり、トップの見出しと OGP 画像の両方に反映されます。空の行は作れません（先頭・末尾の改行や、改行の連続はエラー）。

OGP 画像は hero の `heading`・`byline` と、site の `name` から生成します。見出しが長すぎて画像に収まらないときは、ビルドが失敗します。

## sections

`id` は `works` / `skills` / `profile` / `contact` のいずれかで、1 つの `id` は 1 ファイルにしか使えません。

- `order`: ヘッダーのナビの並び順です。ページ上のセクションの並びは `src/pages/index.astro` で決まっているので、`order` を変えるだけでは本文の順は変わりません。両方をそろえてください。
- `icon`: 絵文字 1 文字です。支援技術からは隠すので、意味を持たせないでください。
- `label`: 見出しの横に添える英語の表示名です（読み上げない）。
- 本文: 書くと見出しの下に説明文として表示されます。空なら表示しません。

## works

1 ファイルが実績のカード 1 枚です。`order` の小さい順に並び、1 が直近に終わった仕事です。新しく足すときは、既存の `order` をずらしてください。

- 本文（概要）は必須です。空だとビルドが失敗します。
- `highlights` と `tech` は 1 件以上必要です。
- `labels` はカード内の小見出し（役割・主な取り組み・技術スタック）です。全ファイルで同じ値にしておきます。

ファイル名はテストが `id` として使うため、小文字の 1 階層（`work-10.md` など）にしてください。

## skills

1 ファイルがグループ 1 つです（`group` が見出し、`items` が項目）。`order` の順に並びます。

## profile

本文が職務要約です。続いて資格・活動・外部リンクの順に表示し、件数が 0 のブロックは見出しごと出しません。

- `qualifications` と `activities` は新しい順に書きます。
- 失効した資格は消さずに、`note` に失効を書きます。

## legal

`title` はページの見出しと `<title>`、`description` は meta description になります。本文は必須です。

## セクションを追加する

新しい種類のセクションは、コンテンツの追加だけでは表示されません。

1. `src/content.config.ts` の `sectionId` に `id` を足す
2. `src/content/sections/<id>.md` を作る
3. `src/components/home/` にコンポーネントを作り、`Section.astro` で囲む（`<Section id="<id>">`）。見出しと説明文は `Section` が出す
4. `src/pages/index.astro` に置く
5. 新しいコレクションが要るなら `src/content.config.ts` に定義し、`tests/content.ts` に読み出しを足す

## 法務ページを追加する

1. `src/content/legal/<id>.md` を作る
2. `LegalPage.astro` の `Props` の `id` の型に `<id>` を足し、`src/pages/<id>.astro` で `<LegalPage id="<id>" />` を置く
3. フッター（`Footer.astro`）にリンクを足す
4. テストはページが `/` と `/privacy/` だけであることを検査しているので、`tests/home.spec.ts` と `tests/content.ts` の該当箇所を直す

## 文字とフォント

日本語フォントは、ビルド時にページで使っている文字だけに絞ります。開発サーバーは元のフォントを使うので、`pnpm dev` で問題なく見えても、本番の確認は `pnpm build` の結果で行ってください。使われている文字は `.generated/fonts/noto-sans-jp.chars.txt` で確かめられます。
