# claude-cf-envs

Cloudflare Workers + D1 のプロジェクトに **開発・ステージング・本番** の3段構成を入れ、
Claude Code で日々の変更を出すための Claude Code プラグイン。

| | 開発 | ステージング | 本番 |
|---|---|---|---|
| 出し方 | `npm run deploy:dev`(作業ツリーをそのまま) | main 以外のブランチを push(Worker Previews) | main への merge(Workers Builds) |
| D1 | `<name>-dev` | `<name>-staging` | `<name>` |

作業環境のトークンは開発用 Worker にしか効かないので、**本番に届かないことを権限で保証する**。

## 中身

- `cf-envs:setup` — 立ち上げ(一度きり)。利用者にお願いすること、D1 の作成、wrangler の設定、
  検索よけ、スクリプトの配置、確かめ方
- `cf-envs:workflow` — 毎回の進め方。どこに出すか、テストを省いてよいとき、環境ごとの D1 の扱い、ハマりどころ
- `scripts/deploy-dev.mjs` `scripts/deploy-url.mjs` — setup がプロジェクトにコピーする。設定は `cf-envs.json`
- `templates/` — `cf-envs.json` と CLAUDE.md に足す決まりの型

## 入れ方

プロジェクトの `.claude/settings.json` に書くと、そのリポジトリで開いたセッションで自動で使える:

```json
{
  "extraKnownMarketplaces": {
    "claude-cf-envs": { "source": { "source": "github", "repo": "kura44/claude-cf-envs" } }
  },
  "enabledPlugins": { "cf-envs@claude-cf-envs": true }
}
```

手で入れるなら `/plugin marketplace add kura44/claude-cf-envs` → `/plugin install cf-envs@claude-cf-envs`。

入れたら「開発環境を作って」と頼めば `cf-envs:setup` が読まれる。
