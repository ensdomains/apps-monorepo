/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string
  readonly VITE_RHINESTONE_API_KEY: string
  readonly VITE_PIMLICO_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
