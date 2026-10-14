# デプロイと運用

## 全体像

配信には Cloudflare の Worker を 2 つ使います。

| Worker                       | 用途              | 公開先                         | 作り方             |
| ---------------------------- | ----------------- | ------------------------------ | ------------------ |
| `kryota-dev-website`         | 本番              | `https://kryota.dev` のみ      | `wrangler deploy`  |
| `kryota-dev-website-preview` | PR ごとの Preview | `*.workers.dev` の Preview URL | `wrangler preview` |

本番の Worker は `wrangler.jsonc` の `routes` でカスタムドメインに割り当て、`workers_dev` と `preview_urls` を無効にしています。本番の Worker には kryota.dev からしか到達できません。

どちらの Worker も、配信するのは `pnpm build` の出力（`dist/`）です。Worker のエントリは `@astrojs/cloudflare` のもので、ページはすべて静的なアセットとして返します。

## CI の流れ

`.github/workflows/ci.yml` が、PR と main への push で動きます。

1. `ci` ジョブ: lint・format・型検査・ビルド・HTML 検証・リンク検査・Playwright・Lighthouse を通し、`dist/` と `.wrangler/deploy/config.json` を artifact に上げる
2. PR のとき `preview` ジョブ: 1 の artifact を `wrangler preview` で Preview Worker に `pr-<番号>` として上げ、URL を PR にコメントする（同じコメントを更新し続ける）
3. main への push のとき `deploy` ジョブ: 1 の artifact を `wrangler deploy` で本番に上げる

デプロイのジョブはビルドし直さず、検査を通った成果物をそのまま配信します。依存の準備は composite action `.github/actions/setup` が行い、既定では `--ignore-scripts` で入れます。install スクリプトを動かすのは、トークンを持たない `ci` ジョブだけ（`install-scripts: "true"`）です。

デプロイの後には `scripts/check-deployed-headers.mjs` が、配信された URL のレスポンスヘッダーが `dist/client/_headers` の `/*` のルール（CSP を含む）と一致するかを確かめます。デプロイ直後は古い版が応答することがあるため、5 秒間隔で最大 12 回試します（各リクエストのタイムアウトは 10 秒）。workers.dev のホストには `X-Robots-Tag: noindex` があること、kryota.dev には無いことも検査します。

PR が閉じられると、`.github/workflows/preview-cleanup.yml` が `wrangler preview delete` でその Preview を消します。`preview` ジョブは最初に PR が開いているかを確かめ、閉じていれば作成を省きます。確かめた後、作成までの間に閉じられた場合は Preview が作られますが、作成と削除は PR 番号ごとの `concurrency` で直列化しているので、削除がその後に走って消します。フォークからの PR には Cloudflare の資格情報を渡さないので、Preview は作られません。

## GitHub の設定

### Environments

| 名前         | 使うジョブ                       | 制限                        |
| ------------ | -------------------------------- | --------------------------- |
| `production` | `deploy`                         | main ブランチからだけ使える |
| `preview`    | `preview`、`preview-cleanup.yml` | なし                        |

### Secrets

どちらの environment にも、次の 2 つを登録します。

- `CLOUDFLARE_API_TOKEN`: Cloudflare のダッシュボードで作った API トークン
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare のアカウント ID

トークンの権限や期限などの詳細は、公開リポジトリであるこの文書には書きません。

## Cloudflare のダッシュボードで行う設定

リポジトリの外にある設定です。

- kryota.dev のゾーン（本番 Worker へのカスタムドメインの割り当ては、`wrangler deploy` が `routes` から作る）
- www から apex へのリダイレクト
- Web Analytics（自動の挿入）。挿入される beacon のスクリプトは `scripts/csp.mjs` で CSP に許可してある

### Preview Worker を作り直すとき

Preview Worker は、最初の `wrangler preview` のときに作られます。このとき Wrangler は `wrangler.jsonc` の `workers_dev: false` と `preview_urls: false` をそのまま適用するので、そのままでは Preview に到達できません。作り直したときは、ダッシュボードでその Worker の workers.dev と Preview URL を有効にしてください。

Worker の名前を変えるときは、`ci.yml` と `preview-cleanup.yml` の `PREVIEW_WORKER` を両方直します。

## セキュリティヘッダー

`public/_headers` に全ページ共通のヘッダー（HSTS、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`Cross-Origin-Opener-Policy`）を書いています。Content-Security-Policy は、ビルドの最後に `scripts/csp.mjs` が出力 HTML のインライン script と style のハッシュを集めて追記します。外部のスクリプトやスタイルを足すときは、`scripts/csp.mjs` の許可リストも直してください。

同じファイルの別のルールで、workers.dev のホスト（Preview）にだけ `X-Robots-Tag: noindex` を付け、検索結果に出ないようにしています。

Workers Static Assets は `_headers` の 1 行が 2000 文字を超えると受け付けないため、`scripts/csp.mjs` がビルド時にこの長さを検査します。

## 依存の更新

Renovate（`renovate.json`）が、依存と GitHub Actions の更新 PR を作ります。PR を作ってよい時間帯は月曜の 0〜9 時（日本時間）で、lockfile の作り直し（`lockFileMaintenance`）は毎月 1 日の同じ時間帯です。実際に動く時刻は Renovate 側の実行のタイミングにもよります。公開から 3 日経っていない版は使いません（`renovate.json` と `pnpm-workspace.yaml` の両方で設定。`pnpm-workspace.yaml` の値を `renovate.json` より長くしない）。GitHub Actions はコミットハッシュで固定します。

CI の lychee も、版と sha256 を `ci.yml` に固定しています。上げるときは両方を書き換えます。
