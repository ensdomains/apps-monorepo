import { expect, test } from '@playwright/test'
import {
  captureHistoryFailure,
  historyFailureResult,
} from '../history-failure-evidence.js'

test('a loading history page remains blocked and its visible evidence is captured', async ({
  page,
}, info) => {
  await page.setContent('<main>Surfacing everything you need.</main>')
  const display = await captureHistoryFailure(
    page,
    info.outputPath('loading.png'),
  )
  expect(display.screen).toContain('Surfacing everything you need.')
  expect(display.screenshot).toBeTruthy()
  expect(
    historyFailureResult('Explorer history readiness', false, display),
  ).toBe('BLOCKED')
})

test('a loaded history error remains a failure before the timeline is ready', async ({
  page,
}, info) => {
  await page.setContent(
    '<main><h2>Error loading history</h2><p>Database request failed.</p></main>',
  )
  const display = await captureHistoryFailure(
    page,
    info.outputPath('error.png'),
  )
  expect(display.loadedHistoryError).toBe(true)
  expect(
    historyFailureResult('Explorer history readiness', false, display),
  ).toBe('FAIL')
})

test('the loaded route error also remains a failure', async ({
  page,
}, info) => {
  await page.setContent('<main><h2>Error loading page</h2></main>')
  const display = await captureHistoryFailure(
    page,
    info.outputPath('route-error.png'),
  )
  expect(
    historyFailureResult('Explorer history readiness', false, display),
  ).toBe('FAIL')
})

test('a missing transaction after the timeline loaded remains a failure', async ({
  page,
}, info) => {
  await page.setContent(
    '<main><h1>History</h1><button>Expand all</button></main>',
  )
  const display = await captureHistoryFailure(
    page,
    info.outputPath('timeline.png'),
  )
  expect(historyFailureResult('Explorer history display', false, display)).toBe(
    'FAIL',
  )
})

test('browser closure is blocked without hiding a separately confirmed API error', async ({
  page,
}, info) => {
  await page.close()
  const display = await captureHistoryFailure(
    page,
    info.outputPath('closed.png'),
  )
  expect(display.closed).toBe(true)
  expect(historyFailureResult('Explorer history display', false, display)).toBe(
    'BLOCKED',
  )
  expect(historyFailureResult('Explorer history display', true, display)).toBe(
    'FAIL',
  )
})
