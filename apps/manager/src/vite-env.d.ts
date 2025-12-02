/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string
  readonly VITE_RHINESTONE_API_KEY: string
  readonly VITE_PIMLICO_API_KEY: string
  readonly VITE_TELEGRAM_BOT_TOKEN?: string
  readonly VITE_TELEGRAM_BOT_USERNAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
