/// <reference types="vite/client" />

declare module 'world-atlas/countries-50m.json' {
  const topology: unknown;
  export default topology;
}

declare module 'world-atlas/countries-110m.json' {
  const topology: unknown;
  export default topology;
}

interface ImportMetaEnv {
  readonly VITE_DATA_BASE?: string;
  readonly VITE_EVENTS_URL?: string;
  readonly VITE_TELEMETRY_HOSTS?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
