---
name: setup
description: Cloudflare Workers + D1 のプロジェクトに、開発・ステージング・本番の3段構成を立ち上げる手順。「開発環境を作って」「ステージングを用意したい」「本番に直接出さない仕組みにしたい」「新しいプロジェクトを Cloudflare に出したい」と言われたとき、またはプロジェクトに cf-envs.json が無いのに 3段構成の話が出たときに読む。一度きりの作業。毎回の開発の進め方は cf-envs:workflow。
---

# 3段構成の立ち上げ

## できあがる形

| | 開発 | ステージング | 本番 |
|---|---|---|---|
| 何のため | 作業途中をすぐ見る | 本番に出す前の確認 | 利用者が使う |
| 出し方 | `npm run deploy:dev`(作業ツリーをそのまま) | main 以外のブランチを push | main への merge |
| Worker | `<name>-dev`(`[env.dev]`) | 本番 Worker の Worker Previews(`[previews]`) | `<name>` |
| D1 | `<name>-dev` | `<name>-staging` | `<name>` |
| `ENVIRONMENT` | `dev` | `staging` | 無し |

**本番に届かないことを、指示ではなく権限で保証する**のが要。作業環境のトークンは
開発用 Worker にしか効かないので、`wrangler deploy` を打ち間違えても本番は弾かれる。
本番は main への merge で Workers Builds が出す。

## 前提

- 本番の Worker がすでに GitHub と繋がって Workers Builds でデプロイされている
- Cloudflare Developer Platform の MCP が繋がっている(D1 を作る・SQL を流すのに使う)
- wrangler 4 系(`previews` の設定を読めること。`npx wrangler preview --help` が通ればよい)

## 1. 利用者にお願いすること(ここは利用者にしかできない)

トークンや鍵を**会話に貼ってもらわない**。置き場所を案内するだけにする。

1. **開発用 Worker を作る**(ダッシュボード → Workers & Pages → 作成。名前は `<name>-dev`。
   中身は何でもよい。上書きする)。Worker を作るには製品単位の Admin が要るので、
   トークンではなく利用者の手で作る
2. **API トークンを作る**(My Profile ではなくアカウントの API トークン)。
   - 権限: Workers の **Editor だけ**(Admin は付けない)
   - 対象: **開発用 Worker 1つだけ**に絞る
   - D1 の権限は付けない(D1 は MCP で触る。Worker に D1 のバインディングがあっても、
     デプロイに D1 の権限は要らない)
3. **トークンを作業環境の API 認証情報に入れる**(クラウドの作業環境なら、環境の設定で
   api.cloudflare.com 向けの認証情報として登録する。場所は `read_documentation` の
   `environment.secrets` で案内する)
4. **本番 Worker を Worker Previews に切り替える**(Worker → Settings → Builds の
   「Set up Worker Previews」)。**元に戻せない。** 手順 3 の設定を push して
   `[previews]` が入ってから押してもらう。押す前だとプレビューがバインディング無しで動いて壊れる。
   Preview command は `npx wrangler preview` のまま、「I have configured my Preview settings」に
   チェックでよい(設定は wrangler の設定ファイルにある)

## 2. こちらでやること

### D1 を2つ作る(MCP)

`d1_database_create` で `<name>-dev` と `<name>-staging` を作り、`migrations/` の SQL を
順に流す。**wrangler と同じ履歴テーブルも作って登録しておく**(以後 wrangler でも流せる):

```sql
CREATE TABLE IF NOT EXISTS d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
INSERT INTO d1_migrations (name) VALUES ('0001_xxx.sql'), ...;
```

`d1_database_query` は `;` 区切りの複数文を1回で流せる。流したら `sqlite_master` を読んで確かめる。
**本番 D1 には触らない**(作るのは開発用とステージング用だけ)。

### wrangler の設定に2つのブロックを足す

`[env.dev]` と `[previews]` は、本番の `d1_databases` と `vars` を**引き継がない**。
本番にあるバインディングは全部ここにも書く。

```toml
# ステージング。main 以外のブランチを push すると Workers Builds が `wrangler preview` で作る
[previews.vars]
ENVIRONMENT = "staging"

[[previews.d1_databases]]
binding = "DB"
database_name = "<name>-staging"
database_id = "<staging の id>"
migrations_dir = "migrations"

# 開発(`npm run deploy:dev`)
[env.dev]
name = "<name>-dev"

[env.dev.vars]
ENVIRONMENT = "dev"

[[env.dev.d1_databases]]
binding = "DB"
database_name = "<name>-dev"
database_id = "<dev の id>"
migrations_dir = "migrations"
```

確かめ方: `npx wrangler deploy --dry-run --env dev` のバインディング一覧に開発用 D1 と
`ENVIRONMENT` が出ること。`[previews]` は
`node --input-type=module -e 'import {unstable_readConfig as r} from "wrangler"; console.log(r({config:"wrangler.toml"}).previews)'`
で読めること。

### 検索に出さない

開発・ステージングは本番と同じ中身が別の URL に出るので、検索エンジンに拾わせない。
Worker の入口で、`ENVIRONMENT` を持つときだけ全応答に `x-robots-tag: noindex` を付け、
`/robots.txt` は `Disallow: /` を返す。既存の処理は包むだけにする(差分を小さく):

```js
export default {
  async fetch(request, env, ctx) {
    const res = await app.fetch(request, env, ctx);
    return env.ENVIRONMENT ? hideFromCrawlers(request, res) : res;  // 本番は ENVIRONMENT を持たない
  },
};
function hideFromCrawlers(request, res) {
  if (new URL(request.url).pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const out = new Response(res.body, res);
  out.headers.set('x-robots-tag', 'noindex');
  return out;
}
const app = { /* 元の export default の中身 */ };
```

`wrangler dev --var ENVIRONMENT:dev` で立てて、トップに `x-robots-tag: noindex` が付き、
付けずに立てたときは付かないことを見る。

### スクリプトと設定を置く

- このプラグインの `scripts/deploy-dev.mjs` と `scripts/deploy-url.mjs` をプロジェクトの
  `scripts/` にコピーする(プラグインが無くても動くように、プロジェクトに持たせる)
- `templates/cf-envs.json` をプロジェクト直下に置いて埋める
  (`workersSubdomain` は既存の workers.dev の URL から読む。アカウント ID は wrangler の出力や
  ダッシュボードの URL にある)
- `package.json` の scripts に `"deploy:dev": "node scripts/deploy-dev.mjs"` と
  `"deploy:url": "node scripts/deploy-url.mjs"` を足す

### CLAUDE.md に決まりを書く

`templates/claude-md.md` を埋めてプロジェクトの CLAUDE.md に足す。スキルは説明文が合ったときにしか
読まれないが、「本番へは merge だけ」は毎回守られないと困るので、毎回読むファイルに置く。

## 3. 確かめる(ここまでやって完了)

1. **本番に届かないこと**: `CLOUDFLARE_API_TOKEN=placeholder CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler deployments list --name <本番>`
   が権限エラーになり、`--name <name>-dev` は通る
2. **開発に上がること**: `npm run deploy:dev` が「開発環境: https://…」を出す。
   途中の workers.dev サブドメインの認証エラーは想定どおり(cf-envs:workflow「ハマりどころ」)
3. **ステージングが別の D1 を読むこと**: 利用者に、本番にある ID をステージングの URL で
   開いてもらい、出てこないことを見る(作業環境から `*.workers.dev` に繋がらないことが多い)
4. **push して `npm run deploy:url`** がステージングの URL を出す

報告には開発・ステージングの URL を載せ、トークンの権限が Editor だけかを利用者に念押しする。
