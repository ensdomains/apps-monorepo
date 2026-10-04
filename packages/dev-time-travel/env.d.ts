// Vite inlines `import.meta.env` per consuming app at build time. This ambient
// declaration keeps the package typechecking standalone (`tsc --noEmit`)
// outside a Vite context.
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly VITE_TIME_TRAVEL?: string
  readonly VITE_TIME_TRAVEL_RPC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
