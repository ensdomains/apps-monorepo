import { describe, expect, it, vi } from 'vitest'
import { buildJevAiRequest, parseJevAiResponse } from '@/features/ai/intent'
import { prepareAiHandoff } from '@/features/ai/prepareAiHandoff'
import {
  buildFocusedAiRequest,
  type FocusedFamily,
  focusedCapabilities,
  focusedEvidenceKeys,
  interpretFocusedAi,
} from './focusedInterpreter'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const noul = (value: number) => ({ type: 'noul', noul: value })
const base = (
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  intent: choice('set_primary'),
  request_mode: choice('requested'),
  action_count: choice('one'),
  multi_action: noul(0.01),
  next_intent: choice('none'),
  fully_supported: noul(0.99),
  unsupported_requirement: noul(0.01),
  renewal_target: choice('wallet_set'),
  expiry: choice('any'),
  expiry_window: choice('none'),
  search_shape: choice('conjunction'),
  role: choice('any'),
  version: choice('any'),
  upgrade: choice('any'),
  favorite: choice('any'),
  primary: choice('any'),
  sort: choice('any'),
  selection_constraints: choice('represented'),
  migration_constraints: choice('represented'),
  migration_restoration: choice('none'),
  manager_action: choice('none'),
  manager_constraints: choice('represented'),
  profile_field: choice('none'),
  profile_operation: choice('none'),
  ...extra,
})
const evidence = (
  family: FocusedFamily,
  support = 0.99,
  unsupported = 0.01,
) => {
  const keys = focusedEvidenceKeys(family)
  return {
    [keys.supportKey]: noul(support),
    [keys.unsupportedKey]: noul(unsupported),
  }
}
const run = (query: string, answers: Record<string, unknown>) =>
  interpretFocusedAi(query, async () => ({ answers }))
const primaryQuery = 'Use orchard.eth as my primary name'

describe('one-call focused capability experiment', () => {
  it('preserves every original question, model and redacted state exactly', () => {
    const query =
      'Change the GitHub of orchard.eth from "old-private-user" to "new-private-user"'
    const original = buildJevAiRequest(query)
    const focused = buildFocusedAiRequest(query)
    expect(focused.model).toBe(original.model)
    expect(focused.state).toBe(original.state)
    for (const [key, question] of Object.entries(original.questions)) {
      expect(focused.questions[key as keyof typeof focused.questions]).toEqual(
        question,
      )
    }
    const originalKeys = new Set(Object.keys(original.questions))
    const added = Object.entries(focused.questions).filter(
      ([key]) => !originalKeys.has(key),
    )
    expect(added).toHaveLength(Object.keys(focusedCapabilities).length * 2)
    for (const [key, question] of added) {
      expect(key).toMatch(/^focused_/)
      expect(question).toMatchObject({
        type: 'noul',
        instructions: {
          question: expect.any(String),
          scope: expect.any(Array),
          capabilities: expect.any(Array),
          constraints: expect.any(Array),
          unsupported: expect.any(Array),
        },
      })
    }
    const serialized = JSON.stringify(focused)
    for (const secret of [
      'orchard.eth',
      'old-private-user',
      'new-private-user',
    ])
      expect(serialized).not.toContain(secret)
  })

  it('makes one call and aliases only real family Nouls with traceable provenance', async () => {
    const supplied = base({
      fully_supported: noul(0.01),
      unsupported_requirement: noul(0.99),
      ...evidence('primary'),
    })
    const snapshot = JSON.stringify(supplied)
    const provider = vi.fn().mockResolvedValue({ answers: supplied })
    const output = await interpretFocusedAi(primaryQuery, provider)
    expect(provider).toHaveBeenCalledOnce()
    expect(provider.mock.calls[0]?.[1]).toBe('fanout')
    expect(output.baselineResult).toBeNull()
    expect(output.result?.action).toEqual({
      intent: 'set_primary',
      name: 'orchard.eth',
    })
    expect(output.provenance).toEqual({
      family: 'primary',
      ...focusedEvidenceKeys('primary'),
    })
    const raw = output.response as { answers: Record<string, unknown> }
    expect(raw.answers.fully_supported).toBe(
      supplied.focused_primary_fully_supported,
    )
    expect(raw.answers.unsupported_requirement).toBe(
      supplied.focused_primary_unsupported_requirement,
    )
    expect(raw.answers.request_mode).toBe(supplied.request_mode)
    const original = output.originalResponse as {
      answers: Record<string, unknown>
    }
    expect(original.answers.fully_supported).toBe(supplied.fully_supported)
    expect(original.answers).not.toHaveProperty(
      'focused_primary_fully_supported',
    )
    expect(JSON.stringify(supplied)).toBe(snapshot)
    expect(output.timings.baselineParseMs).toBeGreaterThanOrEqual(0)
    expect(output.timings.candidateParseMs).toBeGreaterThanOrEqual(0)
  })

  it.each([
    { request_mode: choice('requested', 0.64) },
    { request_mode: choice('negated') },
    { request_mode: choice('unclear') },
    { action_count: choice('one', 0.64) },
    { action_count: choice('two') },
    { action_count: choice('many') },
    { action_count: undefined },
    { next_intent: choice('none', 0.54) },
    { next_intent: choice('favorite') },
    { multi_action: noul(0.31) },
    { multi_action: noul(Number.NaN) },
    { intent: choice('set_primary', 0.54) },
    { intent: choice('not_a_route') },
  ])('does not replace whole-request evidence for an ineligible route: %j', async (changed) => {
    const supplied = base({ ...changed, ...evidence('primary') })
    const output = await run(primaryQuery, supplied)
    expect(output.provenance).toBeNull()
    expect(output.response).toBe(output.originalResponse)
    expect(output.result).toEqual(
      parseJevAiResponse(output.originalResponse, primaryQuery),
    )
    expect(output.timings.candidateParseMs).toBeNull()
  })

  it('retains original global evidence for an actual two-action request', async () => {
    const query = 'Register orchard.eth for 69 days and then set it as primary'
    const output = await run(
      query,
      base({
        intent: choice('register'),
        action_count: choice('two'),
        multi_action: noul(0.95),
        next_intent: choice('set_primary'),
        fully_supported: noul(0.01),
        unsupported_requirement: noul(0.99),
        ...evidence('registration'),
      }),
    )
    expect(output.provenance).toBeNull()
    expect(output.result).toBeNull()
  })

  it.each([
    undefined,
    null,
    { type: 'choice', choice: 'yes', confidence: 1 },
    noul(-1),
    noul(1.1),
    noul(Number.NaN),
  ])('rejects missing/malformed selected family evidence: %j', async (invalid) => {
    const output = await run(
      primaryQuery,
      base({
        ...evidence('primary'),
        focused_primary_fully_supported: invalid,
      }),
    )
    expect(output.result).toBeNull()
    expect(output.stages[0]?.status).toBe('missing_evidence')
    expect(output.baselineResult?.status).toBe('ok')
  })

  it.each([
    [0.49, 0.01],
    [0.99, 0.5],
    [0.01, 0.99],
  ])('honors actual family vetoes before legacy literal exceptions (%s/%s)', async (support, unsupported) => {
    const query = 'Show my V2 names'
    const output = await run(
      query,
      base({
        intent: choice('find_names'),
        version: choice('v2'),
        ...evidence('selection', support, unsupported),
      }),
    )
    expect(output.baselineResult?.status).toBe('ok')
    expect(output.result).toBeNull()
    expect(output.stages[0]?.status).toBe('family_rejected')
  })

  it('never drops contradictory or malformed required selection details', async () => {
    const query = 'Show my V2 names'
    for (const details of [
      { selection_constraints: choice('unsupported') },
      { version: choice('v1') },
      { version: { type: 'choice', choice: 'v2', confidence: Number.NaN } },
      { search_shape: choice('alternatives') },
      {
        expiry_window: {
          type: 'choice',
          choice: 'invented_window',
          confidence: 0.99,
        },
      },
    ]) {
      const output = await run(
        query,
        base({
          intent: choice('find_names'),
          version: choice('v2'),
          ...evidence('selection'),
          ...details,
        }),
      )
      expect(output.result, JSON.stringify(details)).toBeNull()
    }
  })

  it('keeps excluded exact targets and profile cross-family guards', async () => {
    const excluded = await run(
      'Set orchard.eth as primary instead of birch.eth',
      base({ target_name: choice('name_2'), ...evidence('primary') }),
    )
    expect(excluded.result).toBeNull()
    const conflict = await run(
      'Set the GitHub record of orchard.eth to sample-handle',
      base({
        profile_field: choice('github'),
        profile_operation: choice('set'),
        ...evidence('primary'),
      }),
    )
    expect(conflict.result).toBeNull()
  })

  it('cannot consume another family vote after a production context-based reroute', async () => {
    const output = await run(
      'Share orchard.eth',
      base({
        intent: choice('view_name'),
        manager_action: choice('share_profile'),
        manager_share_target: choice('missing'),
        ...evidence('view'),
        ...evidence('native_profile'),
      }),
    )
    expect(output.baselineResult?.action.intent).toBe('manager_action')
    expect(output.result).toBeNull()
    expect(output.stages[0]?.status).toBe('family_mismatch')
  })

  it('retains exact local values and asks for missing inputs through existing preparation', async () => {
    const output = await run(
      'Set my primary name',
      base({ ...evidence('primary') }),
    )
    expect(output.result?.action).toEqual({ intent: 'set_primary' })
    expect(
      output.result && prepareAiHandoff(output.result.action),
    ).toMatchObject({ status: 'needs_input', field: 'name' })
    const renewal = await run(
      'Renew orchard.eth for 69 days',
      base({
        intent: choice('renew'),
        renewal_target: choice('one'),
        ...evidence('renewal'),
      }),
    )
    expect(renewal.result?.action).toEqual({
      intent: 'renew',
      name: 'orchard.eth',
      durationDays: 69,
    })
  })

  it.each([
    ['show_dashboard', 'navigation'],
    ['show_notifications', 'inbox'],
    ['push_disable', 'channels'],
    ['migration_permissions', 'approvals'],
    ['nft_view', 'nft'],
    ['wallet_copy', 'wallet'],
    ['language', 'language'],
    ['share_profile', 'native_profile'],
  ] as const)('selects the actual native family without manufacturing optional answers: %s', async (kind, family) => {
    const output = await run(
      'Open Manager controls',
      base({
        intent: choice('manager_action'),
        manager_action: choice(kind),
        ...evidence(family),
      }),
    )
    expect(output.provenance?.family).toBe(family)
    const response = output.response as { answers: Record<string, unknown> }
    expect(response.answers).not.toHaveProperty('manager_locale')
    expect(response.answers).not.toHaveProperty('manager_approval')
  })

  it('does not infer eligibility from a positive capability answer or normalize invalid date requests', async () => {
    const output = await run(
      'Renew my V2 names until',
      base({
        intent: choice('renew'),
        version: choice('v2'),
        ...evidence('renewal'),
      }),
    )
    expect(output.result).toBeNull()
    expect(focusedCapabilities.renewal.unsupported.join(' ')).toContain(
      'incomplete',
    )
    expect(focusedCapabilities.renewal.constraints.join(' ')).not.toContain(
      'Missing amount/unit/date',
    )
  })

  it('propagates the sole provider failure without retrying or manufacturing answers', async () => {
    const provider = vi
      .fn()
      .mockRejectedValue(new Error('sanitized provider error'))
    await expect(interpretFocusedAi(primaryQuery, provider)).rejects.toThrow(
      'sanitized provider error',
    )
    expect(provider).toHaveBeenCalledOnce()
  })
})
