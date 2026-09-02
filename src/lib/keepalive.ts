import { supabase } from './supabase';

/**
 * One-shot client-side keepalive.
 *
 * Every time the app is opened in a browser we try to insert one heartbeat
 * row into the `heartbeats` table. That counts as Supabase API activity and
 * helps prevent the free-tier project from being paused after 7 idle days.
 * (The main mechanism is the GitHub Actions `keepalive.yml` job every 3 days;
 * this is an extra benefit on top of it.)
 *
 * Fire-and-forget on purpose: never blocks or crashes the UI if it fails.
 * In demo mode (no real Supabase URL) it is skipped entirely.
 */
let sentThisSession = false;

export function sendClientHeartbeat(): void {
  if (sentThisSession) return;
  sentThisSession = true;

  const url = import.meta.env.VITE_SUPABASE_URL || '';
  if (!url || url.includes('xyzcompany')) return; // demo mode – no real DB

  try {
    supabase
      .from('heartbeats')
      .insert({ source: 'app-launch', note: 'app was opened in a browser' })
      .then(
        ({ error }) => {
          if (error) {
            // Table missing / RLS / offline — app falls back to demo data anyway.
            console.warn('[keepalive] heartbeat write skipped:', error.message);
          }
        },
        (reason: unknown) => {
          console.warn('[keepalive] heartbeat request failed:', reason);
        },
      );
  } catch {
    // never throw from a fire-and-forget helper
  }
}