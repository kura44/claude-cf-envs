**確かめる場所は3つ(進め方は `cf-envs:workflow`)。** 本番へは main への merge(Workers Builds)でしか出さない。

- 開発 — `npm run deploy:dev`。作業ツリーをそのまま <開発の URL> へ。URL を報告に載せる。
  見た目の調整を利用者と往復しているときは、手元のテストとビルド待ちを省いて速さを優先する。
- ステージング — main 以外のブランチを push すると Worker Previews ができる(`[previews]`)。
  本番に出す前の確認はここ。URL は `npm run deploy:url` で出す。
- 本番 — main への merge。<本番の URL>

D1 は3つとも別(開発 `<name>-dev` / ステージング `<name>-staging` / 本番 `<name>`)。
**本番 D1 に書き込む前は、対象と SQL の全文を見せて利用者の了解を取る。**
`wrangler deploy` を `--env dev` 無しで叩かない。**本番に変数・バインディングを足したら
`[previews]` と `[env.dev]` にも足す**(どちらも本番の設定を引き継がない)。
