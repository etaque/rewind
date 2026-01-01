/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REWIND_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
