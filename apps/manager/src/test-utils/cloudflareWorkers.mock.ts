// `cloudflare:workers` is a workerd virtual module that Vite cannot resolve
// under vitest. The alias in vitest.config.ts points here; tests that need
// bindings `vi.mock('cloudflare:workers', ...)` on top of it.
export const env: Partial<Cloudflare.Env> = {}
