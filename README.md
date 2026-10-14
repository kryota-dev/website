# kryota.dev

ソフトウェアエンジニア Ryota Kaneko のポートフォリオサイト（<https://kryota.dev>）のソースです。

Astro で生成した静的サイトを、Cloudflare Workers の Static Assets で配信しています。表示する文言は、原則として `src/content/` の Markdown にあります。

## 特徴

- 日本語フォント（Noto Sans JP）を、ページで使う文字だけに絞ってビルド時に作り直す
- インラインの script と style をハッシュで許可する Content-Security-Policy を、ビルド時に生成する
- OGP 画像・favicon・apple-touch-icon を、Markdown の内容とアバターの画像 1 枚から生成する
- ライト / ダーク / システムのテーマ切替
- CI で HTML 検証・内部リンク検査・axe によるアクセシビリティ検査・Lighthouse の閾値（Performance 95 以上、他 3 項目 100）を必須にしている

## 必要なもの

- Node.js（版は `.node-version`。24 系）
- pnpm 10（版は `package.json` の `packageManager`。Corepack で有効にできる）
- [lychee](https://lychee.cli.rs/guides/getting-started/)（`pnpm test:links` と `pnpm test:a11y` で使う）

## はじめかた

```sh
pnpm install
pnpm dev
```

依存を追加・更新するとき、公開から 3 日経っていない版は選ばれません（`pnpm-workspace.yaml` の `minimumReleaseAge`。lockfile にある版は検査しない）。

## コマンド

| コマンド               | 内容                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev`             | 開発サーバー                                                                        |
| `pnpm build`           | 本番ビルド（`dist/`）。`astro build` は直接使えない                                 |
| `pnpm preview`         | ビルド結果のプレビュー                                                              |
| `pnpm lint`            | ESLint と Stylelint                                                                 |
| `pnpm format`          | Prettier で整形（検査だけなら `pnpm format:check`）                                 |
| `pnpm check`           | `astro check` による型検査                                                          |
| `pnpm test:html`       | html-validate（ビルド後）                                                           |
| `pnpm test:links`      | lychee で内部リンクとアンカーを検査（ビルド後）                                     |
| `pnpm test:a11y`       | Playwright の全テスト（a11y 以外も含む）。ライト / ダーク × モバイル / デスクトップ |
| `pnpm test:lighthouse` | Lighthouse CI                                                                       |

テストはビルド済みの `dist/client` を対象にします。ソースを変えたら `pnpm build` してから実行してください。初回は `pnpm exec playwright install chromium` でブラウザを入れます。

## ドキュメント

- [コンテンツの編集](docs/content.md): 文言・実績・スキルの更新、セクションや法務ページの追加
- [デプロイと運用](docs/deployment.md): 本番と Preview の配信、GitHub と Cloudflare の設定
- [AGENTS.md](AGENTS.md): ビルドの仕組みと全体の構成（コーディングエージェント向けを兼ねる）

## ライセンス

ソースコードは [MIT License](LICENSE) です。ただし、`src/content/` の文章・プロフィール・経歴、アバターの画像（`src/assets/avatar.png`）と、それらから生成する OGP 画像・favicon・apple-touch-icon は対象外で、転載・再利用はできません。`fonts/noto-sans-jp/` のフォントは SIL Open Font License 1.1 です。
