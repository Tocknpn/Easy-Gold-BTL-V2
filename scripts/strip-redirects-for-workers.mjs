/**
 * Strips the Pages-only SPA fallback file from the Worker bundle.
 *
 * WHY
 *   `public/_redirects` contains the Cloudflare Pages SPA rule:
 *       /*    /index.html   200
 *   Cloudflare Workers (static assets) rejects that rule as an "infinite loop",
 *   so a Worker deploy that includes the file fails. The file must therefore
 *   stay in the Pages build and be removed from the Worker build.
 *
 * WHEN IT RUNS
 *   - Automatically as the `postbuild` script of `npm run build`.
 *   - Workers Builds (Cloudflare's own Git integration) sets WORKERS_CI=1, so the
 *     file is removed for that build automatically.
 *   - The "Deploy Workers fallback" GitHub Action removes it explicitly too
 *     (`rm -f dist/_redirects`).
 *   - Cloudflare Pages builds (CF_PAGES=1) and local builds keep the file.
 *
 * MANUAL USE
 *   node scripts/strip-redirects-for-workers.mjs --force
 */
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(projectRoot, 'dist', '_redirects');

const forced = process.argv.includes('--force');
const isWorkersBuild = process.env.WORKERS_CI === '1';

if (!existsSync(target)) {
  console.log('[strip-redirects] dist/_redirects not present — nothing to do.');
  process.exit(0);
}

if (!forced && !isWorkersBuild) {
  console.log('[strip-redirects] keeping dist/_redirects (Pages build / local build).');
  process.exit(0);
}

rmSync(target);
console.log(
  '[strip-redirects] removed dist/_redirects — Workers rejects "/* /index.html 200" as an infinite loop.'
);
