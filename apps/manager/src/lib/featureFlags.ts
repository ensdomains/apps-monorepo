/**
 * Feature flags for the manager app, populated from Vite env vars. Read at
 * call time (not module load) so tests using `vi.stubEnv` see the override.
 *
 * Each flag defaults to `false` so missing env entries don't accidentally
 * change behaviour.
 */

const flag = (value: string | undefined): boolean => value === 'true'

/**
 * Force the transaction manager to use plain EOA signing only — bypasses the
 * Rhinestone / Pimlico / ZeroDev smart-account flows entirely. Useful for
 * environments (e.g. the Tenderly virtual sepolia fork) where ERC-4337 bundler
 * infrastructure isn't available.
 *
 * When enabled:
 * - `useSmartAccountContext()` returns a signer of type `'eoa'` backed by the
 *   wagmi wallet client.
 * - The "Enable Smart Sessions" prompt is hidden.
 * - The auto-funding mutation targets the EOA.
 */
export const isUseEoaEnabled = (): boolean =>
  flag(import.meta.env.VITE_FF_USE_EOA)
