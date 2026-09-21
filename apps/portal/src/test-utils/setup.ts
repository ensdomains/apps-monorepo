import 'temporal-polyfill/global'
import { vi } from 'vitest'

// jest-dom's matchers only apply to DOM tests, and loading them costs ~45ms
// per file, so the Node-environment tests skip it.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}

// Every file that reaches `@/lib/wagmi` builds the real wagmi config, and the
// WalletConnect connector's `setup()` then loads and boots the whole
// WalletConnect SDK, which also makes real network requests. No unit test
// talks to WalletConnect, so swap in an inert connector with the same id.
vi.mock('@wagmi/connectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wagmi/connectors')>()
  return {
    ...actual,
    walletConnect: () =>
      actual.injected({
        target: {
          id: 'walletConnect',
          name: 'WalletConnect',
          provider: () => undefined,
        },
      }),
  }
})
