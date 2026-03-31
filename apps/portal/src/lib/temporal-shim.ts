import type { Temporal as TemporalType } from '@js-temporal/polyfill'

type TemporalLike = typeof TemporalType

type GlobalWithTemporal = typeof globalThis & {
  Temporal?: TemporalLike
}

const globalWithTemporal = globalThis as GlobalWithTemporal

if (!globalWithTemporal.Temporal) {
  const { Temporal } = await import('@js-temporal/polyfill')
  globalWithTemporal.Temporal = Temporal
}

export const getTemporal = (): TemporalLike => {
  if (!globalWithTemporal.Temporal) {
    throw new Error('Temporal is unavailable')
  }
  return globalWithTemporal.Temporal
}
