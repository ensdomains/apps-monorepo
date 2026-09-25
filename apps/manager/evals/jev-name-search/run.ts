import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'
import {
  executeJevNameSearch,
  validateNameSearchInput,
} from '../../src/features/dashboard/service/executeJevNameSearch'
import { looksLikeJevNameSearchRequest } from '../../src/features/dashboard/service/jevNameSearchRouting'

const filtersSchema = v.strictObject({
  expiry: v.optional(
    v.picklist([
      'expiring',
      'active',
      'expired',
      'in-grace',
      'past-grace',
      'non-expiring',
    ]),
  ),
  withinDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  role: v.optional(v.picklist(['owner', 'manager'])),
  version: v.optional(v.picklist(['v1', 'v2'])),
  upgrade: v.optional(v.picklist(['eligible', 'ineligible'])),
  favorite: v.optional(v.picklist(['yes', 'no'])),
  primary: v.optional(v.picklist(['yes', 'no'])),
  sort: v.optional(
    v.picklist([
      'name-asc',
      'name-desc',
      'created-asc',
      'created-desc',
      'expiry-asc',
      'expiry-desc',
    ]),
  ),
})

const caseSchema = v.object({
  id: v.string(),
  reviewStatus: v.picklist(['pending', 'approved', 'rejected']),
  query: v.string(),
  expectedRoute: v.picklist(['interpret', 'literal_name_search']),
  expectedAction: v.nullable(
    v.picklist(['apply_filters', 'fallback_unsupported']),
  ),
  expectedFilters: v.nullable(filtersSchema),
})

const datasetSchema = v.object({
  datasetVersion: v.string(),
  evaluationBoundary: v.literal('query_to_interpretation_result'),
  cases: v.array(caseSchema),
})

type EvalCase = v.InferOutput<typeof caseSchema>

const evalDirectory = dirname(fileURLToPath(import.meta.url))
const managerDirectory = resolve(evalDirectory, '../..')
const cliArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== '--')
const includePending = cliArguments.includes('--include-pending')
const unsupportedFlags = cliArguments.filter(
  (argument) => argument.startsWith('--') && argument !== '--include-pending',
)
if (unsupportedFlags.length > 0) {
  throw new Error(`Unsupported argument: ${unsupportedFlags[0]}`)
}
const datasetFileName =
  cliArguments.find((argument) => !argument.startsWith('--')) ??
  'base-candidates.json'
if (datasetFileName.includes('/') || datasetFileName.includes('\\')) {
  throw new Error('Dataset argument must be a file name in the eval directory.')
}
const datasetPath = join(evalDirectory, datasetFileName)
const resultsDirectory = join(evalDirectory, 'results')

const loadApiKey = (): string => {
  if (!process.env.JEV_API_KEY) {
    const devVarsPath = join(managerDirectory, '.dev.vars')
    if (existsSync(devVarsPath)) loadEnvFile(devVarsPath)
  }
  const apiKey = process.env.JEV_API_KEY
  if (!apiKey) {
    throw new Error(
      'JEV_API_KEY is not set. Add it to the shell or apps/manager/.dev.vars.',
    )
  }
  return apiKey
}

const validateCases = (cases: readonly EvalCase[]) => {
  if (cases.length === 0) throw new Error('No eval cases selected.')
  const caseIds = new Set<string>()
  for (const evalCase of cases) {
    if (caseIds.has(evalCase.id)) {
      throw new Error(`Duplicate eval case ID: ${evalCase.id}`)
    }
    caseIds.add(evalCase.id)
    validateNameSearchInput({ query: evalCase.query })
  }
}

const matchesExpectedAction = ({
  expectedAction,
  expectedFilters,
  actualStatus,
  actualFilters,
}: {
  expectedAction: EvalCase['expectedAction']
  expectedFilters: EvalCase['expectedFilters']
  actualStatus: string
  actualFilters: EvalCase['expectedFilters']
}): boolean =>
  (expectedAction === 'apply_filters' &&
    actualStatus === 'ok' &&
    isDeepStrictEqual(actualFilters, expectedFilters)) ||
  (expectedAction === 'fallback_unsupported' && actualStatus === 'unsupported')

const runCase = async (evalCase: EvalCase, apiKey: string) => {
  const actualRoute = looksLikeJevNameSearchRequest(evalCase.query)
    ? 'interpret'
    : 'literal_name_search'
  if (actualRoute === 'literal_name_search') {
    const passed = evalCase.expectedRoute === actualRoute
    console.log(`${evalCase.id}: ${passed ? 'pass' : 'review'} (not called)`)
    return {
      caseId: evalCase.id,
      query: evalCase.query,
      expectedRoute: evalCase.expectedRoute,
      expectedAction: evalCase.expectedAction,
      expectedFilters: evalCase.expectedFilters,
      actualRoute,
      actualStatus: 'not_called',
      actualFilters: null,
      passed,
      failureReason: passed ? undefined : 'route_mismatch',
      requestedModel: undefined,
      questionSetVersion: undefined,
      policyVersion: undefined,
      returnedModel: undefined,
      answers: undefined,
      usage: undefined,
      latencyMs: 0,
    }
  }

  const startedAt = performance.now()
  const actual = await executeJevNameSearch({
    input: { query: evalCase.query },
    apiKey,
  })
  const actualFilters = actual.status === 'ok' ? actual.filters : null
  const routeMatches = evalCase.expectedRoute === actualRoute
  const actionMatches = matchesExpectedAction({
    expectedAction: evalCase.expectedAction,
    expectedFilters: evalCase.expectedFilters,
    actualStatus: actual.status,
    actualFilters,
  })
  const passed = routeMatches && actionMatches
  let failureReason: string | undefined
  if (!routeMatches) failureReason = 'route_mismatch'
  else if (!passed) {
    failureReason = actual.status === 'ok' ? 'filter_mismatch' : actual.reason
  }
  console.log(`${evalCase.id}: ${passed ? 'pass' : 'review'}`)
  return {
    caseId: evalCase.id,
    query: evalCase.query,
    expectedRoute: evalCase.expectedRoute,
    expectedAction: evalCase.expectedAction,
    expectedFilters: evalCase.expectedFilters,
    actualRoute,
    actualStatus: actual.status,
    actualFilters,
    passed,
    failureReason,
    requestedModel: actual.evidence.requestedModel,
    questionSetVersion: actual.evidence.questionSetVersion,
    policyVersion: actual.evidence.policyVersion,
    returnedModel: actual.evidence.returnedModel,
    answers: actual.evidence.answers,
    usage: actual.evidence.usage,
    latencyMs: Math.round(performance.now() - startedAt),
  }
}

const main = async () => {
  const dataset = v.parse(
    datasetSchema,
    JSON.parse(readFileSync(datasetPath, 'utf8')),
  )
  const cases = dataset.cases.filter(
    ({ reviewStatus }) =>
      reviewStatus === 'approved' ||
      (includePending && reviewStatus === 'pending'),
  )
  validateCases(cases)

  const apiKey = loadApiKey()
  const results = []
  for (const evalCase of cases) results.push(await runCase(evalCase, apiKey))

  const unavailable = results.filter(
    ({ actualStatus }) => actualStatus === 'unavailable',
  ).length
  const passed = results.filter((result) => result.passed).length
  const inputTokens = results.reduce(
    (total, result) => total + (result.usage?.inputTokens ?? 0),
    0,
  )
  const outputTokens = results.reduce(
    (total, result) => total + (result.usage?.outputTokens ?? 0),
    0,
  )
  const report = {
    datasetVersion: dataset.datasetVersion,
    runAt: new Date().toISOString(),
    summary: {
      includedPendingCases: includePending,
      total: results.length,
      passed,
      needsReview: results.length - passed,
      unavailable,
      inputTokens,
      outputTokens,
      returnedModels: [
        ...new Set(
          results.flatMap(({ returnedModel }) =>
            returnedModel ? [returnedModel] : [],
          ),
        ),
      ],
    },
    results,
  }

  mkdirSync(resultsDirectory, { recursive: true })
  const timestamp = report.runAt.replaceAll(':', '-').replaceAll('.', '-')
  const datasetSlug = dataset.datasetVersion
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
  const outputPath = join(resultsDirectory, `${datasetSlug}-${timestamp}.json`)
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Report: ${outputPath}`)
  console.log(
    `Summary: ${passed}/${results.length} passed, ${unavailable} unavailable`,
  )
  if (unavailable > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Eval run failed.')
  process.exitCode = 1
})
