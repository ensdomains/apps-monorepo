declare const logger: {
  readonly error: (...args: ReadonlyArray<unknown>) => void
  readonly info: (...args: ReadonlyArray<unknown>) => void
}

// Developer log text: flagged, in a string, a template and a multi-line call.
console.log('Saved ✅') // expect: no-emoji
console.warn(`Retrying ⚠️ ${1}`) // expect: no-emoji
logger.info('Started 🚀') // expect: no-emoji
logger.error(
  'Failed',
  '❌ details', // expect: no-emoji
  { cause: 'plain' },
)

// Text a user reads: allowed.
export const message = '⚠️ Your name expires soon'
export const Banner = () => <p>Welcome 👋</p>
export const Face = () => <span title="😌">hello</span>

// Text glyphs are not emoji, and a log call without an emoji is fine.
console.log('Saved ✓')
logger.info('Done')
export const close = '✕'
