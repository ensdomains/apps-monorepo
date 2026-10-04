import { describe, expect, it } from 'vitest'
import {
  displayNameWithUnknownLabels,
  hasNameRow,
  isUnknownLabel,
} from './registryChildName'

const HASH = 'ba9d5b944633af135d2899dce4c44a43b00ed78f640ff4bc2088401760432cdc'

describe('hasNameRow', () => {
  it('is false only for an unregistered row with no created_at', () => {
    expect(hasNameRow({ registration_status: 'unregistered' })).toBe(false)
    expect(
      hasNameRow({
        registration_status: 'unregistered',
        created_at: '1800000000',
      }),
    ).toBe(true)
    expect(hasNameRow({ registration_status: 'registered' })).toBe(true)
  })
})

describe('unknown labels', () => {
  it('recognises only a bracketed 64-hex label', () => {
    expect(isUnknownLabel(`[${HASH}]`)).toBe(true)
    expect(isUnknownLabel(HASH)).toBe(false)
    expect(isUnknownLabel(`[${HASH.toUpperCase()}]`)).toBe(false)
  })

  it('shows each unknown label as "[label unknown]"', () => {
    expect(displayNameWithUnknownLabels(`[${HASH}].alice.eth`)).toBe(
      '[label unknown].alice.eth',
    )
    expect(displayNameWithUnknownLabels('alice.eth')).toBe('alice.eth')
  })
})
