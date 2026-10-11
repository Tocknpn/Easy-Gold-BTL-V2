/// <reference types="vite/client" />

/** Injected by `vite.config.ts` (`define`) — git metadata and build stamp. */
declare const __BUILD__: string;
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT_HASH__: string;
declare const __GIT_COMMIT_MSG__: string;
declare const __GIT_BRANCH__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
