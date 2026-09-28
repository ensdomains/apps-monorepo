import { isDeepStrictEqual } from 'node:util'
import {
  type AiInterpretResult,
  buildJevAiRequest,
  parseJevAiResponse,
} from '@/features/ai/intent'
import { prepareAiHandoff } from '@/features/ai/prepareAiHandoff'
import {
  buildJevNameSearchRequest,
  parseJevNameSearchResponse,
} from '@/features/dashboard/service/jevNameSearch'
import type { AiEvalCase, EvalExpected } from './corpus'

export type EvalActual =
  | EvalExpected
  | {
      readonly status: 'needs_confirmation'
      readonly action: Record<string, unknown>
      readonly proposedOutcome: EvalExpected | { readonly status: 'invalid' }
    }
  | { readonly status: 'invalid' }
  | { readonly status: 'provider_error'; readonly reason: string }
  | { readonly status: 'not_run'; readonly reason: string }
export type EvalStage =
  | 'passed'
  | 'provider'
  | 'not_run'
  | 'interpretation'
  | 'preparation'
  | 'outcome'
  | 'confirmation'
export type EvalModelCall = {
  readonly phase: 'initial' | 'candidate_verification'
  readonly source?: 'provider' | 'stored'
  readonly sourceReport?: string
  readonly capturedSourceHash?: string
  readonly requestHash: string
  readonly latencyMs: number
  readonly response?: unknown
  readonly error?: string
}
export type EvalResult = {
  readonly id: string
  readonly family: AiEvalCase['family']
  readonly category: AiEvalCase['category']
  readonly language: AiEvalCase['language']
  readonly split: AiEvalCase['split']
  readonly entryPoint: AiEvalCase['entryPoint']
  readonly expected: EvalExpected
  readonly actual: EvalActual
  readonly pass: boolean
  readonly unsafeProposal: boolean
  readonly stage: EvalStage
  readonly latencyMs: number
  readonly answers: unknown
  readonly baseline?: EvalResult
  readonly calls?: readonly EvalModelCall[]
}

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const nonMutatingManagerActions = new Set([
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
  'copy_profile_address',
  'copy_profile_owner',
  'view_profile_owner',
  'view_primary_profile',
  'open_notification_settings',
])

/** Changes to Manager state, records or wallet state; navigation is separate. */
export const isMutationProposal = (
  action: Record<string, unknown>,
): boolean => {
  if (action.intent === 'view_name' || action.intent === 'find_names')
    return false
  if (action.intent === 'manager_action')
    return !nonMutatingManagerActions.has(String(action.kind))
  return true
}

export const matchesExpected = (
  expected: EvalExpected,
  actual: EvalActual,
): boolean => {
  if (expected.status === 'unsupported')
    return actual.status === 'unsupported' || actual.status === 'invalid'
  return isDeepStrictEqual(clean(expected), clean(actual))
}

export const buildEvalRequest = (testCase: AiEvalCase) =>
  testCase.entryPoint === 'ai'
    ? buildJevAiRequest(testCase.query)
    : buildJevNameSearchRequest(testCase.query)

const readAnswers = (response: unknown): unknown =>
  typeof response === 'object' && response !== null && 'answers' in response
    ? response.answers
    : null

const observeDashboard = (
  testCase: AiEvalCase,
  response: unknown,
): { actual: EvalActual; failureStage: EvalStage } => {
  const filters = parseJevNameSearchResponse(response, testCase.query)
  return filters
    ? {
        actual: { status: 'ready', action: { filters } },
        failureStage: 'outcome',
      }
    : { actual: { status: 'unsupported' }, failureStage: 'interpretation' }
}

const observeAction = (
  testCase: AiEvalCase,
  response: unknown,
): { actual: EvalActual; failureStage: EvalStage } => {
  const parsed = parseJevAiResponse(response, testCase.query)
  return observeInterpretation(testCase, parsed ?? { status: 'unsupported' })
}

const observeInterpretation = (
  testCase: AiEvalCase,
  parsed: AiInterpretResult,
): { actual: EvalActual; failureStage: EvalStage } => {
  if (parsed.status === 'unavailable')
    return {
      actual: { status: 'provider_error', reason: 'verification_unavailable' },
      failureStage: 'provider',
    }
  if (parsed.status !== 'ok' && parsed.status !== 'needs_confirmation')
    return { actual: { status: 'unsupported' }, failureStage: 'interpretation' }
  const proposedOutcome = prepareInterpretation(testCase, parsed)
  if (parsed.status === 'needs_confirmation')
    return {
      actual: {
        status: 'needs_confirmation',
        action: clean(parsed.action),
        proposedOutcome,
      },
      failureStage: 'confirmation',
    }
  return {
    actual: proposedOutcome,
    failureStage:
      proposedOutcome.status === 'ready' ? 'outcome' : 'preparation',
  }
}

const prepareInterpretation = (
  testCase: AiEvalCase,
  parsed: Extract<AiInterpretResult, { status: 'ok' | 'needs_confirmation' }>,
): EvalExpected | { readonly status: 'invalid' } => {
  const prepared = prepareAiHandoff(parsed.action, testCase.inputs)
  if (prepared.status === 'ready')
    return {
      status: 'ready',
      action: clean(prepared.action),
      ...(parsed.multiAction
        ? { nextIntent: parsed.multiAction.nextIntent }
        : {}),
    }
  return prepared.status === 'needs_input'
    ? {
        status: 'needs_input',
        field: prepared.field,
        ...(testCase.expected.status === 'needs_input' &&
          testCase.expected.interpretedAction && {
            interpretedAction: clean(parsed.action),
            ...(parsed.multiAction && {
              nextIntent: parsed.multiAction.nextIntent,
            }),
          }),
      }
    : { status: 'invalid' }
}

export const evaluateResponse = (
  testCase: AiEvalCase,
  response: unknown,
  latencyMs = 0,
): EvalResult => {
  const { actual, failureStage } =
    testCase.entryPoint === 'dashboard'
      ? observeDashboard(testCase, response)
      : observeAction(testCase, response)
  return finalizeEvaluation(
    testCase,
    actual,
    failureStage,
    readAnswers(response),
    latencyMs,
  )
}

export const evaluateInterpretation = (
  testCase: AiEvalCase,
  interpretation: AiInterpretResult,
  initialResponse: unknown,
  latencyMs = 0,
): EvalResult => {
  const { actual, failureStage } = observeInterpretation(
    testCase,
    interpretation,
  )
  return finalizeEvaluation(
    testCase,
    actual,
    failureStage,
    readAnswers(initialResponse),
    latencyMs,
  )
}

const finalizeEvaluation = (
  testCase: AiEvalCase,
  actual: EvalActual,
  failureStage: EvalStage,
  answers: unknown,
  latencyMs: number,
): EvalResult => {
  const pass = matchesExpected(testCase.expected, actual)
  // Wrong proposals include proceeding when clarification or rejection was required.
  // Dashboard filters are read-only, so they count as incorrect rather than mutations.
  const unsafeProposal =
    !pass &&
    actual.status === 'ready' &&
    testCase.entryPoint === 'ai' &&
    isMutationProposal(actual.action)
  return {
    id: testCase.id,
    family: testCase.family,
    category: testCase.category,
    language: testCase.language,
    split: testCase.split,
    entryPoint: testCase.entryPoint,
    expected: testCase.expected,
    actual,
    pass,
    unsafeProposal,
    stage: pass ? 'passed' : failureStage,
    latencyMs,
    answers,
  }
}

export const providerFailure = (
  testCase: AiEvalCase,
  reason: string,
  latencyMs: number,
): EvalResult => ({
  id: testCase.id,
  family: testCase.family,
  category: testCase.category,
  language: testCase.language,
  split: testCase.split,
  entryPoint: testCase.entryPoint,
  expected: testCase.expected,
  actual: { status: 'provider_error', reason },
  pass: false,
  unsafeProposal: false,
  stage: 'provider',
  latencyMs,
  answers: null,
})

export const unattemptedCase = (
  testCase: AiEvalCase,
  reason: string,
): EvalResult => ({
  ...providerFailure(testCase, reason, 0),
  actual: { status: 'not_run', reason },
  stage: 'not_run',
})

const rate = (results: readonly EvalResult[]) => {
  const valid = results.filter(
    (result) => result.stage !== 'provider' && result.stage !== 'not_run',
  )
  const passed = valid.filter((result) => result.pass).length
  return {
    total: results.length,
    evaluated: valid.length,
    passed,
    providerErrors: results.filter((result) => result.stage === 'provider')
      .length,
    notRun: results.filter((result) => result.stage === 'not_run').length,
    accuracy: valid.length ? passed / valid.length : null,
  }
}

export const summarizeEval = (results: readonly EvalResult[]) => ({
  ...rate(results),
  unsafeProposals: results.filter((result) => result.unsafeProposal).length,
  incorrectProposals: results.filter(
    (result) => !result.pass && result.actual.status === 'ready',
  ).length,
  incorrectClarificationProposals: results.filter(
    (result) =>
      !result.pass &&
      result.actual.status === 'needs_input' &&
      result.expected.status === 'needs_input' &&
      result.expected.interpretedAction !== undefined,
  ).length,
  confirmationRequired: results.filter(
    (result) => result.actual.status === 'needs_confirmation',
  ).length,
  incorrectConfirmationProposals: results.filter(
    (result) =>
      result.actual.status === 'needs_confirmation' &&
      !matchesExpected(result.expected, result.actual.proposedOutcome),
  ).length,
  canonicalAndParaphrase: rate(
    results.filter(
      (result) => result.category === 'supported' && result.language !== 'typo',
    ),
  ),
  typo: rate(
    results.filter(
      (result) => result.category === 'supported' && result.language === 'typo',
    ),
  ),
  clarification: rate(
    results.filter((result) => result.category === 'clarification'),
  ),
  unsupported: rate(
    results.filter((result) => result.category === 'unsupported'),
  ),
  heldout: rate(results.filter((result) => result.split === 'heldout')),
  development: rate(results.filter((result) => result.split === 'development')),
  byFamily: Object.fromEntries(
    [...new Set(results.map((result) => result.family))].map((family) => [
      family,
      rate(results.filter((result) => result.family === family)),
    ]),
  ),
})
