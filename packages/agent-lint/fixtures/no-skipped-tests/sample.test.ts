declare const it: { (t: string, f: () => void): void; skip: (t: string, f: () => void) => void }
declare const describe: { skip: (t: string, f: () => void) => void }
declare const test: { skip: (condition: boolean, reason: string) => void }
declare const xit: (t: string, f: () => void) => void
declare const isEnabled: boolean
it.skip('flaky', () => {}) // expect: no-skipped-tests
describe.skip('suite', () => {}) // expect: no-skipped-tests
xit('old', () => {}) // expect: no-skipped-tests
test.skip(!isEnabled, 'needs the mock indexer')
it('runs', () => {})
