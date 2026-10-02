import { describe, expect, it } from 'vitest'
import type { DnssecReport, DnssecStep } from '../types'
import { buildOracleRequest } from './oracle'
import {
  ADDRESS,
  answer,
  createEcdsaKey,
  createTestHierarchy,
  createTestQuery,
  makeDs,
  NOW,
  negative,
  sign,
  type TestHierarchy,
  txt,
} from './testZones'
import { deriveVerdict } from './verdict'
import { walkDnssecChain } from './walkChain'

const walk = (hierarchy: TestHierarchy, name = 'example.xyz') =>
  walkDnssecChain({
    name,
    resolver: 'cloudflare',
    query: createTestQuery(hierarchy),
    now: NOW,
    anchors: hierarchy.anchors,
  })

const getZone = (report: DnssecReport, zone: string) => {
  const step = report.zones.find((z) => z.zone === zone)
  if (!step) throw new Error(`zone ${zone} missing`)
  return step
}

const getRecord = (report: DnssecReport, purpose: 'onchain' | 'offchain') => {
  const step = report.records.find((r) => r.purpose === purpose)
  if (!step) throw new Error(`record ${purpose} missing`)
  return step
}

const getCheck = (step: DnssecStep, id: string) =>
  step.checks.find((check) => check.id === id)

describe('walkDnssecChain', () => {
  it('validates a fully signed chain root → TLD → name → records', async () => {
    const hierarchy = await createTestHierarchy()
    const report = await walk(hierarchy)

    expect(report.zones.map((z) => z.zone)).toEqual(['.', 'xyz', 'example.xyz'])
    for (const zone of report.zones) {
      expect(zone.checks.filter((c) => c.status !== 'pass')).toEqual([])
    }
    expect(getRecord(report, 'onchain').status).toBe('pass')
    expect(getRecord(report, 'offchain').status).toBe('pass')
    expect(deriveVerdict(report)).toEqual({ kind: 'valid', warnings: 0 })
  })

  it('verifies the RSA root and the ECDSA zones cryptographically', async () => {
    const hierarchy = await createTestHierarchy()
    const report = await walk(hierarchy)

    expect(getZone(report, '.').dnskeySignatures).toEqual([
      expect.objectContaining({
        algorithm: 8,
        crypto: 'valid',
        timing: 'current',
      }),
    ])
    expect(getZone(report, 'example.xyz').dnskeySignatures).toEqual([
      expect.objectContaining({
        algorithm: 13,
        crypto: 'valid',
        timing: 'current',
      }),
    ])
  })

  it('builds the oracle proof in the order dnsprovejs submits it', async () => {
    const report = await walk(await createTestHierarchy())
    const request = buildOracleRequest(report)

    expect(request.entries.map((e) => e.label)).toEqual([
      '. DNSKEY',
      'xyz. DS',
      'xyz. DNSKEY',
      'example.xyz. DS',
      'example.xyz. DNSKEY',
    ])
    expect(request.incompleteAt).toBeNull()
    expect(request.records.map((r) => [r.owner, r.proofs.length])).toEqual([
      ['_ens.example.xyz', 6],
      ['example.xyz', 6],
    ])
    expect(request.algorithms).toEqual([8, 13])
    expect(request.digests).toEqual([2])
  })

  it('pinpoints an expired DS signature in the parent zone', async () => {
    const hierarchy = await createTestHierarchy()
    const exampleDs = await makeDs(hierarchy.keys.example)
    hierarchy.responses.set(
      'example.xyz DS',
      answer([
        exampleDs,
        await sign([exampleDs], hierarchy.keys.xyz, {
          inception: NOW - 30 * 24 * 3600,
          expiration: NOW - 3 * 24 * 3600,
        }),
      ]),
    )

    const report = await walk(hierarchy)

    expect(getZone(report, 'xyz').status).toBe('pass')
    expect(
      getCheck(getZone(report, 'example.xyz'), 'ds-signature'),
    ).toMatchObject({
      status: 'fail',
      title: 'Signature expired',
    })
    expect(deriveVerdict(report)).toMatchObject({
      kind: 'broken',
      step: 'example.xyz.',
      check: { id: 'ds-signature' },
    })
  })

  it('reports a signed zone whose parent has no DS record', async () => {
    const hierarchy = await createTestHierarchy()
    hierarchy.responses.set('example.xyz DS', negative('xyz'))

    const report = await walk(hierarchy)

    expect(
      getCheck(getZone(report, 'example.xyz'), 'ds-records'),
    ).toMatchObject({
      status: 'fail',
      title: 'No DS record in xyz.',
    })
    expect(deriveVerdict(report)).toMatchObject({
      kind: 'broken',
      step: 'example.xyz.',
    })
  })

  it('reports DNSSEC as not enabled when the zone has neither DS nor DNSKEY', async () => {
    const hierarchy = await createTestHierarchy()
    hierarchy.responses.set('example.xyz DS', negative('xyz'))
    hierarchy.responses.set('example.xyz DNSKEY', negative('example.xyz'))
    hierarchy.responses.set(
      'example.xyz TXT',
      answer([txt('example.xyz', 'v=spf1 -all')]),
    )
    hierarchy.responses.set(
      '_ens.example.xyz TXT',
      answer([txt('_ens.example.xyz', `a=${ADDRESS}`)]),
    )

    const report = await walk(hierarchy)

    expect(deriveVerdict(report)).toEqual({
      kind: 'not-enabled',
      zone: 'example.xyz',
    })
  })

  it('flags a DS record that matches no DNSKEY (stale DS after a rollover)', async () => {
    const hierarchy = await createTestHierarchy()
    const staleDs = await makeDs(await createEcdsaKey('example.xyz'))
    hierarchy.responses.set(
      'example.xyz DS',
      answer([staleDs, await sign([staleDs], hierarchy.keys.xyz)]),
    )

    const report = await walk(hierarchy)
    const zone = getZone(report, 'example.xyz')

    expect(getCheck(zone, 'ds-match')).toMatchObject({
      status: 'fail',
      title: 'No DS record matches a DNSKEY',
    })
    expect(getCheck(zone, 'dnskey-signature')?.status).toBe('skip')
  })

  it('detects a record that changed after it was signed', async () => {
    const hierarchy = await createTestHierarchy()
    const signed = txt('_ens.example.xyz', `a=${ADDRESS}`)
    const tampered = txt(
      '_ens.example.xyz',
      'a=0x0000000000000000000000000000000000000001',
    )
    hierarchy.responses.set(
      '_ens.example.xyz TXT',
      answer([tampered, await sign([signed], hierarchy.keys.example)]),
    )

    const report = await walk(hierarchy)

    expect(
      getCheck(getRecord(report, 'onchain'), 'record-signature'),
    ).toMatchObject({
      status: 'fail',
      title: 'Signature does not verify',
    })
    expect(deriveVerdict(report)).toMatchObject({
      kind: 'broken',
      step: '_ens.example.xyz TXT',
    })
  })

  it('flags wildcard-synthesized records, which the oracle cannot prove', async () => {
    const hierarchy = await createTestHierarchy()
    const record = txt('_ens.example.xyz', `a=${ADDRESS}`)
    hierarchy.responses.set(
      '_ens.example.xyz TXT',
      answer([
        record,
        await sign([record], hierarchy.keys.example, {
          labels: 2,
          signedOwner: '*.example.xyz',
        }),
      ]),
    )

    const report = await walk(hierarchy)
    const onchain = getRecord(report, 'onchain')

    expect(getCheck(onchain, 'record-signature')?.status).toBe('pass')
    expect(getCheck(onchain, 'record-wildcard')?.status).toBe('fail')
  })

  it('rejects an address with a broken checksum', async () => {
    const hierarchy = await createTestHierarchy()
    const record = txt('_ens.example.xyz', `a=${ADDRESS.replace('dA', 'Da')}`)
    hierarchy.responses.set(
      '_ens.example.xyz TXT',
      answer([record, await sign([record], hierarchy.keys.example)]),
    )

    const report = await walk(hierarchy)

    expect(
      getCheck(getRecord(report, 'onchain'), 'record-format'),
    ).toMatchObject({
      status: 'fail',
      title: 'Address checksum is invalid',
    })
  })

  it('surfaces a validating resolver that returns SERVFAIL', async () => {
    const hierarchy = await createTestHierarchy()
    hierarchy.validated.set('_ens.example.xyz TXT', {
      type: 'response',
      rcode: 'SERVFAIL',
      answers: [],
    })

    const report = await walk(hierarchy)

    expect(
      getCheck(getRecord(report, 'onchain'), 'resolver-validation'),
    ).toMatchObject({
      status: 'fail',
      title: 'Cloudflare rejects the answer',
    })
  })

  it('treats missing ENS records as "not set" rather than broken', async () => {
    const hierarchy = await createTestHierarchy()
    hierarchy.responses.set(
      '_ens.example.xyz TXT',
      negative('example.xyz', 'NXDOMAIN'),
    )
    hierarchy.responses.set('example.xyz TXT', negative('example.xyz'))

    const report = await walk(hierarchy)

    expect(getRecord(report, 'onchain').status).toBe('skip')
    expect(deriveVerdict(report)).toEqual({ kind: 'no-records', warnings: 0 })
    expect(buildOracleRequest(report).records).toEqual([])
  })

  it('reports a name that does not exist', async () => {
    const hierarchy = await createTestHierarchy()
    hierarchy.responses.set('missing.xyz TXT', negative('xyz', 'NXDOMAIN'))

    const report = await walk(hierarchy, 'missing.xyz')

    expect(report.zones.map((z) => z.zone)).toEqual(['.', 'xyz'])
    expect(deriveVerdict(report)).toEqual({ kind: 'name-not-found' })
  })

  it('prefers the oracle verdict once DNS itself validates', async () => {
    const report = await walk(await createTestHierarchy())

    expect(
      deriveVerdict(report, {
        steps: [
          {
            label: '. DNSKEY',
            outcome: {
              status: 'fail',
              errorName: 'NoMatchingProof',
              message: 'No key.',
            },
          },
        ],
        records: [],
      }),
    ).toEqual({ kind: 'oracle-rejected', step: '. DNSKEY', message: 'No key.' })
  })
})
