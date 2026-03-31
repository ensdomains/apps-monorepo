if (!globalThis.Temporal) {
  const { Temporal } = await import('@js-temporal/polyfill')
  globalThis.Temporal = Temporal
}

export {}
