import assert from 'node:assert/strict'
import { createBignameMock } from '../helpers/mock-bigname.js'

// The chain can be years ahead of the host while testing independent grace
// cases. Discovery must agree with that checkpoint, not the laptop clock.
const expiry = 2_000_000_000
const owner = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
let chainNow = expiry - 1
const mock = createBignameMock({ nowSeconds: () => chainNow })
mock.addName({
  name: 'v1-clock-test.eth',
  owner,
  protocol: 'v1',
  expiryDate: expiry,
})
mock.addName({
  name: 'v2-clock-test.eth',
  owner,
  protocol: 'v2',
  expiryDate: expiry,
})
let handler: (route: any) => Promise<void>
await mock.install({
  route: async (_pattern: unknown, value: typeof handler) => {
    handler = value
  },
} as any)
async function lookup(name: string) {
  let answer: any
  await handler!({
    request: () => ({
      method: () => 'GET',
      url: () => `http://localhost:9999/v1/names/${name}`,
      postData: () => null,
    }),
    fulfill: async (response: any) => {
      answer = response
    },
  })
  assert.equal(answer.status, 200)
  return answer.json.data
}
assert.equal((await lookup('v2-clock-test.eth')).status, 'active')
chainNow = expiry + 1
const v2 = await lookup('v2-clock-test.eth')
assert.equal(v2.status, 'expired')
assert.equal(v2.owner, undefined)
assert.equal(v2.lapsed_registration.owner, owner.toLowerCase())
assert.equal(Number(v2.grace_ends_at), expiry + 28 * 86400)
const v1 = await lookup('v1-clock-test.eth')
assert.equal(v1.status, 'expired')
assert.equal(v1.owner, owner.toLowerCase())
assert.equal(v1.authority, 'ens_v1')
assert.equal(Number(v1.grace_ends_at), expiry + 90 * 86400)
console.log(
  'PASS: fixture discovery uses the chain checkpoint, preserves V1 grace ownership and V2 former ownership, and uses the correct grace duration per protocol.',
)
