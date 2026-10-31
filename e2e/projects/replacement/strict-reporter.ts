import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'

/** Known failures and runtime skips cannot turn this replacement gate green. */
export default class StrictReporter implements Reporter {
  private readonly outcomes: {
    title: string
    status: string
    expectedStatus: string
  }[] = []
  onTestEnd(test: TestCase, result: TestResult) {
    this.outcomes.push({
      title: test.titlePath().join(' > '),
      status: result.status,
      expectedStatus: test.expectedStatus,
    })
    const directory = process.env.REPLACEMENT_RESULTS
    if (directory) {
      mkdirSync(directory, { recursive: true })
      writeFileSync(
        resolve(directory, 'progress-results.json'),
        JSON.stringify(this.outcomes, null, 2),
      )
    }
  }
  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    // Collection has no test outcomes, but syntax/import/eligibility errors
    // must retain Playwright's failing exit status.
    if (process.argv.includes('--list'))
      return { status: result.status === 'passed' ? 'passed' : 'failed' }
    const directory =
      process.env.REPLACEMENT_RESULTS ?? resolve('test-results/replacement')
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      resolve(directory, 'strict-results.json'),
      JSON.stringify(this.outcomes, null, 2),
    )
    return {
      status:
        result.status === 'passed' &&
        this.outcomes.length > 0 &&
        this.outcomes.every((r) => r.status === 'passed')
          ? 'passed'
          : 'failed',
    }
  }
}
