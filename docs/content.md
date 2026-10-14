# コンテンツの編集

サイトに表示する文言は、原則として `src/content/` の Markdown にあります。例外は、外部リンクに付ける「新しいタブで開きます」の読み上げ文で、`src/lib/external-link.ts` の `NEW_TAB_NOTE` にあります（`astro.config.mjs` から読む Markdown の処理で使うため）。

各ファイルは frontmatter（YAML）と本文からなり、項目の型は `src/content.config.ts` のスキーマで検査されます。必須の項目が欠けている、空文字列がある、といった誤りはビルドが失敗して知らせます。

編集したら、少なくとも `pnpm build` と `pnpm test:a11y` を通してください。本文に HTML やリンクを書いたときは、`pnpm test:html` と `pnpm test:links` も通します。

## テストとの関係

テストは Markdown を直接読んで期待値を作るので、文言を差し替えるだけならテストを直す必要はありません。ただし、テストは次の形を前提にしています。形を変えるときは、関係するテストも確かめてください。

| 前提                                                                                                        | テスト               |
| ----------------------------------------------------------------------------------------------------------- | -------------------- |
| profile の本文（職務要約）は 2 段落以上                                                                     | `tests/home.spec.ts` |
| hero・works・profile の本文は、表示されるテキストと Markdown が一致する（強調や HTML を入れると一致しない） | `tests/home.spec.ts` |
| contact の本文には Markdown 形式（`[label](href)`）のリンクが 1 つ以上ある                                  | `tests/home.spec.ts` |
| site の `seo.ogImageAlt` が、`name`・`seo.person.name`・「`alternateName` / `jobTitle`」を含む              | `tests/seo.spec.ts`  |
| ページ上のセクションの並び（後述）                                                                          | `tests/home.spec.ts` |

## ファイルの一覧

| パス               | 内容                                                       | 件数 |
| ------------------ | ---------------------------------------------------------- | ---- |
| `site/index.md`    | サイト名・説明文・ナビやテーマ切替のラベル・SEO の人物情報 | 1 件 |
| `hero/index.md`    | トップの標語と導入文                                       | 1 件 |
| `profile/index.md` | 職務要約・資格・活動・外部リンク                           | 1 件 |
| `sections/*.md`    | 各セクションの見出し・アイコン・ナビの表示名・説明文       | 4 件 |
| `works/*.md`       | 実績のカード 1 枚ずつ                                      | 任意 |
| `skills/*.md`      | スキルのグループ 1 つずつ                                  | 任意 |
| `legal/privacy.md` | プライバシーポリシー（`/privacy/`）                        | 1 件 |

## 共通の決まり

- site・hero・profile のファイル名は `index.md` から変えないでください。
- sections・works・skills のファイルは、各ディレクトリの直下に小文字のファイル名（`work-10.md` など）で置きます。テストはファイル名を `id` として使い、サブディレクトリを読みません。
- `https://` で始まるリンクは外部リンクとして扱われ、新しいタブで開き、その旨が読み上げられます。本文で HTML として書いた `<a>` も同じ扱いです。
- 本文のリンクはスキーマで検査しません。サイト内へのリンクは `/privacy/` のようなルート相対パスで書きます。

## site

`seo.person` は構造化データ（JSON-LD）に使います。住所は都道府県（`addressRegion`）と国コード（`addressCountry`、大文字 2 文字）までで、番地は書きません。`seo.locale` は `ja_JP` の形式です。

`seo.person` の `name` はトップの大見出し（`<h1>`）にもなり、その下に「`alternateName` / `jobTitle`」を表示します。OGP 画像も同じ表記を使います。

`seo.ogImageAlt` は OGP 画像の代替テキストです。画像に描く文字（後述）を変えたら、ここも合わせて直します。

## hero

`tagline` は名前の下に表示する標語で、1 行で書きます（改行は持てません）。本文は導入文です。大見出しの名前は site の `seo.person` から読むので、hero には書きません。

## OGP 画像とアバター

OGP 画像は、site の `seo.person`（名前と「`alternateName` / `jobTitle`」）・`name`（サイト名）と、アバターから生成します。標語は描きません。名前が 1 行に収まらないとき、肩書きの行がアバターの横に収まらないとき、Noto Sans JP に無い文字があるときは、ビルドが失敗します。

アバターの元画像は `src/assets/avatar.png`（400×400、背景は透明）の 1 枚だけです。トップの画像・OGP 画像・favicon・apple-touch-icon は、ビルドがこれから作ります。差し替えるときは同じ大きさの PNG で置き換え、favicon の切り出し位置（`scripts/icon-settings.mjs` の `ICONS.favicon.crop`）が頭のあたりに合っているかを確かめてください。円の色は `--color-avatar-bg`（`src/styles/tokens.css`）で、テーマに関わらず同じです。変えるときは、OGP 画像とアイコンが使う `scripts/icon-settings.mjs` の `AVATAR_BG` も同じ値にします。

## sections

`id` は `works` / `skills` / `profile` / `contact` のいずれかで、1 つの `id` は 1 ファイルにしか使えません。

- `heading`: セクションの見出し（h2）です。
- `navLabel`: ヘッダーのナビに出す名前です。
- `order`: ヘッダーのナビの並び順です。ページ上のセクションの並びは `src/pages/index.astro` で決まっていて、`tests/home.spec.ts` の `SECTION_ORDER` が要件として固定しています。`order` を変えるだけでは本文の順は変わりません。並びを変えるときは、`order`・`index.astro`・`SECTION_ORDER` をそろえてください。
- `icon`: 絵文字 1 文字です。支援技術からは隠すので、意味を持たせないでください。
- `label`: 見出しの横に添える英語の表示名です（読み上げない）。
- 本文: 書くと見出しの下に説明文として表示されます。空なら表示しません。

## works

1 ファイルが実績のカード 1 枚です。`order` の小さい順に並び、1 が直近に終わった仕事です。新しく足すときは、既存の `order` をずらしてください。

- 本文（概要）は必須です。空だとビルドが失敗します。
- `highlights` と `tech` は 1 件以上必要です。
- `labels` はカード内の小見出し（役割・主な取り組み・技術スタック）です。全ファイルで同じ値にしておきます。

## skills

1 ファイルがグループ 1 つです（`group` が見出し、`items` が項目）。`order` の順に並びます。`items` は 1 件以上必要です。

## profile

本文が職務要約で、必須です（空だとビルドが失敗します）。続いて資格・活動・外部リンクの順に表示し、件数が 0 のブロックは見出しごと出しません。

- `qualifications` と `activities` は新しい順に書きます。
- 失効した資格は消さずに、`note` に失効を書きます。
- `links[].href` は `https:` か `mailto:` だけを使えます（スキーマで検査）。

## legal

`title` はページの見出し、フッターのリンク文言、`<title>`（`title | サイト名` の形）になります。`description` は meta description です。本文は必須です。

## セクションを追加する

新しい種類のセクションは、コンテンツの追加だけでは表示されません。

1. `src/content.config.ts` の `sectionId` に `id` を足す
2. `src/content/sections/<id>.md` を作る
3. `src/components/home/` にコンポーネントを作り、`Section.astro` で囲む（`<Section id="<id>">`）。見出しと説明文は `Section` が出す
4. `src/pages/index.astro` に置く
5. `tests/home.spec.ts` の `SECTION_ORDER` に `<id>` を足し、新しいセクションの表示を確かめるテストを足す
6. 新しいコレクションが要るなら `src/content.config.ts` に定義し、`tests/content.ts` に読み出しを足す

## 法務ページを追加する

1. `src/content/legal/<id>.md` を作る
2. `LegalPage.astro` の `Props` の `id` の型に `<id>` を足し、`src/pages/<id>.astro` で `<LegalPage id="<id>" />` を置く
3. フッター（`Footer.astro`）にリンクを足す
4. テストを直す。`tests/home.spec.ts` はページが `/` と `/privacy/` だけであることを検査している。`tests/content.ts` の `legal()` の引数の型と、`tests/seo.spec.ts` の `as "privacy"` のキャストも広げる

## 文字とフォント

日本語フォントは、ビルド時にページで使っている文字だけに絞ります。開発サーバーは元のフォントを使うので、`pnpm dev` で問題なく見えても、本番の確認は `pnpm build` の結果で行ってください。使われている文字は `.generated/fonts/noto-sans-jp.chars.txt` で確かめられます。
