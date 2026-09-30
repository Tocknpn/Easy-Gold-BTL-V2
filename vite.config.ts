import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
})
