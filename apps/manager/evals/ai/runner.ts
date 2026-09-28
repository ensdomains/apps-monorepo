import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { interpretAiModelResponse } from '@/features/ai/interpretAiModelResponse'
import { CANDIDATE_AI_EVAL_CORPUS } from './candidateCorpus'
import { summarizeVerification } from './candidateMetrics'
import { AI_EVAL_CORPUS, type AiEvalCase } from './corpus'
import {
  buildEvalRequest,
  type EvalModelCall,
  type EvalResult,
  evaluateInterpretation,
  evaluateResponse,
  providerFailure,
  summarizeEval,
  unattemptedCase,
} from './evaluate'
import { EXPANSION_AI_EVAL_CORPUS } from './expansionCorpus'
import { FAMILY_AI_EVAL_CORPUS } from './familyCorpus'
import { FRESH_AI_EVAL_CORPUS } from './freshCorpus'
import { OWNER_QUESTION_CORPUS } from './ownerQuestionCorpus'
import { RENEWAL_AI_EVAL_CORPUS } from './renewalCorpus'
import { ROBUSTNESS_AI_EVAL_CORPUS } from './robustnessCorpus'

export const loadLocalKey = async (
  environment: Readonly<Record<string, string | undefined>>,
  devVarsPath: string,
): Promise<string | null> => {
  const configured = environment.TYPESAFE_API_KEY?.trim()
  if (configured) return configured
  const text = await readFile(devVarsPath, 'utf8').catch(() => '')
  const value = text.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1]
  if (!value) return null
  const unquoted = value.replace(/^(['"])(.*)\1$/, '$2').trim()
  return unquoted || null
}

const corpora: Readonly<Record<string, readonly AiEvalCase[]>> = {
  legacy: AI_EVAL_CORPUS,
  fresh: FRESH_AI_EVAL_CORPUS,
  expansion: EXPANSION_AI_EVAL_CORPUS,
  robustness: ROBUSTNESS_AI_EVAL_CORPUS,
  candidate: CANDIDATE_AI_EVAL_CORPUS,
  family: FAMILY_AI_EVAL_CORPUS,
  renewal: RENEWAL_AI_EVAL_CORPUS,
  owner_question: OWNER_QUESTION_CORPUS,
}

export const selectEvalCases = (options: {
  readonly corpus?: string
  readonly smoke?: boolean
  readonly split?: string
  readonly ids?: readonly string[]
}): readonly AiEvalCase[] => {
  const corpus = corpora[options.corpus ?? 'legacy']
  if (!corpus)
    throw new Error(
      'AI_EVAL_CORPUS must be legacy, fresh, expansion, robustness, candidate, family, renewal or owner_question.',
    )
  return corpus.filter(
    (testCase) =>
      (!options.smoke || testCase.smoke) &&
      (!options.split || testCase.split === options.split) &&
      (!options.ids?.length || options.ids.includes(testCase.id)),
  )
}

const capabilityChoiceKeys = new Set([
  'intent',
  'manager_action',
  'profile_field',
  'profile_operation',
  'selection_constraints',
  'migration_constraints',
])

export const getEvalCapabilityMetadata = (cases: readonly AiEvalCase[]) => {
  const entryPoints = [...new Set(cases.map(({ entryPoint }) => entryPoint))]
  return Object.fromEntries(
    entryPoints.map((entryPoint) => {
      const first = cases.find((testCase) => testCase.entryPoint === entryPoint)
      if (!first) throw new Error('Missing evaluation entry point')
      const { questions } = buildEvalRequest(first)
      return [
        entryPoint,
        {
          questions: Object.keys(questions).sort(),
          boundedChoices: Object.fromEntries(
            Object.entries(questions)
              .filter(([key]) => capabilityChoiceKeys.has(key))
              .map(([key, question]) => [
                key,
                Object.keys(question.criteria).sort(),
              ]),
          ),
        },
      ]
    }),
  )
}

const listProductionSource = async (
  sourceRoot: string,
  relativeDirectory = '',
): Promise<readonly string[]> => {
  const entries = await readdir(join(sourceRoot, relativeDirectory), {
    withFileTypes: true,
  })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = join(relativeDirectory, entry.name)
      if (entry.isDirectory())
        return listProductionSource(sourceRoot, relativePath)
      return entry.isFile() &&
        /\.tsx?$/.test(entry.name) &&
        !/\.(?:test|spec|stories|mock)\./.test(entry.name)
        ? [relativePath]
        : []
    }),
  )
  return nested.flat()
}

// Version 2 includes imported profile registries, validators, and preparation
// dependencies outside features/ai. Historical version 1 report hashes remain intact.
export const hashEvalSource = async (sourceRoot: string): Promise<string> => {
  const sourceFiles = [...(await listProductionSource(sourceRoot))].sort()
  const contents = await Promise.all(
    sourceFiles.map(
      async (file) =>
        `${file}\n${await readFile(join(sourceRoot, file), 'utf8')}`,
    ),
  )
  return createHash('sha256').update(contents.join('\n')).digest('hex')
}

export type StoredInitialResponse = {
  readonly body: unknown
  readonly sourceReport: string
  readonly sourceHash: string
  readonly requestHash: string
}

export const runLiveCase = async (
  testCase: AiEvalCase,
  key: string,
  fetcher: typeof fetch = fetch,
  storedInitial?: StoredInitialResponse,
  candidateVerification = false,
): Promise<EvalResult> => {
  const started = performance.now()
  const calls: EvalModelCall[] = []
  const callModel = async (
    request: unknown,
    phase: EvalModelCall['phase'],
  ): Promise<{ status: 'ok'; body: unknown } | { status: 'unavailable' }> => {
    const callStarted = performance.now()
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex')
    let body: unknown
    let reason: string | undefined
    try {
      const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(8000),
      })
      if (response.ok) body = await response.json()
      else reason = `http_${response.status}`
    } catch (error) {
      // Never serialize errors, headers or credentials into evaluation artifacts.
      reason =
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'timeout'
          : 'network_or_json_error'
    }
    calls.push({
      phase,
      source: 'provider',
      requestHash,
      latencyMs: Math.round(performance.now() - callStarted),
      ...(reason ? { error: reason } : { response: body }),
    })
    return reason ? { status: 'unavailable' } : { status: 'ok', body }
  }
  if (storedInitial)
    calls.push({
      phase: 'initial',
      source: 'stored',
      sourceReport: storedInitial.sourceReport,
      capturedSourceHash: storedInitial.sourceHash,
      requestHash: storedInitial.requestHash,
      response: storedInitial.body,
      latencyMs: 0,
    })
  const initial = storedInitial
    ? { status: 'ok' as const, body: storedInitial.body }
    : await callModel(buildEvalRequest(testCase), 'initial')
  const firstCall = calls[0]
  if (initial.status !== 'ok') {
    const baseline = providerFailure(
      testCase,
      firstCall?.error ?? 'unavailable',
      Math.round(performance.now() - started),
    )
    return { ...baseline, baseline, calls }
  }
  const baseline = evaluateResponse(
    testCase,
    initial.body,
    firstCall?.latencyMs ?? 0,
  )
  if (testCase.entryPoint === 'dashboard' || !candidateVerification)
    return { ...baseline, baseline, calls }
  // Production resolver chooses whether verification is needed. The harness never
  // retries a failure or alters confidence to trigger another provider call.
  const interpretation = await interpretAiModelResponse(
    initial.body,
    testCase.query,
    (request) => callModel(request, 'candidate_verification'),
  )
  const failedCall = calls.find((call) => call.error)
  const final = failedCall
    ? providerFailure(
        testCase,
        failedCall.error ?? 'verification_unavailable',
        Math.round(performance.now() - started),
      )
    : evaluateInterpretation(
        testCase,
        interpretation,
        initial.body,
        Math.round(performance.now() - started),
      )
  return { ...final, baseline, calls }
}

const shouldAbortBatch = (result: EvalResult): boolean =>
  result.actual.status === 'provider_error' &&
  ['http_401', 'http_403', 'http_429'].includes(result.actual.reason)

const batchAbortReason = (
  batch: readonly EvalResult[],
  stopOnIncorrectProposal: boolean | undefined,
): string | null => {
  const denied = batch.find(shouldAbortBatch)
  if (denied?.actual.status === 'provider_error')
    return `aborted_after_${denied.actual.reason}`
  if (!stopOnIncorrectProposal) return null
  const summary = summarizeEval(batch)
  return summary.incorrectProposals ||
    summary.incorrectConfirmationProposals ||
    summary.incorrectClarificationProposals
    ? 'aborted_after_incorrect_proposal'
    : null
}

export const runEvalCases = async (options: {
  readonly cases: readonly AiEvalCase[]
  readonly key: string
  readonly fetcher?: typeof fetch
  readonly storedInitials?: Readonly<Record<string, StoredInitialResponse>>
  readonly freshInitialIds?: readonly string[]
  readonly candidateVerification?: boolean
  readonly stopOnIncorrectProposal?: boolean
  readonly onResult?: (
    result: EvalResult,
    completed: number,
    total: number,
  ) => void
}): Promise<readonly EvalResult[]> => {
  if (
    options.storedInitials &&
    options.cases.some(
      (testCase) =>
        Boolean(options.storedInitials?.[testCase.id]) ===
        Boolean(options.freshInitialIds?.includes(testCase.id)),
    )
  )
    throw new Error(
      'Stored-response replay requires an initial response or explicit fresh-call selection for every selected case, never both.',
    )
  const results: EvalResult[] = []
  let index = 0
  while (index < options.cases.length) {
    // Verify provider access with one real case before starting bounded batches.
    const batchSize = index === 0 ? 1 : 3
    const cases = options.cases.slice(index, index + batchSize)
    const batch = await Promise.all(
      cases.map((testCase) =>
        runLiveCase(
          testCase,
          options.key,
          options.fetcher,
          options.storedInitials?.[testCase.id],
          options.candidateVerification,
        ),
      ),
    )
    for (const result of batch) {
      results.push(result)
      options.onResult?.(result, results.length, options.cases.length)
    }
    index += batch.length
    const reason = batchAbortReason(batch, options.stopOnIncorrectProposal)
    if (reason) {
      results.push(
        ...options.cases
          .slice(index)
          .map((testCase) => unattemptedCase(testCase, reason)),
      )
      break
    }
  }
  return results
}

export const runLiveEval = async (options: {
  readonly cases: readonly AiEvalCase[]
  readonly key: string
  readonly sourceRoot: string
  readonly outputDirectory: string
  readonly label: string
  readonly storedInitials?: Readonly<Record<string, StoredInitialResponse>>
  readonly freshInitialIds?: readonly string[]
  readonly candidateVerification?: boolean
  readonly stopOnIncorrectProposal?: boolean
  readonly onResult?: (
    result: EvalResult,
    completed: number,
    total: number,
  ) => void
}) => {
  const startedAt = new Date().toISOString()
  const sourceHash = await hashEvalSource(options.sourceRoot)
  const results = await runEvalCases(options)
  const sourceHashAfter = await hashEvalSource(options.sourceRoot)
  const summary = summarizeEval(results)
  const baselineSummary = summarizeEval(
    results.map((result) => result.baseline ?? result),
  )
  const verification = summarizeVerification(results)
  const requestHash = createHash('sha256')
    .update(JSON.stringify(options.cases.map(buildEvalRequest)))
    .digest('hex')
  const corpusHash = createHash('sha256')
    .update(JSON.stringify(options.cases))
    .digest('hex')
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    model: 'jev-latest',
    interpretationMode: options.candidateVerification
      ? 'experimental-conditional-candidate-verification'
      : 'production-single-call-parser',
    stopOnIncorrectProposal: options.stopOnIncorrectProposal ?? false,
    evidenceMode: options.storedInitials
      ? options.freshInitialIds?.length
        ? 'stored-and-explicit-fresh-initial-responses'
        : 'stored-initial-responses'
      : 'live-initial-responses',
    recapturedInitialIds: options.freshInitialIds ?? [],
    proposalClassification: 'manager-native-mutation-v2',
    capabilities: getEvalCapabilityMetadata(options.cases),
    sourceHashScope: 'manager-production-typescript-v2',
    sourceHash,
    sourceHashAfter,
    sourceChangedDuringRun: sourceHash !== sourceHashAfter,
    requestHash,
    corpusHash,
    label: options.label,
    summary,
    baselineSummary,
    verification,
    results,
  }
  const basename = `${startedAt.replace(/[:.]/g, '-')}-${options.label.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  await mkdir(options.outputDirectory, { recursive: true })
  const jsonPath = join(options.outputDirectory, `${basename}.json`)
  const markdownPath = join(options.outputDirectory, `${basename}.md`)
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  const lines = [
    `# Manager AI evaluation: ${options.label}`,
    '',
    `Model: jev-latest. Started: ${startedAt}.`,
    `Source SHA-256: ${sourceHash}`,
    `Source scope: manager-production-typescript-v2. Changed during run: ${sourceHash !== sourceHashAfter}.`,
    `Request SHA-256: ${requestHash}`,
    `Corpus SHA-256: ${corpusHash}`,
    '',
    `Initial-only exact outcomes: ${baselineSummary.passed}/${baselineSummary.evaluated}. Conditional verification calls: ${verification.verificationCalls}. Total provider calls: ${verification.totalProviderCalls}. Confirmations required: ${summary.confirmationRequired}; incorrect confirmation proposals: ${summary.incorrectConfirmationProposals}.`,
    '',
    `Exact outcomes: ${summary.passed}/${summary.evaluated}. Provider errors: ${summary.providerErrors}/${summary.total}. Not run after provider denial: ${summary.notRun}. Unsafe mutation proposals: ${summary.unsafeProposals}. Incorrect ready proposals: ${summary.incorrectProposals}. Incorrect clarification proposals: ${summary.incorrectClarificationProposals}.`,
    '',
    'Provider failures and unattempted cases are excluded from interpretation accuracy and reported separately. Passing a rejection never counts as success for a supported request.',
    '',
    '| Case | Split | Expected | Actual | Stage | Latency |',
    '| --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (result) =>
        `| ${result.id} | ${result.split} | ${JSON.stringify(result.expected)} | ${JSON.stringify(result.actual)} | ${result.stage} | ${result.latencyMs} ms |`,
    ),
    '',
  ]
  await writeFile(markdownPath, lines.join('\n'))
  return { report, jsonPath, markdownPath }
}
