# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex, and others) when working with code in this repository.

## 概要

kryota.dev の個人サイト。Astro 7 の静的サイトを `@astrojs/cloudflare` で Cloudflare Workers（Static Assets）に配信する。Node は `.node-version`（24 系）、パッケージマネージャは pnpm 10。

## コマンド

```sh
pnpm dev               # 開発サーバー（元のフォントをそのまま使う）
pnpm build             # 本番ビルド。`astro build` を直接叩くとエラーになる（後述）
pnpm lint              # ESLint + Stylelint
pnpm format:check      # Prettier（書き換えは pnpm format）
pnpm check             # astro check（型検査）
pnpm test:html         # html-validate（dist/client が必要）
pnpm test:links        # lychee で内部リンクとアンカーを検査（lychee の別途インストールが必要）
pnpm test:a11y         # Playwright の全テスト（axe・SEO・CSP・フォントなど）。dist/client を sirv で 4399 番に配信して検査する。lychee も使う
pnpm test:lighthouse   # Lighthouse CI（Performance ≥ 0.95、他 3 項目 = 1）
```

- Playwright は `pnpm build` 済みの `dist/client` を検査する。ソースを変えたらビルドし直してから走らせる。
- 単一テスト: `pnpm exec playwright test tests/seo.spec.ts`、名前で絞るなら `-g "<title>"`、プロジェクトを絞るなら `--project=mobile-light`（`{mobile,desktop}-{light,dark}` の 4 つ）。
- CI（`.github/workflows/ci.yml`）は lint → format:check → check → build → test:html → test:links → test:a11y → test:lighthouse の順に走る。PR テンプレートのチェックリストも同じ項目。

## アーキテクチャ

### 多段ビルド（`scripts/build.mjs`）

`pnpm build` は次を順に実行する。

1. `FONT_PASS=collect` で `astro build`（元の Noto Sans JP を使う）
2. `scripts/subset-fonts.mjs`: 出力 HTML の文字を集め、Noto Sans JP をサブセット化して `.generated/fonts/` に置く（元フォントは sha256 を検証してから使う）
3. `FONT_PASS=final` で再度 `astro build`（サブセットを使う）
4. `scripts/og-image.mjs`: Markdown コンテンツから OGP 画像を satori + resvg で生成
5. `scripts/csp.mjs`: 出力のインライン script/style の sha256 を集め、`dist/client/_headers` に Content-Security-Policy を追記（`'unsafe-inline'` は使わない）

`astro.config.mjs` の `requireTwoPassBuild` が `FONT_PASS` 未設定の `astro build` を拒む。`--outDir` / `--root` は非対応。フォントのパスと `FONT_PASS` の判定は `scripts/font-paths.mjs` にまとまっており、設定とビルドスクリプトが共有する（テストはパスを直接書いているので、変えるときは `tests/` も直す）。

### コンテンツ

表示する文言は `src/content/` の Markdown（frontmatter + 本文）にあり、スキーマは `src/content.config.ts`（zod）。コンポーネントに文言を直書きしない。例外は外部リンクの読み上げ文 `NEW_TAB_NOTE`（`src/lib/external-link.ts`）で、コンテンツコレクションを読めない `astro.config.mjs` が使うためここにある。編集の詳細は `docs/content.md`。

- `site` / `hero` / `profile` は `index.md` 1 件だけのコレクション。`src/lib/content.ts` の `getSingle` で読む。
- `sections` / `works` / `skills` は `order` で並べる（`getOrdered`）。`sections` の `id` は重複禁止で、`getSection(id)` で引く。
- `profile.links[].href` は `https:` と `mailto:` だけを許す。本文のリンクはスキーマで検査しない。
- テストは `tests/content.ts` で frontmatter を直接読み、文言をハードコードしない。ただしページ上のセクションの並び（`tests/home.spec.ts` の `SECTION_ORDER`）や段落・行の数など、形には前提がある。

Markdown は Sätteri で処理し、`src/lib/markdown.ts` のプラグインで外部リンク（`https://` 始まり）に `target="_blank"` と `rel`、新しいタブで開く旨の読み上げ文を付ける（`src/lib/external-link.ts`）。

### ページ構成

- `src/pages/index.astro`（トップ。`components/home/` の各セクションを並べる）、`privacy.astro`（`LegalPage`）、`robots.txt.ts`。
- レイアウトは `layouts/Page.astro`（ヘッダー・フッター・`<title>`）が `layouts/Base.astro`（`<html>` と head）を包む。SEO は `Seo.astro`、JSON-LD は `StructuredData.astro` + `lib/json-ld.ts`。
- テーマ切替は `src/scripts/theme.ts` と `ThemeSwitcher.astro`。既定は OS 設定に従い、`html[data-theme]` で上書きする。

### スタイル

`@layer reset, tokens, base, components` の順序は `src/styles/global.css` と `layouts/Base.astro` のインライン style の 2 箇所で宣言しているので、変えるときは両方を直す。色・fill・stroke・border/outline の論理プロパティ・shadow・margin・padding・gap・inset は、Stylelint（`stylelint-declaration-strict-value`）で変数（`tokens.css` のトークン）を強制している（`0`・`auto` などは例外。対象と例外は `.stylelintrc.json`）。これらの生の値を書けるのは `tokens.css` と `reset.css` だけ。OGP 画像の色は `scripts/og-image.mjs` に複製しているので、ライトテーマのトークンを変えたら合わせる。

### 配信とヘッダー

- `public/_headers` にセキュリティヘッダーを書き、CSP はビルド時に追記される。インライン script/style を足すと CSP のハッシュが変わるが、ビルドで再計算される。
- `wrangler.jsonc`: 本番 Worker は `kryota.dev` のカスタムドメインのみで配信し、workers.dev と Preview URL は無効。
- CI: main への push で `wrangler deploy`、PR では別 Worker（`kryota-dev-website-preview`）に `wrangler preview` で Preview を作り、URL をコメントする。どちらも配信後に `scripts/check-deployed-headers.mjs` でヘッダーを検査する。PR が閉じると `preview-cleanup.yml` が Preview を消す。

### 依存の管理

`pnpm-workspace.yaml` で `minimumReleaseAge`（3 日。依存を解決するときだけ効き、lockfile にある版は検査しない）と `strictDepBuilds` を設定している。ビルドスクリプトを持つ依存を足すと install が失敗するので、`allowBuilds` に許可または不許可を明記する。更新は Renovate（`renovate.json`）。

## ドキュメント

- `README.md`: 概要・セットアップ・ライセンスの範囲
- `docs/content.md`: コンテンツの項目、並び順、セクションや法務ページの追加手順
- `docs/deployment.md`: Cloudflare の Worker 2 つの関係、GitHub の environment と secret、ダッシュボード側の設定

挙動を変えたら、関係する文書も同じ変更で直す。公開リポジトリなので、資格情報の期限・権限・アカウント ID は文書に書かない。

## ローカル専用の資料

`.claude/prds/`（PRD）と `.spec-workflow/specs/`（要件・設計・タスク）は gitignore 済みの計画資料で、作者の手元にだけある。あれば設計の経緯を知るのに使い、無ければ無視してよい。
