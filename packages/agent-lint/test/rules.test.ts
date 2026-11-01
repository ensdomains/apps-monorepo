import { join } from 'node:path'
import { RuleTester } from '@typescript-eslint/rule-tester'
import { afterAll, describe, it } from 'vitest'
import { buttonType } from '../rules/buttonType.ts'
import { hoistPureHelpers } from '../rules/hoistPureHelpers.ts'
import { iconSizeClasses } from '../rules/iconSizeClasses.ts'
import { mustUseResult } from '../rules/mustUseResult.ts'
import { noForeignTestid } from '../rules/noForeignTestid.ts'
import { noNumberOnBigint } from '../rules/noNumberOnBigint.ts'
import { noSharedMutation } from '../rules/noSharedMutation.ts'
import { noSilentFallback } from '../rules/noSilentFallback.ts'
import { noThrow } from '../rules/noThrow.ts'
import { noUncheckedCast } from '../rules/noUncheckedCast.ts'

// RuleTester takes the test runner's hooks through static fields.
RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: join(import.meta.dirname, 'rule-fixtures'),
    },
  },
})

const results = `
import { err, ok, okAsync, type Result, type ResultAsync } from 'neverthrow'
const run = (): Result<number, Error> => ok(1)
const runAsync = (): ResultAsync<number, Error> => okAsync(1)
const fail = () => err(new Error('no'))
`

ruleTester.run('must-use-result', mustUseResult, {
  valid: [
    `${results} export const kept = run()`,
    `${results} export const returned = () => runAsync()`,
    `${results} export const matched = () => { run().match((n) => n, () => 0) }`,
    `${results} export const checked = () => { const r = run(); if (r.isErr()) return 0; return r.value }`,
    `${results} export function* composed() { const n = yield* run(); return n }`,
    `${results} let saved = run(); saved = fail(); export { saved }`,
    `${results} export function* guard() { yield* fail() }`,
    "export const unrelated = () => { console.log('not a Result') }",
  ],
  invalid: [
    { code: `${results} run()`, errors: [{ messageId: 'discarded' }] },
    { code: `${results} fail()`, errors: [{ messageId: 'discarded' }] },
    { code: `${results} runAsync()`, errors: [{ messageId: 'discarded' }] },
    {
      code: `${results} export const go = async () => { await runAsync() }`,
      errors: [{ messageId: 'discarded' }],
    },
    { code: `${results} void run()`, errors: [{ messageId: 'discarded' }] },
  ],
})

ruleTester.run('no-number-on-bigint', noNumberOnBigint, {
  valid: [
    "export const a = Number('1')",
    'export const b = Number(1)',
    'declare const text: string; export const c = Number(text)',
    'declare const wei: bigint; export const d = wei / 2n',
    // Times, ids, codes and counts, judged by the name of the argument.
    'declare const domain: { expiryDate: bigint }; export const e = Number(domain.expiryDate)',
    'declare const graceEndsAt: bigint; export const f = Number(graceEndsAt)',
    'declare const details: { duration: bigint } | undefined; export const g = Number(details?.duration ?? 0n)',
    'declare const domain: { chainId?: bigint } | undefined; export const h = Number(domain?.chainId)',
    // ... of the variable, property or function that keeps the number.
    'declare const coinType: bigint; export const chainId = Number(coinType & 0x7fffffffn)',
    'declare const value: bigint | number; export const timestamp = typeof value === "bigint" ? Number(value) : value',
    'declare const raw: bigint; export const domain = { chainId: Number(raw) }',
    'declare const parity: bigint; export const signature = { v: Number(parity) }',
    'export function decodeNameStatus(raw: string): number { return Number(BigInt(raw)) }',
    'export const decodeNameStatus = (raw: string): number => { return Number(BigInt(raw)) }',
    // ... or of the function the number is handed to.
    'declare function formatUtc(seconds: number): string; declare const value: bigint; export const label = formatUtc(Number(value))',
    // An amount scaled into the unit a person reads, once, at the edge.
    'declare const premium: bigint; declare const decimals: number; export const usd = Number(premium) / 10 ** decimals',
    'declare const price: bigint; export const whole = Number(price / 10n ** 8n)',
    // Already formatted: a string, not a bigint.
    'declare const formatEther: (wei: bigint) => string; declare const wei: bigint; export const eth = Number(formatEther(wei))',
  ],
  invalid: [
    {
      code: 'declare const wei: bigint; export const n = Number(wei)',
      errors: [{ messageId: 'converted' }],
    },
    {
      code: 'declare const maybe: bigint | undefined; export const n = Number(maybe)',
      errors: [{ messageId: 'converted' }],
    },
    {
      code: 'export const n = Number(10n ** 18n)',
      errors: [{ messageId: 'converted' }],
    },
    // Converted back into a bigint after float arithmetic.
    {
      code: 'declare const price: bigint; export const buffered = BigInt(Math.round(Number(price) * 1.05))',
      errors: [{ messageId: 'converted' }],
    },
    // Raw units added or compared as floats.
    {
      code: 'declare const a: bigint; declare const b: bigint; export const sum = Number(a) + Number(b)',
      errors: [{ messageId: 'converted' }, { messageId: 'converted' }],
    },
    {
      code: 'declare const balance: bigint; declare const limit: bigint; export const over = Number(balance) > Number(limit)',
      errors: [{ messageId: 'converted' }, { messageId: 'converted' }],
    },
    // A division that is not a scale by a power of ten.
    {
      code: 'declare const price: bigint; export const third = Number(price) / 3',
      errors: [{ messageId: 'converted' }],
    },
    {
      code: 'declare const price: bigint; export const eighth = Number(price) / 2 ** 3',
      errors: [{ messageId: 'converted' }],
    },
    {
      code: 'declare const price: bigint; declare const decimals: number; export const wrong = Number(price) * 10 ** decimals',
      errors: [{ messageId: 'converted' }],
    },
    // Reading through ?. and ?? does not make an amount a time.
    {
      code: 'declare const token: { amount: bigint } | undefined; export const amount = Number(token?.amount ?? 0n)',
      errors: [{ messageId: 'converted' }],
    },
    // A token id is 256 bits, and the names `update` and `price` are not times.
    {
      code: 'declare const tokenId: bigint; export const id = Number(tokenId)',
      errors: [{ messageId: 'converted' }],
    },
    {
      code: 'declare const update: bigint; export const u = Number(update)',
      errors: [{ messageId: 'converted' }],
    },
    // Handed to a function whose name says nothing about a time.
    {
      code: 'declare const amount: bigint; export const rounded = Math.round(Number(amount))',
      errors: [{ messageId: 'converted' }],
    },
  ],
})

ruleTester.run('icon-size-classes', iconSizeClasses, {
  valid: [
    {
      code: `import { Check } from 'lucide-react'; export const A = () => <Check className="size-4" />`,
      filename: 'react.tsx',
    },
    {
      code: 'const Box = (_p: { size: number }) => null; export const B = () => <Box size={2} />',
      filename: 'react.tsx',
    },
    {
      code: "import { Check } from './icons'; export const C = () => <Check size={16} />",
      filename: 'react.tsx',
    },
  ],
  invalid: [
    {
      code: "import { Check } from 'lucide-react'; export const A = () => <Check size={16} />",
      filename: 'react.tsx',
      errors: [{ messageId: 'prop', data: { prop: 'size' } }],
    },
    {
      code: "import { X as Close } from 'lucide-react'; export const B = () => <Close width={12} height={12} />",
      filename: 'react.tsx',
      errors: [
        { messageId: 'prop', data: { prop: 'width' } },
        { messageId: 'prop', data: { prop: 'height' } },
      ],
    },
  ],
})

const uiButton = "import { Button } from '@/components/ui/button';"

ruleTester.run('button-type', buttonType, {
  valid: [
    {
      code: `${uiButton} export const A = () => <Button type="button">Go</Button>`,
      filename: 'react.tsx',
    },
    {
      code: `${uiButton} export const B = () => <Button type="submit">Save</Button>`,
      filename: 'react.tsx',
    },
    {
      code: `${uiButton} export const C = ({ kind }: { readonly kind: 'button' | 'submit' }) => <Button type={kind}>Go</Button>`,
      filename: 'react.tsx',
    },
    {
      code: `${uiButton} export const D = () => <Button asChild><a href="/">Home</a></Button>`,
      filename: 'react.tsx',
    },
    {
      code: `${uiButton} export const E = () => <Button asChild={true}><a href="/">Home</a></Button>`,
      filename: 'react.tsx',
    },
    {
      code: `${uiButton} export const F = (props: { readonly onClick: () => void }) => <Button {...props}>Go</Button>`,
      filename: 'react.tsx',
    },
    {
      code: "import { Button } from './LocalButton'; export const G = () => <Button>Go</Button>",
      filename: 'react.tsx',
    },
    {
      code: 'const Button = (_p: { readonly children: string }) => null; export const H = () => <Button>Go</Button>',
      filename: 'react.tsx',
    },
    {
      code: "import { buttonVariants } from '@/components/ui/button'; export const classes = buttonVariants()",
      filename: 'react.tsx',
    },
  ],
  invalid: [
    {
      code: `${uiButton} export const A = () => <Button onClick={() => {}}>Go</Button>`,
      filename: 'react.tsx',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: "import { Button as UiButton } from '@/components/ui/button'; export const B = () => <UiButton>Go</UiButton>",
      filename: 'react.tsx',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: 'import { Button } from \'../ui/button\'; export const C = () => <Button variant="outline">Go</Button>',
      filename: 'react.tsx',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `${uiButton} export const D = () => <Button asChild={false}>Go</Button>`,
      filename: 'react.tsx',
      errors: [{ messageId: 'missing' }],
    },
    {
      code: `${uiButton} export const E = () => <><Button>Yes</Button><Button type="button">No</Button><Button>Later</Button></>`,
      filename: 'react.tsx',
      errors: [{ messageId: 'missing' }, { messageId: 'missing' }],
    },
  ],
})

ruleTester.run('no-shared-mutation', noSharedMutation, {
  valid: [
    'export const build = () => { const out: number[] = []; out.push(1); return out }',
    'export const fill = () => { const o: { a?: number } = {}; o.a = 1; return o }',
    'export const set = (ref: { current: number }) => { ref.current = 1 }',
    "const Card = () => null; Card.displayName = 'Card'; export { Card }",
    "export const title = () => { document.title = 'x' }",
    'export const size = (canvas: HTMLCanvasElement) => { canvas.width = 3 }',
    'export class Box { x = 0; constructor() { this.x = 1 } }',
    "const cache = new Map<string, number>(); export const remember = () => { cache.set('a', 1) }",
  ],
  invalid: [
    {
      code: 'export const add = (xs: number[]) => { xs.push(1) }',
      errors: [{ messageId: 'shared', data: { owner: 'the parameter `xs`' } }],
    },
    {
      code: 'export const write = (o: { a: number }) => { o.a = 2 }',
      errors: [{ messageId: 'shared' }],
    },
    {
      code: 'const xs: number[] = []; export const add = () => { xs.push(1) }',
      errors: [
        { messageId: 'shared', data: { owner: 'the module-level `xs`' } },
      ],
    },
    {
      code: 'export const make = () => { const xs: number[] = []; return () => { xs.push(1) } }',
      errors: [{ messageId: 'shared' }],
    },
    {
      code: 'export const drop = (o: { a?: number }) => { delete o.a }',
      errors: [{ messageId: 'shared' }],
    },
    {
      code: 'export class Box { x = 0; bump() { this.x = 1 } }',
      errors: [{ messageId: 'shared', data: { owner: '`this`' } }],
    },
    {
      code: 'export const merge = (o: object) => Object.assign(o, { a: 1 })',
      errors: [{ messageId: 'shared' }],
    },
  ],
})

ruleTester.run('hoist-pure-helpers', hoistPureHelpers, {
  valid: [
    'export const Card = (p: { name: string }) => { const greet = () => p.name; return greet() }',
    'export const Card = () => { const n = 2; const twice = () => n * 2; return twice() }',
    "export const helper = () => { const inner = (s: string) => s; return inner('x') }",
    'export const Card = () => { let release = () => {}; release = () => {}; return release }',
    'export const useSame = <T,>(x: T) => { const same = (y: T) => y; return same(x) }',
    'export const Card = (p: { readonly ids: ReadonlyArray<number> }) => p.ids.map((id) => id + 1)',
  ],
  invalid: [
    {
      code: "export const Card = () => { const format = (s: string) => s.toUpperCase(); return format('a') }",
      errors: [{ messageId: 'hoist', data: { owner: 'this component' } }],
    },
    {
      code: 'export const useLabel = () => { const toKey = (n: number) => String(n); return toKey(1) }',
      errors: [{ messageId: 'hoist', data: { owner: 'this hook' } }],
    },
  ],
})

ruleTester.run('no-unchecked-cast', noUncheckedCast, {
  valid: [
    'export const widened = 1 as number',
    "export const tuple = ['a'] as const",
    'declare const fromPromise: <T, E>(p: Promise<T>, map: (e: unknown) => E) => unknown; class XError extends Error {}; export const r = fromPromise(Promise.resolve(1), (e) => e as XError)',
    'export const machine = { types: { context: {} as { readonly a: number } } }',
    "type Style = { readonly color?: string }; export const style = { '--phone-top': '4px' } as Style",
    'declare const loose: any; export const s = loose as string',
  ],
  invalid: [
    {
      code: 'declare const value: unknown; export const s = value as string',
      errors: [{ messageId: 'narrowing' }],
    },
    {
      code: 'declare const either: number | string; export const n = either as number',
      errors: [{ messageId: 'narrowing' }],
    },
  ],
})

ruleTester.run('no-foreign-testid', noForeignTestid, {
  valid: [
    {
      code: 'const Stub = () => <div data-testid="save" />; declare const screen: { getByTestId: (id: string) => unknown }; export const a = screen.getByTestId(\'save\'); export { Stub }',
      filename: 'react.tsx',
    },
    {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this string is source code for the rule tester, and its template literal is the case under test
      code: "const Row = (p: { readonly i: number }) => <div data-testid={`row-${p.i}`} />; declare const screen: { getByTestId: (id: string) => unknown }; export const b = screen.getByTestId('row-1'); export { Row }",
      filename: 'react.tsx',
    },
    {
      code: "declare const container: { querySelector: (s: string) => unknown }; export const c = container.querySelector('img')",
      filename: 'react.tsx',
    },
  ],
  invalid: [
    {
      code: "declare const screen: { getByTestId: (id: string) => unknown }; export const a = screen.getByTestId('save')",
      filename: 'react.tsx',
      errors: [{ messageId: 'testid' }],
    },
    {
      code: "declare const container: { querySelector: (s: string) => unknown }; export const b = container.querySelector('.btn')",
      filename: 'react.tsx',
      errors: [{ messageId: 'selector' }],
    },
  ],
})

ruleTester.run('no-silent-fallback', noSilentFallback, {
  valid: [
    // A reason inside the catch.
    'export const a = (u: string) => { try { return new URL(u).host } catch { /* not a URL: no host to compare */ return undefined } }',
    // A reason above the try.
    `export const b = (u: string) => {
      // An address that does not parse is not ours, so the answer is no.
      try { return new URL(u).host === 'x' } catch { return false }
    }`,
    // A reason in the doc of the function around it.
    `/**
     * A Vite dev server always serves its client; a production build never does.
     */
    export const c = async (get: () => Promise<{ status(): number }>) => {
      const response = await get().catch(() => null)
      return response?.status() === 200
    }`,
    // A reason above the expression, inside an array.
    `declare const load: () => Promise<number>
    export const d = () => Promise.all([
      // An unreadable value is shown as unknown, so the page still loads.
      load().catch(() => null),
    ])`,
    // The error is used, or the catch does more than give up.
    'export const e = () => { try { return 1 } catch (error) { return { error } } }',
    'export const f = () => { try { return 1 } catch { return { ok: false } } }',
    'declare const log: (m: string) => void; export const g = () => { try { return 1 } catch { log("failed"); return 0 } }',
    // A discarded `.catch` is no-empty-catch's.
    'declare const p: Promise<void>; export const h = () => { p.catch(() => undefined) }',
    'declare const p: Promise<void>; export const i = async () => { await p.catch(() => null) }',
    // A named default is a deliberate choice.
    'declare const FALLBACK: number; export const j = (s: string) => { try { return Number(s) } catch { return FALLBACK } }',
  ],
  invalid: [
    {
      code: 'export const a = (u: string) => { try { return new URL(u).host } catch { return false } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      code: 'export const b = (s: string) => { try { return JSON.parse(s) as unknown } catch (error) { return undefined } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      code: 'declare const p: Promise<unknown>; export const c = async () => { const body = await p.catch(() => undefined); return body }',
      errors: [{ messageId: 'silent' }],
    },
    {
      code: 'export const d = (xs: string[]) => { for (const x of xs) { try { JSON.parse(x) } catch { continue } } }',
      errors: [{ messageId: 'silent' }],
    },
    {
      code: 'export const e = (s: string) => { let v: unknown = null; try { v = JSON.parse(s) } catch { v = null }; return v }',
      errors: [{ messageId: 'silent' }],
    },
    {
      // A short comment is not a reason.
      code: 'export const f = () => { try { return 1 } catch { /* nope */ return 0 } }',
      errors: [{ messageId: 'silent' }],
    },
  ],
})

const tagged = `
class NotFound extends Error { readonly _tag = 'NotFound' }
class Refused extends Error { readonly _tag = 'Refused' }
`

ruleTester.run('no-throw', noThrow, {
  valid: [
    // TanStack Router's control flow, anywhere.
    `import { redirect } from '@tanstack/react-router'
    export const a = { beforeLoad: () => { throw redirect({ to: '/' }) } }`,
    `import { notFound } from '@tanstack/react-router'
    export const b = () => { throw notFound() }`,
    // A TaggedError where a library expects a throw.
    `${tagged} export const c = { queryFn: async () => { throw new NotFound() } }`,
    `${tagged} export const d = { mutationFn: (url: string) => fetch(url).then((response) => { if (!response.ok) throw new Refused(); return response }) }`,
    `${tagged} export const e = { loader() { throw new NotFound() } }`,
    `import { fromPromise as fromPromiseXState } from 'xstate'
    ${tagged} export const f = fromPromiseXState(async () => { throw new Refused() })`,
    `import { createServerFn } from '@tanstack/react-start'
    ${tagged} export const g = createServerFn({ method: 'POST' }).handler(async () => { throw new Refused() })`,
    `${tagged} export const h = { queryFn: (error: NotFound | Refused) => { throw error } }`,
    'export const i = { queryFn: <E extends { readonly _tag: string }>(error: E) => { throw error } }',
    // Passed by name to a library that expects a throw.
    `import { createServerFn } from '@tanstack/react-start'
    ${tagged}
    const validate = (input: unknown): string => { if (typeof input !== 'string') throw new Refused(); return input }
    export const l = createServerFn({ method: 'POST' }).validator(validate).handler(async ({ data }) => data)`,
    `${tagged} function load(): never { throw new NotFound() } export const m = { queryFn: load }`,
    // A Worker's scheduled run fails by throwing.
    `${tagged} declare const job: () => Promise<{ match<T>(ok: () => T, fail: (error: Refused) => T): Promise<T> }>
    export default { scheduled: async () => { await (await job()).match(() => undefined, (error) => { throw error }) } }`,
    // Hono answers an HTTPException with its status.
    `import { HTTPException } from 'hono/http-exception'
    export const n = () => { throw new HTTPException(404, { message: 'no such wallet' }) }`,
    // A guarded \`throw result.error\` is no-throw-result-error's.
    'declare const result: { isErr(): boolean; error: Error }; export const j = () => { if (result.isErr()) throw result.error }',
    'declare const result: { isOk(): boolean; error: Error }; export const k = () => { if (!result.isOk()) { throw result.error } }',
  ],
  invalid: [
    {
      code: "export const a = (n: number) => { if (n < 0) throw new Error('negative'); return n }",
      errors: [{ messageId: 'thrown' }],
    },
    {
      code: "declare const key: string | undefined; if (!key) throw new Error('the key is set at build time')",
      errors: [{ messageId: 'thrown' }],
    },
    {
      // A failure thrown out of band through a promise chain.
      code: "export const b = () => fetch('/x').then((response) => { if (!response.ok) throw new Error('the host refused'); return response })",
      errors: [{ messageId: 'thrown' }],
    },
    {
      code: "export const c = () => { try { return JSON.parse('x') as unknown } catch (error) { throw error } }",
      errors: [{ messageId: 'thrown' }],
    },
    {
      // A TaggedError outside a library callback is still a value.
      code: `${tagged} export const d = (found: boolean) => { if (!found) throw new NotFound() }`,
      errors: [{ messageId: 'thrown' }],
    },
    {
      // Not TanStack's redirect.
      code: "const redirect = (to: string) => new Error(to); export const e = () => { throw redirect('/') }",
      errors: [{ messageId: 'thrown' }],
    },
    {
      // neverthrow's fromPromise is not an actor.
      code: "import { fromPromise } from 'neverthrow'; export const f = fromPromise(Promise.resolve(1), () => { throw new Error('mapped') })",
      errors: [{ messageId: 'thrown' }],
    },
    {
      code: 'declare const result: { error: Error }; export const g = () => { throw result.error }',
      errors: [{ messageId: 'thrown' }],
    },
    {
      // Not Hono's HTTPException.
      code: "class HTTPException extends Error {}; export const o = () => { throw new HTTPException('teapot') }",
      errors: [{ messageId: 'thrown' }],
    },
    {
      // A named function that no library calls.
      code: `${tagged} const check = (found: boolean) => { if (!found) throw new NotFound() }; export const n = () => check(false)`,
      errors: [{ messageId: 'thrown' }],
    },
    {
      code: "export const h = { queryFn: async () => { throw new Error('no data') } }",
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: `import { fromPromise } from 'xstate'
      export const i = fromPromise(async () => { throw new Error('failed') })`,
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: `${tagged} export const j = { mutationFn: (error: NotFound | Error) => { throw error } }`,
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: "export const k = { queryFn: async () => { throw 'no data' } }",
      errors: [{ messageId: 'untagged' }],
    },
  ],
})
