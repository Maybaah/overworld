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
}
