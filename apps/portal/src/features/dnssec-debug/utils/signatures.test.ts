import { describe, expect, it } from 'vitest'
import type { DnskeyAnswer } from '../types'
import { evaluateSignatures, toSignatureCheck } from './signatures'
import { ADDRESS, createEcdsaKey, NOW, sign, txt } from './testZones'
import { computeKeyTag } from './wire'

const DAY = 24 * 3600

describe('evaluateSignatures', () => {
  it('prefers a current signature it cannot check over an expired one that verifies', async () => {
    const key = await createEcdsaKey('example.xyz')
    // A key on an algorithm this code can't verify (DSA), as mid-rollover.
    const unsupportedKey: DnskeyAnswer = {
      ...key.record,
      data: { ...key.record.data, algorithm: 3 },
    }
    const records = [txt('_ens.example.xyz', `a=${ADDRESS}`)]
    const expired = await sign(records, key, {
      inception: NOW - 30 * DAY,
      expiration: NOW - DAY,
    })
    const current = await sign(records, key)
    const currentUnsupported = {
      ...current,
      data: {
        ...current.data,
        algorithm: 3,
        keyTag: computeKeyTag(unsupportedKey),
      },
    }

    const result = await evaluateSignatures({
      records,
      signatures: [expired, currentUnsupported],
      keys: [key.record, unsupportedKey],
      now: NOW,
    })

    expect(result.evaluations.map((e) => [e.crypto, e.timing])).toEqual([
      ['valid', 'expired'],
      ['unsupported', 'current'],
    ])
    expect(result.best).toMatchObject({
      crypto: 'unsupported',
      timing: 'current',
    })
    // Inconclusive, not "expired".
    expect(
      toSignatureCheck({
        id: 'record-signature',
        subject: 'TXT records',
        result,
        now: NOW,
      }).status,
    ).toBe('warn')
  })

  it('still prefers a current signature that verifies', async () => {
    const key = await createEcdsaKey('example.xyz')
    const records = [txt('_ens.example.xyz', `a=${ADDRESS}`)]
    const expired = await sign(records, key, {
      inception: NOW - 30 * DAY,
      expiration: NOW - DAY,
    })
    const current = await sign(records, key)

    const result = await evaluateSignatures({
      records,
      signatures: [expired, current],
      keys: [key.record],
      now: NOW,
    })

    expect(result.best).toMatchObject({ crypto: 'valid', timing: 'current' })
  })
})
