/// <reference types="vite/client" />

// Augments Vite's own `ImportMetaEnv` by interface merging. Deliberately does
// NOT redeclare `ImportMeta`: doing so replaces Vite's non-optional `env` with
// an optional one, and every existing `import.meta.env.X` in the app starts
// failing as possibly-undefined.
interface ImportMetaEnv {
  /**
   * Points the ENS **V1 subgraph** reads at a local stand-in. Unset in
   * production, where the public endpoint is used. See
   * `packages/v1-subgraph-shim` for why a local one is needed at all.
   */
  readonly VITE_V1_SUBGRAPH_URL?: string
}
