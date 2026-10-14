import assert from 'node:assert/strict'
import { createECDH } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  generateCredentials,
  writeCredentials,
} from './generate-credentials.mjs'

test('generates matching raw P-256 keys and a 512-bit JWT secret', () => {
  const credentials = generateCredentials()
  const privateKey = Buffer.from(credentials.VAPID_PRIVATE_KEY, 'base64url')
  const publicKey = Buffer.from(credentials.VAPID_PUBLIC_KEY, 'base64url')
  assert.equal(privateKey.length, 32)
  assert.equal(publicKey.length, 65)
  const ec = createECDH('prime256v1')
  ec.setPrivateKey(privateKey)
  // Compare without printing key material if the assertion fails.
  assert(ec.getPublicKey().equals(publicKey))
  assert.equal(Buffer.from(credentials.JWT_SECRET, 'base64url').length, 64)
})

test('writes independent private files and refuses to overwrite them', () => {
  const parent = mkdtempSync(join(tmpdir(), 'api-worker-credentials-test-'))
  const directory = join(parent, 'keys')
  try {
    writeCredentials(directory)
    const mainnetPath = join(directory, 'mainnet.json')
    const mainnetText = readFileSync(mainnetPath, 'utf8')
    const mainnet = JSON.parse(mainnetText)
    const sepolia = JSON.parse(
      readFileSync(join(directory, 'sepolia.json'), 'utf8'),
    )
    assert(mainnet.VAPID_PUBLIC_KEY !== sepolia.VAPID_PUBLIC_KEY)
    assert(mainnet.JWT_SECRET !== sepolia.JWT_SECRET)
    assert.equal(statSync(directory).mode & 0o777, 0o700)
    assert.equal(statSync(mainnetPath).mode & 0o777, 0o600)
    assert.throws(() => writeCredentials(directory), { code: 'EEXIST' })
    assert(readFileSync(mainnetPath, 'utf8') === mainnetText)
  } finally {
    rmSync(parent, { recursive: true })
  }
})
