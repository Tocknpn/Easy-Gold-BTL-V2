import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, './package.json'), 'utf-8'))

// Build stamp and git metadata shown for Admin and inside version reports
const gitInfo = (() => {
  let sha = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) || process.env.GITHUB_SHA?.slice(0, 7) || 'nogit'
  let msg = process.env.CF_PAGES_COMMIT_MESSAGE || ''
  let branch = process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || 'main'
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || sha
  } catch {
    /* no git (CI tarball) */
  }
  try {
    msg = execSync('git log -1 --format=%s', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || msg
  } catch {
    /* no git */
  }
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || branch
  } catch {
    /* no git */
  }
  return {
    sha,
    msg,
    branch,
    version: pkg.version && pkg.version !== '0.0.0' ? `v${pkg.version}` : 'v2.0.0',
    buildTime: new Date().toISOString().slice(0, 16).replace('T', ' '),
  }
})()

// Fail loudly instead of shipping DEMO data.
//
// Cloudflare's Workers Builds (the Git integration attached to the fallback
// Worker) injects WORKERS_CI=1 and, as configured, has no build variables. That
// combination once published a *demo* bundle to production without any error:
// src/lib/supabase.ts falls back to 'https://xyzcompany.supabase.co', so the app
// silently showed sample data and "Server slow to respond" instead of real rows.
//
// If you see this error, either:
//   a) add the build variables VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in
//      Worker -> Settings -> Variables and secrets, or
//   b) disconnect the Git build (Worker -> Settings -> Builds -> Disconnect) and
//      let the "Deploy Workers fallback" GitHub Action deploy this Worker.
// Cloudflare Pages builds (CF_PAGES=1) and local builds are unaffected.
if (process.env.WORKERS_CI === '1' && !process.env.VITE_SUPABASE_URL) {
  throw new Error(
    'VITE_SUPABASE_URL is missing for this Workers Build, so the build would ship ' +
      'DEMO data. Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to the Worker\'s ' +
      'build variables, or disconnect the Git integration and use the ' +
      '"Deploy Workers fallback" GitHub Action instead.'
  )
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(`${gitInfo.sha} · ${gitInfo.buildTime}`),
    __APP_VERSION__: JSON.stringify(gitInfo.version),
    __GIT_COMMIT_HASH__: JSON.stringify(gitInfo.sha),
    __GIT_COMMIT_MSG__: JSON.stringify(gitInfo.msg),
    __GIT_BRANCH__: JSON.stringify(gitInfo.branch),
    __BUILD_TIME__: JSON.stringify(gitInfo.buildTime),
  },
})
