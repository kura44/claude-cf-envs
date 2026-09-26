/**
 * 開発用の Worker へ作業ツリーをそのまま上げる。`npm run deploy:dev`
 * (claude-cf-envs の cf-envs:setup がプロジェクトの scripts/ に置く。設定は cf-envs.json)
 *
 * GitHub を通さずに、直した画面をすぐ確かめるための口。本番へは main への merge でしか出さない。
 *
 * - トークンは開発用の Worker にしか権限が無いものを使う。本番へ `wrangler deploy` しても
 *   権限で弾かれるので、間違えても本番には届かない。
 * - クラウドの作業環境では、トークンは api.cloudflare.com 行きの通信にプロキシが付けるので、
 *   wrangler にはダミーを渡せばよい(手元の端末で本物が入っていればそちらを使う)。
 * - デプロイのメッセージにコミットを残す。コミットしていない変更があれば `+未コミット` を付ける。
 * - 上げ終わったあと、wrangler はアカウント全体の workers.dev サブドメインを読みに行き、
 *   トークンがこの Worker にしか効かないので**そこだけ**認証エラーで落ちる。
 *   なので終了コードは当てにせず、この Worker の最新デプロイが今回のものかで成否を決める。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../cf-envs.json', import.meta.url), 'utf8'));
const ENV = cfg.devEnv || 'dev';
const DEV_URL = `https://${cfg.devWorker}.${cfg.workersSubdomain}.workers.dev`;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const dirty = git('status', '--porcelain') !== '';
const message = `${git('rev-parse', '--short', 'HEAD')}${dirty ? '+未コミット' : ''}`;

const env = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || 'placeholder',
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || cfg.accountId,
  WRANGLER_SEND_METRICS: 'false',
};

const startedAt = Date.now();
try {
  execFileSync('npx', ['wrangler', 'deploy', '--env', ENV, '--message', message], {
    env,
    stdio: 'inherit',
  });
} catch { /* 下で確かめる */ }

const deployments = JSON.parse(execFileSync(
  'npx', ['wrangler', 'deployments', 'list', '--env', ENV, '--json'],
  { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
));
const latest = deployments.at(-1);
const ok = latest
  && latest.annotations?.['workers/message'] === message
  && Date.parse(latest.created_on) >= startedAt - 60_000;
if (!ok) {
  console.error('\n開発環境へのデプロイが確認できませんでした(上のエラーを見てください)');
  process.exit(1);
}
console.log(`\n開発環境: ${DEV_URL}`);
console.log(`バージョン: ${latest.versions[0].version_id}(${message})`);
