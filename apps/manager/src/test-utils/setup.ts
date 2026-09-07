// happy-dom >= 20.12 implements Element.animate(), but creates each
// Animation's `finished` promise eagerly and rejects it on cancel(), while
// browsers create it lazily on access. motion cancels animations on unmount
// without touching `finished`, so under happy-dom every unmount of an
// animating component emits an unhandled AbortError rejection, which vitest
// counts as an unhandled error and fails the run. Removing animate() sends
// motion down its JS-driven fallback, matching happy-dom < 20.12 behavior.
// Drop this once https://github.com/capricorn86/happy-dom rejects lazily.
Reflect.deleteProperty(Element.prototype, 'animate')
