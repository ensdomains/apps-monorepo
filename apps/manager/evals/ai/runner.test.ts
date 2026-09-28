import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_EVAL_CORPUS } from './corpus'
import {
  type EvalResult,
  isMutationProposal,
  matchesExpected,
  providerFailure,
  summarizeEval,
  unattemptedCase,
} from './evaluate'
import {
  getEvalCapabilityMetadata,
  hashEvalSource,
  loadLocalKey,
  runEvalCases,
  runLiveCase,
} from './runner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})
const localVars = async (content: string) => {
  const directory = await mkdtemp(join(tmpdir(), 'manager-ai-eval-test-'))
  temporaryDirectories.push(directory)
  const path = join(directory, '.dev.vars')
  await writeFile(path, content)
  return path
}
const firstCase = AI_EVAL_CORPUS[0]
if (!firstCase) throw new Error('Evaluation corpus must not be empty')
const testCase = firstCase

const sampleResult = (overrides: Partial<EvalResult> = {}): EvalResult => ({
  ...providerFailure(testCase, 'timeout', 8000),
  actual: testCase.expected,
  pass: true,
  stage: 'passed',
  ...overrides,
})

describe('offline evaluation harness', () => {
  it('records the production question contract without fabricating provider answers', () => {
    const metadata = getEvalCapabilityMetadata(AI_EVAL_CORPUS)
    expect(metadata.ai?.questions).toContain('migration_constraints')
    expect(metadata.ai?.boundedChoices.migration_constraints).toEqual([
      'represented',
      'unsupported',
    ])
    expect(metadata.ai?.boundedChoices.manager_action).toContain(
      'share_profile',
    )
    expect(metadata.ai?.boundedChoices.profile_operation).toContain('remove')
    expect(metadata.dashboard?.questions).not.toContain('migration_constraints')
    expect(JSON.stringify(metadata)).not.toContain('pookie.eth')
  })

  it('separates native navigation and sharing from state changes without relaxing incorrect-proposal checks', () => {
    for (const kind of [
      'share_profile',
      'copy_profile',
      'view_address',
      'show_dashboard',
      'show_favorites',
      'show_notifications',
      'migration_permissions',
      'nft_view',
      'nft_share',
      'nft_download',
      'wallet_copy',
    ]) {
      const action = { intent: 'manager_action', kind }
      expect(isMutationProposal(action)).toBe(false)
      const summary = summarizeEval([
        sampleResult({
          expected: { status: 'unsupported' },
          actual: { status: 'ready', action },
          pass: false,
          unsafeProposal: isMutationProposal(action),
          stage: 'outcome',
        }),
      ])
      expect(summary.incorrectProposals).toBe(1)
      expect(summary.unsafeProposals).toBe(0)
    }
    for (const kind of [
      'unfavorite',
      'mark_notifications_read',
      'email_add',
      'email_remove',
      'email_resend',
      'telegram_connect',
      'telegram_remove',
      'push_enable',
      'push_disable',
      'migration_revoke',
      'nft_claim',
      'wallet_disconnect',
      'language',
      'unknown_future_action',
    ])
      expect(isMutationProposal({ intent: 'manager_action', kind })).toBe(true)
  })

  it('fingerprints imported production code beyond the AI folder and excludes test edits', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'manager-eval-source-'))
    temporaryDirectories.push(sourceRoot)
    const profileDirectory = join(sourceRoot, 'features/profile/service')
    await mkdir(profileDirectory, { recursive: true })
    const profilePath = join(profileDirectory, 'fieldRegistry.ts')
    const testPath = join(profileDirectory, 'fieldRegistry.test.ts')
    await writeFile(profilePath, 'export const field = "email"\n')
    const original = await hashEvalSource(sourceRoot)
    await writeFile(testPath, 'test only\n')
    expect(await hashEvalSource(sourceRoot)).toBe(original)
    await writeFile(profilePath, 'export const field = "phone"\n')
    expect(await hashEvalSource(sourceRoot)).not.toBe(original)
  })

  it('prefers an explicit environment key and never needs frontend credentials', async () => {
    expect(
      await loadLocalKey(
        { TYPESAFE_API_KEY: ' synthetic-env-key ' },
        '/missing-file',
      ),
    ).toBe('synthetic-env-key')
  })

  it.each([
    'TYPESAFE_API_KEY=synthetic-local-key',
    'TYPESAFE_API_KEY="synthetic-local-key"',
    "TYPESAFE_API_KEY='synthetic-local-key'",
  ])('reads local .dev.vars quoting: %s', async (line) => {
    const path = await localVars(`UNRELATED=ignored\n${line}\n`)
    expect(await loadLocalKey({}, path)).toBe('synthetic-local-key')
  })

  it('reports no key when neither local source provides it', async () => {
    expect(await loadLocalKey({}, '/missing-file')).toBeNull()
  })

  it('compares the entire prepared action and next action, not only intent', () => {
    const expected = {
      status: 'ready',
      action: { intent: 'renew', name: 'pookie.eth', durationDays: 10 },
    } as const
    expect(matchesExpected(expected, expected)).toBe(true)
    expect(
      matchesExpected(expected, {
        status: 'ready',
        action: { ...expected.action, name: 'alice.eth' },
      }),
    ).toBe(false)
    expect(
      matchesExpected(expected, {
        status: 'ready',
        action: { ...expected.action, durationDays: 365 },
      }),
    ).toBe(false)
    expect(
      matchesExpected(expected, { ...expected, nextIntent: 'set_primary' }),
    ).toBe(false)
    expect(matchesExpected(expected, { status: 'unsupported' })).toBe(false)
  })

  it('requires the right clarification and never accepts a provider error as a rejection', () => {
    expect(
      matchesExpected(
        { status: 'needs_input', field: 'name' },
        { status: 'needs_input', field: 'name' },
      ),
    ).toBe(true)
    expect(
      matchesExpected(
        { status: 'needs_input', field: 'name' },
        { status: 'needs_input', field: 'durationDays' },
      ),
    ).toBe(false)
    expect(
      matchesExpected({ status: 'unsupported' }, { status: 'invalid' }),
    ).toBe(true)
    expect(
      matchesExpected(
        { status: 'unsupported' },
        { status: 'provider_error', reason: 'timeout' },
      ),
    ).toBe(false)
  })

  it('counts unavailable calls separately from observed interpretation accuracy', () => {
    const summary = summarizeEval([
      sampleResult(),
      sampleResult({
        pass: false,
        stage: 'interpretation',
        actual: { status: 'unsupported' },
      }),
      providerFailure(testCase, 'http_503', 8),
    ])
    expect(summary).toMatchObject({
      total: 3,
      evaluated: 2,
      passed: 1,
      providerErrors: 1,
      accuracy: 0.5,
    })
    expect(
      summarizeEval([providerFailure(testCase, 'timeout', 8000)]).accuracy,
    ).toBeNull()
  })

  it('counts wrong targets and values for read-only actions as incorrect proposals too', () => {
    const cases = [
      {
        expected: {
          status: 'ready',
          action: { intent: 'view_name', name: 'alice.eth' },
        },
        actual: {
          status: 'ready',
          action: { intent: 'view_name', name: 'bob.eth' },
        },
      },
      {
        expected: {
          status: 'ready',
          action: { intent: 'find_names', filters: { role: 'owner' } },
        },
        actual: {
          status: 'ready',
          action: { intent: 'find_names', filters: { role: 'manager' } },
        },
      },
      {
        expected: { status: 'unsupported' },
        actual: {
          status: 'ready',
          action: { intent: 'view_name', name: 'alice.eth' },
        },
      },
    ] as const
    const results = cases.map(({ expected, actual }) =>
      sampleResult({
        expected,
        actual,
        pass: matchesExpected(expected, actual),
        stage: 'outcome',
      }),
    )
    expect(summarizeEval(results)).toMatchObject({
      passed: 0,
      unsafeProposals: 0,
      incorrectProposals: 3,
    })
    expect(
      summarizeEval([
        sampleResult(),
        providerFailure(testCase, 'timeout', 8000),
      ]).incorrectProposals,
    ).toBe(0)
  })

  it('sends only the production redacted request and never executes a Manager action', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await runLiveCase(testCase, 'synthetic-secret', fetcher)
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, options] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(options?.body).not.toContain('pookie.eth')
    expect(options?.body).not.toContain('synthetic-secret')
    expect(options?.body).not.toContain('authToken')
    expect(options?.headers).toEqual({
      Authorization: 'Bearer synthetic-secret',
      'Content-Type': 'application/json',
    })
  })

  it('records HTTP failures without reading or logging response bodies', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('sensitive diagnostic', { status: 429 }))
    const result = await runLiveCase(testCase, 'synthetic-secret', fetcher)
    expect(result).toMatchObject({
      stage: 'provider',
      actual: { status: 'provider_error', reason: 'http_429' },
    })
    expect(JSON.stringify(result)).not.toContain('sensitive diagnostic')
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  })

  it.each([
    401, 403, 429,
  ])('stops after the first denied probe (%s) and marks remaining cases unattempted', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('denied', { status }))
    const cases = AI_EVAL_CORPUS.slice(0, 8)
    const results = await runEvalCases({
      cases,
      key: 'synthetic-secret',
      fetcher,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(results).toHaveLength(8)
    expect(results[0]).toMatchObject({
      stage: 'provider',
      actual: { status: 'provider_error', reason: `http_${status}` },
    })
    expect(results.slice(1).every((result) => result.stage === 'not_run')).toBe(
      true,
    )
    expect(summarizeEval(results)).toMatchObject({
      total: 8,
      evaluated: 0,
      providerErrors: 1,
      notRun: 7,
      passed: 0,
      accuracy: null,
    })
  })

  it('stops subsequent batches if access is denied after the initial probe', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValue(new Response('denied', { status: 403 }))
    const results = await runEvalCases({
      cases: AI_EVAL_CORPUS.slice(0, 10),
      key: 'synthetic-secret',
      fetcher,
    })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(summarizeEval(results)).toMatchObject({
      total: 10,
      evaluated: 1,
      providerErrors: 3,
      notRun: 6,
    })
    expect(
      matchesExpected(
        { status: 'unsupported' },
        unattemptedCase(testCase, 'denied').actual,
      ),
    ).toBe(false)
  })

  it('sanitizes thrown errors that might include authorization headers', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Authorization: Bearer synthetic-secret'))
    const result = await runLiveCase(testCase, 'synthetic-secret', fetcher)
    expect(result).toMatchObject({
      stage: 'provider',
      actual: { reason: 'network_or_json_error' },
    })
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
  })
})
