/**
 * Workers Builds のデプロイ先URLを出す。`npm run deploy:url [コミット]`
 * (claude-cf-envs の cf-envs:setup がプロジェクトの scripts/ に置く。設定は cf-envs.json)
 *
 * push すると Workers Builds がビルドし、結果を GitHub のチェック
 * 「Workers Builds: <Worker名>」として**そのコミットに**付ける。それを読んで出すだけ
 * (Cloudflare の API もトークンも使わない)。
 *
 * - main 以外のブランチ … ステージング(Worker Previews)。チェックの本文に URL が無いので、
 *   ビルドのリンク `/previews/<プレビュー名>/builds/…` から
 *   `https://<プレビュー名>-<Worker名>.<サブドメイン>.workers.dev` を組み立てる
 * - main … 本番にも出る
 *
 * 終了コード: 0 = 完了して成功 / 1 = 失敗・見つからない / 2 = まだビルド中(待って再実行)。
 *
 * GitHub の API は curl で叩く(Node の fetch は HTTPS_PROXY を見ないため)。
 * 非公開リポジトリなら GITHUB_TOKEN が要る(あれば付ける)。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../cf-envs.json', import.meta.url), 'utf8'));
const CHECK_NAME = `Workers Builds: ${cfg.worker}`;
const PREVIEW_HOST = `${cfg.worker}.${cfg.workersSubdomain}.workers.dev`;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = git('rev-parse', process.argv[2] || 'HEAD');

const headers = ['-H', 'Accept: application/vnd.github+json'];
if (process.env.GITHUB_TOKEN) headers.push('-H', `Authorization: Bearer ${process.env.GITHUB_TOKEN}`);
const body = execFileSync(
  'curl',
  ['-sS', '-m', '20', ...headers, `https://api.github.com/repos/${cfg.repo}/commits/${sha}/check-runs`],
  { encoding: 'utf8' },
);
const run = (JSON.parse(body).check_runs || []).find((r) => r.name === CHECK_NAME);

const short = sha.slice(0, 7);
if (!run) {
  console.log(`${short}: まだチェックが付いていません(push 直後なら少し待って再実行)`);
  process.exit(2);
}
if (run.status !== 'completed') {
  console.log(`${short}: ビルド中です(${run.status})`);
  process.exit(2);
}
if (run.conclusion !== 'success') {
  console.log(`${short}: ビルドが失敗しました(${run.conclusion})\n${run.details_url}`);
  process.exit(1);
}

const summary = run.output?.summary || '';
const pick = (label) => summary.match(new RegExp(`${label}:\\s*(\\S+)`))?.[1] ?? null;
const lines = [`${short}: デプロイ完了`];
const version = pick('Version ID');
if (version) lines.push(`バージョン: ${version}`);
const previewName = run.details_url?.match(/\/previews\/([^/]+)\/builds\//)?.[1];
if (previewName) lines.push(`ステージング: https://${previewName}-${PREVIEW_HOST}`);
// 見出しで拾えなかった URL も出す(書式が変わったとき用)
const known = new Set();
for (const url of summary.match(/https:\/\/[^\s)\]"'<>]+\.workers\.dev[^\s)\]"'<>]*/g) || []) {
  if (!known.has(url)) { known.add(url); lines.push(`URL: ${url}`); }
}
let onMain = false;
try {
  execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], { stdio: 'ignore' });
  onMain = true;
} catch { /* main に無い(ブランチだけのコミット) */ }
if (onMain && cfg.productionUrl) lines.push(`本番: ${cfg.productionUrl}`);
lines.push(`ビルド: ${run.details_url}`);
console.log(lines.join('\n'));
