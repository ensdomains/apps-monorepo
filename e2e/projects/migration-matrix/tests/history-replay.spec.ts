import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test as base, expect } from '@playwright/test'
import { acquireMatrixResourceSlot } from '../resource-slot.js'

const test = base.extend<{ _matrixResourceSlot: void }>({
  _matrixResourceSlot: [
    async ({}, use, info) => {
      const release = await acquireMatrixResourceSlot(info)
      try {
        await use()
      } finally {
        release()
      }
    },
    { auto: true, timeout: 0 },
  ],
})

import {
  concatHex,
  decodeAbiParameters,
  type Hex,
  keccak256,
  labelhash,
  namehash,
  parseAbiParameters,
  stringToHex,
  zeroAddress,
} from 'viem'
import {
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { inspectFixtureHistoryLinks } from '../history-display.js'
import {
  captureHistoryFailure,
  historyFailureResult,
} from '../history-failure-evidence.js'
import { routeToLocalFork } from '../local-fork-routing.js'
import { postActivityChecks } from '../post-activity-oracle.js'

type ChainEvent = {
  address: Hex
  transactionHash: Hex
  blockNumber: string
  logIndex: number
  topics: Hex[]
  data: Hex
}
type HistoryRow = {
  id: string
  type: string
  name: string
  block_number: number
  log_index: number
  transaction_hash: Hex | null
  timestamp?: string | number | null
  contract_address?: Hex | null
  data?: Record<string, unknown>
}
type Envelope = {
  data: HistoryRow[]
  page: { next_cursor?: string | null; has_more?: boolean }
  meta?: unknown
}
const directories = process.env.MATRIX_HISTORY_DIRS?.split(',') ?? []
// Explicit source runs must belong to this exact local chain. This reader never
// resets or mutates a fixture; migration observations retain the original logs.
for (const directory of directories) {
  for (const file of readdirSync(resolve(directory, 'observations')).filter(
    (f) => /^CFG-.*\.json$/.test(f),
  )) {
    const source = resolve(directory, 'observations', file)
    const saved = JSON.parse(readFileSync(source, 'utf8'))
    if (
      !saved.completedAt ||
      saved.harnessInvalid ||
      saved.historyReplayUnavailable ||
      !saved.beforeActivity ||
      !saved.afterActivity
    )
      continue
    test(`indexed history ${file.replace('.json', '')} ${saved.subject}`, async ({
      page,
    }, info) => {
      info.setTimeout(600_000)
      const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
      mkdirSync(out, { recursive: true })
      const evidence: Record<string, unknown> = {
        id: `HISTORY-${saved.configuration.config_id}-${saved.subject}`,
        configurations: [saved.configuration.config_id],
        subject: saved.subject,
        source,
        checks: {},
        activityOracleVersion: 'semantic-activity-v3',
        postActivityOracleVersion: 'post-activity-v1',
        preV2ActivityOracleVersion: 'per-name-v2-baseline-v1',
        explorerActivityOracleVersion: 'all-fixture-transactions-v1',
        explorerPaginationOracleVersion: 'settled-load-more-v1',
        startedAt: new Date().toISOString(),
        discovery:
          'Real BigName API and unmocked Explorer history. Original events are independently verified against this local chain.',
      }
      const checks = evidence.checks as Record<
        string,
        { result: string; detail: string }
      >
      const save = () =>
        writeFileSync(
          resolve(
            out,
            `history-${saved.configuration.config_id}-${saved.subject}.json`,
          ),
          JSON.stringify(evidence, null, 2),
        )
      const check = (label: string, okay: boolean, detail: string) => {
        checks[label] = { result: okay ? 'PASS' : 'FAIL', detail }
        expect.soft(okay, `${label}: ${detail}`).toBe(true)
        save()
      }
      try {
        const target = BigInt(saved.afterActivity.toBlock)
        const statusResponse = await fetch(
          `${process.env.E2E_BIGNAME_URL}/v1/status`,
          { signal: AbortSignal.timeout(30000) },
        )
        expect(statusResponse.ok, 'Real indexer status endpoint').toBe(true)
        const status = await statusResponse.json()
        evidence.indexerStatus = status
        const indexed = status.data?.chains?.['11155111']?.indexed_block
        if (indexed == null || BigInt(indexed) < target) {
          evidence.blocked = `Real indexer has not published the fixture: target ${target}; indexed ${indexed ?? 'none'}. No history pass can be assigned.`
          throw new Error(String(evidence.blocked))
        }
        const chainEvents = saved.afterActivity.events as ChainEvent[]
        const baseline = saved.beforeActivity.events as ChainEvent[]
        const names: string[] = saved.names ?? [saved.subject]
        const byName: Record<string, unknown> = {}
        evidence.names = byName
        for (const name of names) {
          let namePhase = 'API and original chain identity'
          let serverFailure = false
          try {
            const beforeEvents = baseline.filter((event) =>
              belongsToName(name, event),
            )
            const beforeHashes = [
              ...new Set(
                beforeEvents.map((e) => e.transactionHash.toLowerCase()),
              ),
            ]
            const rows: HistoryRow[] = []
            const envelopes: Envelope[] = []
            let cursor: string | undefined
            do {
              const url = new URL(
                `/v1/names/${encodeURIComponent(name)}/history`,
                process.env.E2E_BIGNAME_URL!,
              )
              url.search = new URLSearchParams({
                order: 'asc',
                page_size: '200',
                include: 'data,raw,total_count',
                ...(cursor ? { cursor } : {}),
              }).toString()
              let response = await fetch(url, {
                signal: AbortSignal.timeout(30000),
              })
              // A new local transaction can temporarily outrun the indexer
              // between readiness and the request. Retry only publication lag,
              // without changing snapshots, rows or the expected activity.
              for (
                let retry = 0;
                response.status === 409 && retry < 24;
                retry++
              ) {
                const body = await response.clone().text()
                if (!body.includes('collection publication is not available'))
                  break
                evidence.publicationReadinessRetries =
                  Number(evidence.publicationReadinessRetries ?? 0) + 1
                save()
                await new Promise((resolve) => setTimeout(resolve, 3000))
                response = await fetch(url, {
                  signal: AbortSignal.timeout(30000),
                })
              }
              if (!response.ok) {
                const body = await response.text()
                serverFailure = response.status >= 500
                byName[name] = {
                  apiStatus: response.status,
                  apiErrorBody: body,
                }
                save()
                throw new Error(
                  `${name}: actual history API returned HTTP ${response.status}: ${body.slice(0, 1600)}`,
                )
              }
              const envelope = (await response.json()) as Envelope
              envelopes.push(envelope)
              rows.push(...envelope.data)
              if (envelopes.length > 30)
                throw new Error(
                  'Unexpected fixture history pagination exceeded 6000 events',
                )
              cursor = envelope.page.has_more
                ? (envelope.page.next_cursor ?? undefined)
                : undefined
              if (envelope.page.has_more && !cursor)
                throw new Error(
                  'History claims another page but supplies no cursor',
                )
            } while (cursor)
            const readHashes = new Set(
              rows.map((row) => row.transaction_hash?.toLowerCase()),
            )
            const missing = beforeHashes.filter((hash) => !readHashes.has(hash))
            byName[name] = {
              beforeHashes,
              missingBeforeTransactions: missing,
              envelopes,
            }
            check(
              `${name}: V1 activity retained`,
              beforeHashes.length > 0 && missing.length === 0,
              `${beforeHashes.length} confirmed V1 transaction identities expected; ${missing.length} absent from full paginated history.`,
            )
            const exactMatches = (event: ChainEvent) =>
              rows.filter(
                (row) =>
                  row.transaction_hash?.toLowerCase() ===
                    event.transactionHash.toLowerCase() &&
                  row.log_index === event.logIndex &&
                  String(row.block_number) === event.blockNumber,
              )
            const normalizedActivities: unknown[] = []
            const matches = (event: ChainEvent) => {
              const exact = exactMatches(event)
              if (exact.length) return exact
              const semantic = normalizedMatches(
                event,
                beforeEvents,
                exactMatches,
              )
              if (semantic.length)
                normalizedActivities.push({
                  originalEvent: event,
                  representedBy: semantic.map((row) => ({
                    id: row.id,
                    logIndex: row.log_index,
                    type: row.type,
                  })),
                  reason:
                    'Same transaction, contract, name and exact value; redundant mint/registration or ETH address event pair.',
                })
              return semantic
            }
            const missingEvents = beforeEvents.filter(
              (event) => !matches(event).length,
            )
            check(
              `${name}: every relevant V1 activity retained`,
              missingEvents.length === 0,
              `${beforeEvents.length} relevant V1 logs checked. Mint/registration and duplicate ETH-address events may share a semantic activity only with exact same-transaction/name/contract/value proof; ${missingEvents.length} unrepresented.`,
            )
            const detailMismatches: unknown[] = []
            for (const event of beforeEvents) {
              const indexedEvent = matches(event)
              if (!indexedEvent.length) continue
              if (
                !indexedEvent.some(
                  (row) =>
                    row.contract_address?.toLowerCase() ===
                    event.address.toLowerCase(),
                )
              )
                detailMismatches.push({
                  event,
                  reason: 'emitting contract mismatch',
                })
              if (
                event.topics[0] ===
                signature('TextChanged(bytes32,string,string,string)')
              ) {
                const [key, value] = decodeAbiParameters(
                  parseAbiParameters('string,string'),
                  event.data,
                )
                if (
                  !indexedEvent.some(
                    (row) =>
                      row.type === 'record' &&
                      row.data?.key === `text:${key}` &&
                      row.data.value === value,
                  )
                )
                  detailMismatches.push({
                    event,
                    expectedKey: key,
                    expectedValue: value,
                    actual: indexedEvent,
                  })
              }
              const transfer1155 =
                event.topics[0] ===
                signature(
                  'TransferSingle(address,address,address,uint256,uint256)',
                )
              const transfer721 =
                event.address.toLowerCase() ===
                  V1_BASE_REGISTRAR.toLowerCase() &&
                event.topics[0] ===
                  signature('Transfer(address,address,uint256)')
              if (transfer1155 || transfer721) {
                const from = (
                  '0x' + event.topics[transfer1155 ? 2 : 1].slice(-40)
                ).toLowerCase()
                const to = (
                  '0x' + event.topics[transfer1155 ? 3 : 2].slice(-40)
                ).toLowerCase()
                // Mint/burn can be classified as registration/release. Real
                // holder-to-holder transfers must retain both exact wallets.
                if (
                  from !== zeroAddress &&
                  to !== zeroAddress &&
                  !indexedEvent.some(
                    (row) =>
                      row.data?.from?.toString().toLowerCase() === from &&
                      row.data?.to?.toString().toLowerCase() === to &&
                      (!transfer1155 ||
                        row.data?.operator?.toString().toLowerCase() ===
                          ('0x' + event.topics[1].slice(-40)).toLowerCase()),
                  )
                )
                  detailMismatches.push({
                    event,
                    expectedFrom: from,
                    expectedTo: to,
                    actual: indexedEvent,
                  })
              }
            }
            Object.assign(byName[name] as object, {
              missingBeforeEvents: missingEvents,
              normalizedActivities,
              detailMismatches,
            })
            check(
              `${name}: original activity details retained`,
              detailMismatches.length === 0,
              `Exact emitting contracts, text keys/values and holder-transfer wallets/operators compared with original logs; ${detailMismatches.length} mismatches.`,
            )
            check(
              `${name}: no duplicate history identity`,
              new Set(rows.map((r) => r.id)).size === rows.length,
              `${rows.length} rows checked.`,
            )
            const positions = rows
              .filter((r) => r.transaction_hash)
              .map(
                (r) =>
                  BigInt(r.block_number) * 1_000_000n + BigInt(r.log_index),
              )
            check(
              `${name}: chronological order`,
              positions.every((p, i) => i === 0 || p >= positions[i - 1]),
              'Ascending block/log order checked across every returned page.',
            )
            for (const hash of beforeHashes) {
              const expected = beforeEvents.find(
                (e) => e.transactionHash.toLowerCase() === hash,
              )!
              const receipt = await publicClient.getTransactionReceipt({
                hash: expected.transactionHash,
              })
              expect(
                receipt.status,
                'Original fixture transaction still exists on this chain',
              ).toBe('success')
              expect(receipt.blockNumber.toString()).toBe(expected.blockNumber)
            }
            const indexedFixtureEvents = rows.filter(
              (r) =>
                r.transaction_hash &&
                BigInt(r.block_number) >=
                  BigInt(saved.beforeActivity.fromBlock) &&
                BigInt(r.block_number) <= target,
            )
            const blockTimes = new Map<string, bigint>()
            const wrongTimestamps: HistoryRow[] = []
            for (const row of indexedFixtureEvents) {
              const key = String(row.block_number)
              if (!blockTimes.has(key))
                blockTimes.set(
                  key,
                  (
                    await publicClient.getBlock({
                      blockNumber: BigInt(row.block_number),
                    })
                  ).timestamp,
                )
              const stamp =
                row.timestamp == null
                  ? null
                  : /^\d+$/.test(String(row.timestamp))
                    ? BigInt(row.timestamp)
                    : Number.isFinite(Date.parse(String(row.timestamp)))
                      ? BigInt(
                          Math.floor(Date.parse(String(row.timestamp)) / 1000),
                        )
                      : null
              if (stamp !== blockTimes.get(key)) wrongTimestamps.push(row)
            }
            check(
              `${name}: original block timestamps retained`,
              wrongTimestamps.length === 0,
              `${indexedFixtureEvents.length} indexed fixture events compared with actual block timestamps; ${wrongTimestamps.length} mismatches.`,
            )
            const phantom = indexedFixtureEvents.filter(
              (row) =>
                !chainEvents.some(
                  (log) =>
                    log.transactionHash.toLowerCase() ===
                      row.transaction_hash!.toLowerCase() &&
                    log.blockNumber === String(row.block_number) &&
                    log.logIndex === row.log_index,
                ),
            )
            check(
              `${name}: indexed events identify real logs`,
              phantom.length === 0,
              `${indexedFixtureEvents.length} fixture rows compared with actual transaction, block and log index; ${phantom.length} unmatched.`,
            )
            if (
              saved.migrationOutcome === 'success' &&
              name === saved.subject
            ) {
              const newRows = rows.filter(
                (r) =>
                  BigInt(r.block_number) > BigInt(saved.beforeActivity.toBlock),
              )
              check(
                `${name}: new activity follows migration`,
                newRows.length > 0,
                `${newRows.length} indexed events after the saved V1 baseline. This does not assume an unsettled migration-label presentation requirement.`,
              )
            }
            const existingV2 = postActivityChecks(name, saved, rows, 'before')
            Object.assign(byName[name] as object, {
              existingV2Activity: existingV2,
            })
            if (existingV2.expectedEvents.length) {
              check(
                `${name}: existing V2 activity retained`,
                existingV2.missing.length === 0,
                `${existingV2.expectedEvents.length} actual V2 events already existed before this migration/refusal; ${existingV2.missing.length} absent. This includes prior migrated-ancestor activity where present.`,
              )
              check(
                `${name}: existing V2 activity details retained`,
                existingV2.wrongDetails.length === 0,
                `Exact existing V2 text values, permission bitmaps and transfer wallets compared; ${existingV2.wrongDetails.length} mismatches.`,
              )
            }
            const post = postActivityChecks(name, saved, rows)
            Object.assign(byName[name] as object, {
              postMigrationActivity: post,
            })
            if (post.expectedEvents.length) {
              check(
                `${name}: post-migration actions retain exact history identities`,
                post.missing.length === 0,
                `${post.expectedEvents.length} actual per-name V2 actions expected; ${post.missing.length} absent. ${post.scope}`,
              )
              check(
                `${name}: post-migration record and role details retained`,
                post.wrongDetails.length === 0,
                `Exact post-baseline text values, permission bitmaps and transfer wallets checked; ${post.wrongDetails.length} mismatches.`,
              )
            }
            const postLegacy = chainEvents.filter(
              (event) =>
                BigInt(event.blockNumber) >
                  BigInt(saved.beforeActivity.toBlock) &&
                belongsToName(name, event),
            )
            const postLegacyMissing = postLegacy.filter(
              (event) =>
                !exactMatches(event).length &&
                !normalizedMatches(event, postLegacy, exactMatches).length,
            )
            const postLegacyWrongText = postLegacy
              .filter(
                (event) =>
                  event.topics[0] ===
                  signature('TextChanged(bytes32,string,string,string)'),
              )
              .filter((event) => {
                const [key, value] = decodeAbiParameters(
                  parseAbiParameters('string,string'),
                  event.data,
                )
                return !exactMatches(event).some(
                  (row) =>
                    row.type === 'record' &&
                    row.data?.key === `text:${key}` &&
                    row.data.value === value,
                )
              })
            Object.assign(byName[name] as object, {
              postBaselineLegacyActivity: {
                expected: postLegacy,
                missing: postLegacyMissing,
                wrongTextValues: postLegacyWrongText,
              },
            })
            if (postLegacy.length) {
              check(
                `${name}: subsequent V1 actions retain exact history`,
                postLegacyMissing.length === 0,
                `${postLegacy.length} actual V1 actions after the migration/refusal baseline; ${postLegacyMissing.length} unrepresented. Same strict duplicate-event rules apply.`,
              )
              check(
                `${name}: subsequent V1 text values retained`,
                postLegacyWrongText.length === 0,
                `${postLegacyWrongText.length} missing or incorrect original text values after the baseline.`,
              )
            }
            namePhase = 'Explorer history readiness'
            await routeToLocalFork(page)
            await page.goto(`${process.env.PORTAL_APP_URL}/${name}/history`)
            await expect(
              page.getByRole('button', { name: 'Expand all', exact: true }),
            ).toBeVisible({ timeout: 60000 })
            namePhase = 'Explorer history display'
            const requiredHashes = [
              ...new Set([
                ...beforeHashes,
                ...indexedFixtureEvents.map((row) =>
                  row.transaction_hash!.toLowerCase(),
                ),
              ]),
            ]
            expect(
              requiredHashes.length,
              `${name}: a real original transaction baseline is required`,
            ).toBeGreaterThan(0)
            const display = await inspectFixtureHistoryLinks(
              page,
              requiredHashes,
            )
            Object.assign(byName[name] as object, {
              explorerTransactions: display,
            })
            check(
              `${name}: Explorer retains every fixture transaction`,
              display.missing.length === 0,
              `${display.expected.length} exact original and post-baseline transaction links required across ${display.pagesLoaded} page(s); ${display.missing.length} missing. ${display.stopReason}.`,
            )
            await page.screenshot({
              path: resolve(
                out,
                `history-${saved.configuration.config_id}-${name}.png`,
              ),
              fullPage: true,
            })
            save()
          } catch (error) {
            const display = namePhase.startsWith('Explorer history')
              ? await captureHistoryFailure(
                  page,
                  resolve(
                    out,
                    `history-${saved.configuration.config_id}-${name}-failed.png`,
                  ),
                )
              : undefined
            const result = historyFailureResult(
              namePhase,
              serverFailure,
              display,
            )
            checks[`${name}: ${namePhase}`] = {
              result,
              detail: String(error).slice(0, 2000),
            }
            byName[name] = {
              ...((byName[name] as object) ?? {}),
              incompletePhase: namePhase,
              error: String(error),
              displayFailure: display,
            }
            if (result === 'BLOCKED')
              evidence.blocked =
                'At least one name could not complete its API, original-chain or Explorer readiness checks; inspect the per-name evidence.'
            expect.soft(false, `${name}: ${namePhase}: ${error}`).toBe(true)
            save()
          }
        }
      } catch (error) {
        evidence.error = String(error)
        throw error
      } finally {
        evidence.completedAt = new Date().toISOString()
        evidence.assertionErrors = info.errors.map((e) => e.message)
        save()
      }
    })
  }
}

const signature = (value: string) => keccak256(stringToHex(value))
const resolverEvents = new Set(
  [
    'TextChanged(bytes32,string,string,string)',
    'TextChanged(bytes32,string,string)',
    'AddrChanged(bytes32,address)',
    'AddressChanged(bytes32,uint256,bytes)',
    'ContenthashChanged(bytes32,bytes)',
    'ABIChanged(bytes32,uint256)',
    'InterfaceChanged(bytes32,bytes4,address)',
    'NameChanged(bytes32,string)',
    'PubkeyChanged(bytes32,bytes32,bytes32)',
  ].map(signature),
)
const wrapperEvents = new Set(
  [
    'NameWrapped(bytes32,bytes,address,uint32,uint64)',
    'NameUnwrapped(bytes32,address)',
    'FusesSet(bytes32,uint32)',
    'ExpiryExtended(bytes32,uint64)',
  ].map(signature),
)
const registrarEvents = new Set(
  [
    'NameRegistered(uint256,address,uint256)',
    'NameRenewed(uint256,uint256)',
  ].map(signature),
)

/** Match the actual subject, not any occurrence of a parent's node in a log.
 * Temporary fixture approvals and V2 reservations are not V1 user-history
 * expectations. The full raw log set is still retained for independent audit.
 */
function belongsToName(name: string, event: ChainEvent): boolean {
  const address = event.address.toLowerCase(),
    kind = event.topics[0]
  const node = namehash(name).toLowerCase()
  if (address === V1_ENS_REGISTRY.toLowerCase()) {
    if (kind === signature('NewOwner(bytes32,bytes32,address)'))
      return (
        event.topics.length >= 3 &&
        keccak256(
          concatHex([event.topics[1], event.topics[2]]),
        ).toLowerCase() === node
      )
    return (
      [
        'Transfer(bytes32,address)',
        'NewResolver(bytes32,address)',
        'NewTTL(bytes32,uint64)',
      ]
        .map(signature)
        .includes(kind) && event.topics[1]?.toLowerCase() === node
    )
  }
  if (address === V1_PUBLIC_RESOLVER.toLowerCase())
    return resolverEvents.has(kind) && event.topics[1]?.toLowerCase() === node
  if (address === V1_NAME_WRAPPER.toLowerCase()) {
    if (
      kind ===
      signature('TransferSingle(address,address,address,uint256,uint256)')
    )
      return ('0x' + event.data.slice(2, 66)).toLowerCase() === node
    return wrapperEvents.has(kind) && event.topics[1]?.toLowerCase() === node
  }
  if (
    address === V1_BASE_REGISTRAR.toLowerCase() &&
    name.split('.').length === 2
  ) {
    const label = labelhash(name.split('.')[0]).toLowerCase()
    return kind === signature('Transfer(address,address,uint256)')
      ? event.topics[3]?.toLowerCase() === label
      : registrarEvents.has(kind) && event.topics[1]?.toLowerCase() === label
  }
  return false
}

/** User activity is not one UI row per raw Solidity log. Accept only these
 * exact, auditable same-transaction representations; ordinary transfers and
 * distinct record writes must still retain their own original log identities. */
function normalizedMatches(
  event: ChainEvent,
  events: ChainEvent[],
  exact: (e: ChainEvent) => HistoryRow[],
): HistoryRow[] {
  const same = events.filter(
    (other) =>
      other.transactionHash.toLowerCase() ===
        event.transactionHash.toLowerCase() &&
      other.address.toLowerCase() === event.address.toLowerCase() &&
      other.blockNumber === event.blockNumber,
  )
  const kind = event.topics[0]
  if (kind === signature('AddrChanged(bytes32,address)')) {
    const [address] = decodeAbiParameters(
      parseAbiParameters('address'),
      event.data,
    )
    return same
      .filter((other) => {
        if (
          other.topics[0] !==
            signature('AddressChanged(bytes32,uint256,bytes)') ||
          other.topics[1] !== event.topics[1]
        )
          return false
        const [coin, value] = decodeAbiParameters(
          parseAbiParameters('uint256,bytes'),
          other.data,
        )
        return coin === 60n && value.toLowerCase() === address.toLowerCase()
      })
      .flatMap(exact)
      .filter(
        (row) =>
          row.data?.key === 'addr:60' &&
          String(row.data?.value).toLowerCase() === address.toLowerCase(),
      )
  }
  if (
    event.address.toLowerCase() === V1_BASE_REGISTRAR.toLowerCase() &&
    kind === signature('Transfer(address,address,uint256)') &&
    event.topics[1].endsWith(zeroAddress.slice(2))
  ) {
    const recipient = '0x' + event.topics[2].slice(-40)
    return same
      .filter(
        (other) =>
          other.topics[0] ===
            signature('NameRegistered(uint256,address,uint256)') &&
          other.topics[1] === event.topics[3],
      )
      .flatMap(exact)
      .filter(
        (row) =>
          row.type === 'registration' &&
          String(row.data?.registrant).toLowerCase() ===
            recipient.toLowerCase(),
      )
  }
  if (
    event.address.toLowerCase() === V1_NAME_WRAPPER.toLowerCase() &&
    kind === signature('NameWrapped(bytes32,bytes,address,uint32,uint64)')
  ) {
    const [, owner, fuses, expiry] = decodeAbiParameters(
      parseAbiParameters('bytes,address,uint32,uint64'),
      event.data,
    )
    return same
      .filter(
        (other) =>
          other.topics[0] ===
            signature(
              'TransferSingle(address,address,address,uint256,uint256)',
            ) &&
          other.topics[2].endsWith(zeroAddress.slice(2)) &&
          ('0x' + other.data.slice(2, 66)).toLowerCase() ===
            event.topics[1].toLowerCase() &&
          ('0x' + other.topics[3].slice(-40)).toLowerCase() ===
            owner.toLowerCase(),
      )
      .flatMap(exact)
      .filter(
        (row) =>
          row.data?.action === 'name_wrapped' &&
          String(row.data?.owner).toLowerCase() === owner.toLowerCase() &&
          String(row.data?.fuses) === String(fuses) &&
          String(row.data?.expires_at) === String(expiry),
      )
  }
  if (
    event.address.toLowerCase() === V1_NAME_WRAPPER.toLowerCase() &&
    kind ===
      signature('TransferSingle(address,address,address,uint256,uint256)') &&
    event.topics[2].endsWith(zeroAddress.slice(2))
  ) {
    const node = '0x' + event.data.slice(2, 66),
      recipient = '0x' + event.topics[3].slice(-40)
    return same
      .filter(
        (other) =>
          other.topics[0] ===
            signature('NameWrapped(bytes32,bytes,address,uint32,uint64)') &&
          other.topics[1].toLowerCase() === node.toLowerCase(),
      )
      .flatMap(exact)
      .filter(
        (row) =>
          row.data?.action === 'name_wrapped' &&
          String(row.data?.owner).toLowerCase() === recipient.toLowerCase(),
      )
  }
  return []
}
