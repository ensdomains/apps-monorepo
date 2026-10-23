import { vi } from 'vitest'

// happy-dom >= 20.12 implements Element.animate(), but creates each
// Animation's `finished` promise eagerly and rejects it on cancel(), while
// browsers create it lazily on access. motion cancels animations on unmount
// without touching `finished`, so under happy-dom every unmount of an
// animating component emits an unhandled AbortError rejection, which vitest
// counts as an unhandled error and fails the run. Removing animate() sends
// motion down its JS-driven fallback, matching happy-dom < 20.12 behavior.
// Drop this once https://github.com/capricorn86/happy-dom rejects lazily.
Reflect.deleteProperty(Element.prototype, 'animate')

// Every file that reaches `@/lib/wagmi` builds the real wagmi config, and the
// WalletConnect connector's `setup()` then boots the whole WalletConnect SDK,
// including network requests. No unit test talks to WalletConnect, so swap in
// an inert connector with the same id. Mock `wagmi/connectors` (what the app
// imports): vitest can't reach the `@wagmi/connectors` re-export inside it.
// The factory keeps its static `type`, which code compares connectors against.
vi.mock('wagmi/connectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi/connectors')>()
  return {
    ...actual,
    walletConnect: Object.assign(
      () =>
        actual.injected({
          target: {
            id: 'walletConnect',
            name: 'WalletConnect',
            provider: () => undefined,
          },
        }),
      { type: actual.walletConnect.type },
    ),
  }
})
